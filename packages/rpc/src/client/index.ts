import type { Procedure, ProcedureOutput, ProcedureParams } from '../types'

export * from './nats'

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

export interface RPCClient {
    call<T extends Procedure>(
        procedure: T,
        opts: CallOptions<
            ProcedureParams<T['paramsSchema']>,
            ProcedureParams<T['inputSchema']>
        >
    ): Promise<ProcedureOutput<T['outputSchema']>>
}
