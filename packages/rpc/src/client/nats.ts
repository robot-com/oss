import { createInbox, headers, type NatsConnection } from '@nats-io/nats-core'
import type { RPCClient } from '.'
import { RPCError } from '../error'
import { createPathFromParams } from '../procedure'
import type { Procedure, ProcedureOutput, ProcedureParams } from '../types'

export type RPCClientOptions = {
    nats: NatsConnection
    publishPrefix: string
    headers?: Record<string, string>
}

export type CallOptions<P, I> = {
    signal?: AbortSignal
    timeout?: number
} & (P extends null | undefined
    ? {
        params?: P
    }
    : {
        params: P
    }) &
    (I extends null | undefined
        ? {
            input?: I
        }
        : {
            input: I
        })
export class RPCClientNATS implements RPCClient {
    opts: RPCClientOptions

    constructor(opts: RPCClientOptions) {
        this.opts = opts
    }

    call<T extends Procedure>(
        procedure: T,
        opts: CallOptions<
            ProcedureParams<T['paramsSchema']>,
            ProcedureParams<T['inputSchema']>
        >
    ): Promise<ProcedureOutput<T['outputSchema']>> {
        return new Promise<ProcedureOutput<T['outputSchema']>>(
            (resolve, reject) => {
                const r = createInbox()
                let timer = 0
                const sub = this.opts.nats.subscribe(r, {
                    max: 1,
                    callback: (err, m) => {
                        if (err) {
                            clearTimeout(timer)
                            reject(err)
                            return
                        }
                        if (m) {
                            try {
                                const bodyStr = new TextDecoder().decode(m.data)
                                const body = JSON.parse(bodyStr)

                                if (body.status < 200 || body.status >= 300) {
                                    clearTimeout(timer)
                                    reject(
                                        new RPCError(body.error, body.message)
                                    )
                                } else {
                                    clearTimeout(timer)
                                    resolve(body.data)
                                }
                            } catch (err) {
                                clearTimeout(timer)
                                reject(err)
                            }
                        }
                    },
                })

                const payload = {
                    reply: r,
                    params: 'params' in opts ? opts.params : null,
                    input: 'input' in opts ? opts.input : null,
                }

                const publishSubject =
                    this.opts.publishPrefix +
                    createPathFromParams(procedure, opts.params)
                try {
                    const h = headers()
                    if (this.opts.headers) {
                        for (const [key, value] of Object.entries(
                            this.opts.headers
                        )) {
                            h.set(key, value)
                        }
                    }
                    this.opts.nats.publish(
                        publishSubject,
                        new TextEncoder().encode(JSON.stringify(payload)),
                        {
                            headers: h,
                        }
                    )
                } catch (error) {
                    clearTimeout(timer)
                    reject(error)
                    return
                }

                timer = setTimeout(() => {
                    sub.unsubscribe()
                    reject(new Error('Timeout'))
                }, 60000) as unknown as number
                opts.signal?.addEventListener('abort', () => {
                    sub.unsubscribe()
                    clearTimeout(timer)
                    reject(new Error('Aborted'))
                })
            }
        )
    }
}
