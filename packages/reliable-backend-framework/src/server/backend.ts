/** biome-ignore-all lint/suspicious/noExplicitAny: required for type inference */

import { type JetStreamClient, jetstream } from '@nats-io/jetstream'
import type { NatsConnection } from '@nats-io/nats-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { AppDefinition, QueueConfig } from '../types'

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
}

export class Backend<TApp extends AppDefinition<any, any, any, any, any, any>> {
    private app: TApp
    private db: PostgresJsDatabase<TApp['_schema']>
    private nats: NatsConnection
    private jetstreamClient: JetStreamClient
    private streamNamePrefix: string
    private consumerNamePrefix: string
    private subjectPrefix: string
    private abortController: AbortController | null = null

    constructor(app: TApp, opts: BackendOptions<TApp['_schema']>) {
        this.app = app
        this.db = opts.db
        this.nats = opts.nats
        this.jetstreamClient = jetstream(opts.nats)
        this.streamNamePrefix = opts.jetstream?.streamNamePrefix ?? ''
        this.consumerNamePrefix = opts.jetstream?.consumerNamePrefix ?? ''
        this.subjectPrefix = opts.jetstream?.subjectPrefix ?? ''
    }

    async start(): Promise<void> {
        if (this.abortController) {
            throw new Error('Backend already started')
        }

        this.abortController = new AbortController()
        Object.entries(this.app._queues as Record<string, QueueConfig>).forEach(
            ([defaultName, queue]) => {
                const _streamName = `${this.streamNamePrefix}${queue.streamName ?? defaultName}`
                const _consumerName = `${this.consumerNamePrefix}${queue.consumerName ?? defaultName}`
                const _subject = `${this.subjectPrefix}${queue.subject ?? ''}`

                // start listening to the queue
                // pass abort signal
            },
        )
    }

    async stop(): Promise<void> {
        if (!this.abortController) {
            throw new Error('Backend not started')
        }

        this.abortController.abort()
        this.abortController = null
    }
}
