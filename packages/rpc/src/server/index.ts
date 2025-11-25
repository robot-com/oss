export * from './registry.js'

import {
    type ConsumerMessages,
    type JsMsg,
    jetstream,
} from '@nats-io/jetstream'
import type { NatsConnection } from '@nats-io/nats-core'
import { ZodError, z } from 'zod'
import { RPCError, type RpcErrorCode } from '../error.js'
import type { RegistryImplementation } from '../types.js'
import type { Registry } from './registry.js'

export type RPCServerOptions = {
    nats: NatsConnection
    streamName: string
    consumerName: string
    subjectPrefix: string
    registry: Registry
}

export async function startRpcNatsServer(
    opts: RPCServerOptions,
): Promise<{ stop: () => Promise<void> }> {
    const js = jetstream(opts.nats)
    const consumer = await js.consumers.get(opts.streamName, opts.consumerName)

    const iter = await consumer.consume()

    void rpcNatsServerLoop(opts, iter).catch((err) => {
        console.error('RPC NATS server loop error:', err)
    })

    return {
        stop: async () => {
            await iter.close()
        },
    }
}

async function rpcNatsServerLoop(
    opts: RPCServerOptions,
    iter: ConsumerMessages,
) {
    for await (const m of iter) {
        void handleMessage(opts, m).catch((err) => {
            console.error('RPC NATS server message handler error:', err)
        })
    }
}

const natsMsgPayloadSchema = z.object({
    reply: z.string(),
    params: z.any(),
    input: z.any(),
})

async function handleMessage(opts: RPCServerOptions, msg: JsMsg) {
    const bodyStr = new TextDecoder().decode(msg.data)
    const body = JSON.parse(bodyStr)
    const parsed = natsMsgPayloadSchema.parse(body)

    const sub = msg.subject.startsWith(opts.subjectPrefix)
        ? msg.subject.slice(opts.subjectPrefix.length)
        : msg.subject
    const match = opts.registry.match(null, sub)

    function sendResponse(status: number, data: Record<string, unknown>) {
        return opts.nats.publish(
            parsed.reply,
            new TextEncoder().encode(
                JSON.stringify({
                    status,
                    ...data,
                }),
            ),
        )
    }

    if (!match) {
        sendResponse(404, {
            error: 'NO_FOUND',
            message: `No RPC method found for subject ${msg.subject}`,
        })
        msg.ack()
        return
    }

    const params = {
        ...match.params,
        ...parsed.params,
    }

    const input = parsed.input
    let ackSent = false
    const ack = async () => {
        if (ackSent) {
            return
        }
        ackSent = true
        msg.ack()
    }
    const nack = async (retry?: number) => {
        if (ackSent) {
            return
        }
        ackSent = true
        msg.nak(retry)
    }

    await executeProcedure(match, params, input, msg, ack, nack)
        .then((r) => {
            ack()
            sendResponse(r.status, r)
        })
        .catch((err) => {
            if (err instanceof ZodError) {
                ack()
                sendResponse(400, {
                    error: 'BAD_REQUEST',
                    message: err.message,
                    issues: err.issues,
                })
            } else if (
                !RPCError.isRPCError(err) ||
                err.code === 'INTERNAL_SERVER_ERROR'
            ) {
                console.error('RPC NATS server procedure error:', err)

                nack(1000 + Math.random() * 2000)
                sendResponse(500, {
                    error: 'INTERNAL_SERVER_ERROR',
                    message: err.message,
                })
            } else {
                ack()

                sendResponse(err.statusCode, {
                    error: err.code,
                    message: err.message,
                })
            }
        })
}

async function executeProcedure(
    impl: RegistryImplementation,
    // biome-ignore lint/suspicious/noExplicitAny: Default is any for ease of use
    params: any,
    // biome-ignore lint/suspicious/noExplicitAny: Default is any for ease of use
    input: any,

    msg: JsMsg,

    ack: () => Promise<void>,
    nack: (retry?: number) => Promise<void>,
): Promise<{
    status: number
    data?: Record<string, unknown>
    error?: RpcErrorCode
    message?: string
}> {
    const parsedParams = impl.procedure.paramsSchema.parse(params)
    const parsedInput = impl.procedure.inputSchema.parse(input)

    const ctx = await impl.middleware(impl.initialContext, {
        procedure: impl.procedure,
        msg,
    })

    const r = await impl.handler({
        msg: { ack, nack },
        ctx,
        params: parsedParams,
        input: parsedInput,
    })

    if ('error' in r) {
        return {
            error: r.error,
            status: r.status ?? 500,
        }
    }

    return {
        data: r.data,
        status: r.status ?? 200,
    }
}
