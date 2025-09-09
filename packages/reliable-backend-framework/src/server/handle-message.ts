/** biome-ignore-all lint/suspicious/noExplicitAny: It is not a problem */
import type { JsMsg } from '@nats-io/jetstream'
import { headers, type NatsConnection } from '@nats-io/nats-core'
import { eq } from 'drizzle-orm'
import { rbf_outbox, rbf_results } from '../schema'
import type { AppDefinition } from '../types'
import type { Backend } from './backend'
import { RBFError } from './error'
import type { MatchResult } from './registry'
import { Scheduler } from './scheduler'

export function extractSubject(prefix: string, subject: string): string | null {
    let normalized = prefix
    if (prefix.endsWith('.>')) {
        normalized = prefix.slice(0, -2)
    } else if (prefix.endsWith('.')) {
        normalized = prefix.slice(0, -1)
    }
    normalized += '.'

    if (subject.startsWith(normalized)) {
        return subject.slice(normalized.length)
    }

    return null
}

function matchProcedure(
    backend: Backend<AppDefinition<any, any, any, any, any, any>>,
    subjectPrefix: string,
    msg: JsMsg,
): MatchResult | null {
    const subject = extractSubject(subjectPrefix, msg.subject)

    if (!subject) {
        return null
    }

    return backend.app.registry.match(subject)
}

async function replyMessage(
    nc: NatsConnection,
    msg: JsMsg,
    response: {
        requestId: string | null
        statusCode: number
        data: any
    },
): Promise<void> {
    const replyToHeader = msg.headers?.get('Reply-To')

    if (replyToHeader) {
        const h = headers()
        if (response.requestId) {
            h.append('Request-Id', response.requestId)
        }

        h.append('Status-Code', response.statusCode.toString())

        nc.publish(replyToHeader, JSON.stringify(response.data), {
            headers: h,
        })
    }
}

export async function handleMessage(
    backend: Backend<AppDefinition<any, any, any, any, any, any>>,
    message: JsMsg,
    subjectPrefix: string,
): Promise<void> {
    const match = matchProcedure(backend, subjectPrefix, message)
    const requestId = message.headers?.get('Request-Id') || null

    if (!match || !requestId) {
        replyMessage(backend.nats, message, {
            data: null,
            statusCode: 404,
            requestId,
        })
        message.ack()
        return
    }

    let input: any

    try {
        input = message.json()
    } catch (_) {
        replyMessage(backend.nats, message, {
            data: {
                error: 'BAD_REQUEST',
                message: 'Invalid JSON in request body',
            },
            statusCode: 400,
            requestId,
        })
        message.ack()
        return
    }

    let shortCircuit = false

    const scheduler = new Scheduler(backend)

    const result = await backend.db.transaction(
        async (tx) => {
            // VERIFY IF RESPONSE ALREADY EXISTS!
            // IF ALREADY EXIST, RETRY SEND PENDING MESSAGES
            const [existingResponse] = await tx
                .select()
                .from(rbf_results)
                .where(eq(rbf_results.request_id, requestId))
                .limit(1)

            if (existingResponse) {
                if (
                    existingResponse.requested_path !== message.subject ||
                    existingResponse.requested_input !== JSON.stringify(input)
                ) {
                    // If the requested path or input is different, we need to handle it
                    replyMessage(backend.nats, message, {
                        data: {
                            error: 'INVALID_REQUEST',
                        },
                        statusCode: 409,
                        requestId,
                    })
                    shortCircuit = true
                } else {
                    // If the requested path and input are the same, we can use the existing response
                    replyMessage(backend.nats, message, {
                        data: existingResponse.data,
                        statusCode: existingResponse.status,
                        requestId,
                    })
                    shortCircuit = true

                    const pendingMessages = await tx
                        .select()
                        .from(rbf_outbox)
                        .where(eq(rbf_outbox.source_request_id, requestId))
                        .limit(1)

                    await Promise.all([
                        pendingMessages.map((msg) => {
                            const h = headers()

                            if (msg.type === 'request') {
                                h.append('Request-Id', msg.id)
                            }

                            return backend.jetstreamClient.publish(
                                msg.path,
                                JSON.stringify(msg.data),
                                {
                                    headers: h,
                                },
                            )
                        }),
                    ])

                    await Promise.all([
                        tx
                            .delete(rbf_outbox)
                            .where(eq(rbf_outbox.source_request_id, requestId)),
                    ])
                }
            }

            const { ctx } = await match.definition._middleware({
                ctx: backend.app._context,
                db: tx,
                scheduler: null as unknown as Scheduler,
                input,
                params: match.params,
                type: match.definition._type,
            })

            const result = await match.definition
                .handler({
                    ctx,
                    db: tx,
                    input,
                    params: match.params,
                    scheduler,
                })
                .then(async (data) => {
                    if (match.definition._type === 'mutation') {
                        const r = await tx
                            .insert(rbf_results)
                            .values({
                                request_id: requestId,
                                requested_path: message.subject,
                                requested_input: JSON.stringify(input),
                                data,
                                status: 200,
                            })
                            .onConflictDoNothing()
                            .returning()

                        if (r.length === 0) {
                            message.nak()
                            throw new Error('Failed to save result')
                        }

                        if (scheduler.queue.length > 0) {
                            await tx.insert(rbf_outbox).values(
                                scheduler.queue.map((item) => ({
                                    ...item,
                                    source_request_id: requestId,
                                    target_at: item.target_at,
                                })),
                            )
                        }
                    }

                    return data
                })
                .catch(async (e) => {
                    const error = RBFError.from(e)

                    if (error.code === 'INTERNAL_SERVER_ERROR') {
                        // Log the error and return a generic error response
                        backend.onError?.(error)
                        message.nak()
                        throw error
                    }

                    if (match.definition._type === 'mutation') {
                        await tx.insert(rbf_results).values({
                            request_id: requestId,
                            requested_path: message.subject,
                            requested_input: JSON.stringify(input),
                            data: error.data,
                            status: error.statusCode,
                        })
                    }

                    replyMessage(backend.nats, message, {
                        data: error.data,
                        statusCode: error.statusCode,
                        requestId,
                    })

                    shortCircuit = true

                    return undefined
                })

            return result
        },
        {
            isolationLevel: 'serializable',
            accessMode:
                match.definition._type === 'query' ? 'read only' : 'read write',
        },
    )

    if (shortCircuit) {
        message.ack()
        return
    }

    // SEND REPLY
    replyMessage(backend.nats, message, {
        data: result,
        statusCode: 200,
        requestId,
    })

    if (match.definition._type === 'mutation') {
        await Promise.all(
            scheduler.queue.map((item) => {
                const h = headers()
                if (item.type === 'request') {
                    h.append('Request-Id', item.id)
                }

                return backend.jetstreamClient.publish(
                    item.path,
                    JSON.stringify(item.data),
                    {
                        headers: h,
                    },
                )
            }),
        )

        await backend.db
            .delete(rbf_outbox)
            .where(eq(rbf_outbox.source_request_id, requestId))
    }

    message.ack()
}
