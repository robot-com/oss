/** biome-ignore-all lint/suspicious/noExplicitAny: required for type inference */

import { type JetStreamClient, jetstream } from '@nats-io/jetstream'
import { headers, type NatsConnection } from '@nats-io/nats-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { v7 as uuidv7 } from 'uuid'
import type z from 'zod'
import type { ZodType } from 'zod'
import type {
    AppDefinition,
    MutationDefinition,
    QueryDefinition,
    QueueConfig,
} from '../types'
import { buildPath, type PathToParams } from '../types/path-to-params'
import { RBFError } from './error'
import { handleMessage } from './handle-message'

// type NonEmptyString = string & {
//     readonly NonEmptyString: unique symbol
// }

// type NonEmptyRecord<K extends string, V> = Record<K, V> & {
//     [P in K]: V extends string ? (string extends V ? NonEmptyString : V) : V
// }

export type JetstreamConfig = {
    streamNamePrefix?: string
    consumerNamePrefix?: string
    subjectPrefix?: string
}

export type BackendOptions<
    S extends Record<string, unknown> = Record<string, unknown>,
> = {
    db: PostgresJsDatabase<S>
    nats: NatsConnection
    jetstream?: JetstreamConfig
    inboxAddress?: string
}

export class Backend<TApp extends AppDefinition<any, any, any, any, any, any>> {
    app: TApp
    db: PostgresJsDatabase<TApp['_schema']>
    nats: NatsConnection
    jetstreamClient: JetStreamClient
    subjectPrefix: string
    private streamNamePrefix: string
    private consumerNamePrefix: string
    private abortController: AbortController | null = null
    private inboxAddress: string
    private pendingRequests: Map<
        string,
        { resolve: (data: any) => void; reject: (error: RBFError) => void }
    > = new Map()
    private pendingPromises: Set<Promise<unknown>> = new Set()

    onError?: (error: Error) => void

    constructor(app: TApp, opts: BackendOptions<TApp['_schema']>) {
        this.app = app
        this.db = opts.db
        this.nats = opts.nats
        this.jetstreamClient = jetstream(opts.nats)
        this.inboxAddress = opts.inboxAddress ?? `_INBOX_${uuidv7()}`

        this.streamNamePrefix = opts.jetstream?.streamNamePrefix ?? ''
        this.consumerNamePrefix = opts.jetstream?.consumerNamePrefix ?? ''
        this.subjectPrefix = opts.jetstream?.subjectPrefix ?? ''
    }

    private async startInbox(): Promise<void> {
        const sub = this.nats.subscribe(`${this.inboxAddress}.*`)

        this.abortController!.signal.addEventListener('abort', () => {
            sub.unsubscribe()
        })

        for await (const msg of sub) {
            if (msg.subject.startsWith(this.inboxAddress)) {
                const requestId = msg.subject.slice(
                    this.inboxAddress.length + 1,
                )

                const req = this.pendingRequests.get(requestId)

                if (!req) {
                    continue
                }

                const statusCode = msg.headers?.get('Status-Code')
                if (!statusCode) {
                    req.reject(
                        new RBFError(
                            'INTERNAL_SERVER_ERROR',
                            'Missing Status-Code header',
                        ),
                    )
                }

                const data = msg.json() as any

                if (statusCode !== '200') {
                    req.reject(
                        new RBFError(
                            data.code ?? 'INTERNAL_SERVER_ERROR',
                            data.message ?? 'Internal server error',
                        ),
                    )
                }

                req.resolve(data)
            }
        }
    }

    private async startQueue(
        streamName: string,
        consumerName: string,
        subject: string,
    ) {
        const consumer = await this.jetstreamClient.consumers.get(
            streamName,
            consumerName,
        )

        if (!this.abortController) {
            return
        }

        const iter = await consumer.consume({ max_messages: 1 })

        this.abortController.signal.addEventListener('abort', () => {
            iter.close()
        })

        for await (const m of iter) {
            if (!this.abortController) {
                break
            }

            const handleMessagePromise = handleMessage(this, m, subject).catch(
                (error) => {
                    this.onError?.(error)
                },
            )

            this.pendingPromises.add(handleMessagePromise)

            handleMessagePromise.finally(() => {
                this.pendingPromises.delete(handleMessagePromise)
            })
        }
    }

    async start(): Promise<void> {
        if (this.abortController) {
            throw new Error('Backend already started')
        }

        this.abortController = new AbortController()

        this.startInbox()
        Object.entries(this.app._queues as Record<string, QueueConfig>).forEach(
            ([defaultName, queue]) => {
                const streamName = `${this.streamNamePrefix ?? ''}${queue.streamName ?? defaultName}`
                const consumerName = `${this.consumerNamePrefix ?? ''}${queue.consumerName ?? queue.streamName ?? defaultName}`
                const subject = `${this.subjectPrefix ?? ''}${queue.subject ?? ''}`

                const startQueuePromise = this.startQueue(
                    streamName,
                    consumerName,
                    subject,
                ).catch((error) => {
                    this.abortController?.abort()
                    this.onError?.(error)
                })

                this.pendingPromises.add(startQueuePromise)

                startQueuePromise
                startQueuePromise.finally(() => {
                    this.pendingPromises.delete(startQueuePromise)
                })
            },
        )
    }

    async stop(): Promise<void> {
        if (!this.abortController) {
            throw new Error('Backend not started')
        }

        this.abortController.abort()
        this.abortController = null

        await Promise.allSettled(this.pendingPromises)
    }

    async request<T = any>(
        topic: string,
        options: {
            requestId?: string
            signal?: AbortSignal
            input: unknown
            headers?: Record<string, string>
        },
    ): Promise<T> {
        const fullTopic = `${this.subjectPrefix ?? ''}${topic}`

        const requestId = options.requestId ?? uuidv7()

        const { promise, resolve, reject } = Promise.withResolvers<T>()

        options.signal?.addEventListener('abort', () => {
            reject(new RBFError('ABORTED', 'Request was aborted'))
        })

        this.pendingRequests.set(requestId, { resolve, reject })

        const h = headers()

        h.append('Request-Id', requestId)
        h.append('Reply-To', `${this.inboxAddress}.${requestId}`)

        await this.jetstreamClient.publish(
            fullTopic,
            JSON.stringify(options.input ?? null),
            {
                headers: h,
            },
        )

        return promise as T
    }

    async requestWithRetries<T = any>(
        topic: string,
        {
            retries = 3,
            timeout = 5000,
            ...options
        }: {
            requestId?: string
            signal?: AbortSignal
            input: unknown
            headers?: Record<string, string>
            timeout?: number
            retries?: number
        },
    ): Promise<T> {
        const requestId = options.requestId ?? uuidv7()

        for (let i = 0; i < retries; i++) {
            try {
                const timeoutSignal = AbortSignal.timeout(timeout)
                const signal = options.signal
                    ? AbortSignal.any([options.signal, timeoutSignal])
                    : timeoutSignal

                return await this.request(topic, {
                    ...options,
                    requestId,
                    signal,
                })
            } catch (error) {
                if (i === retries - 1) {
                    throw error
                }
            }
        }

        throw new Error(`Request failed after ${retries} retries`)
    }

    async query<T extends QueryDefinition<any, any, any, any>>(
        query: T,
        options: {
            headers?: Record<string, string>
            requestId?: string
            retries?: number
            signal?: AbortSignal
            timeout?: number
        } & (PathToParams<T['path']> extends Record<string, never>
            ? { params?: undefined }
            : { params: PathToParams<T['path']> }) &
            (T['input'] extends ZodType
                ? { input: z.infer<T['input']> }
                : { input?: undefined }),
    ): Promise<
        T['output'] extends ZodType
            ? z.infer<T['output']>
            : Awaited<ReturnType<T['handler']>>
    > {
        const path = buildPath(query.path, options.params ?? {})
        const topic = `${query._queue.subject}.${path}`
        return await this.requestWithRetries(topic, {
            input: options.input,
            headers: options.headers,
            signal: options.signal,
            retries: options.retries,
            timeout: options.timeout,
            requestId: options.requestId,
        })
    }

    async mutate<T extends MutationDefinition<any, any, any, any>>(
        query: T,
        options: {
            headers?: Record<string, string>
            requestId?: string
            retries?: number
            signal?: AbortSignal
            timeout?: number
        } & (PathToParams<T['path']> extends Record<string, never>
            ? { params?: undefined }
            : { params: PathToParams<T['path']> }) &
            (T['input'] extends ZodType
                ? { input: z.infer<T['input']> }
                : { input?: undefined }),
    ): Promise<
        T['output'] extends ZodType
            ? z.infer<T['output']>
            : Awaited<ReturnType<T['handler']>>
    > {
        const path = buildPath(query.path, options.params ?? {})
        const topic = `${query._queue.subject}.${path}`
        return await this.requestWithRetries(topic, {
            input: options.input,
            headers: options.headers,
            signal: options.signal,
            retries: options.retries,
            timeout: options.timeout,
            requestId: options.requestId,
        })
    }
}
