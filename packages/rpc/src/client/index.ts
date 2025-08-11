import type { Procedure, ProcedureOutput, ProcedureParams } from '../types'

export * from './nats'
export interface RPCClient {
    call<T extends Procedure>(
        procedure: T,
        opts: {
            params: ProcedureParams<T['paramsSchema']>
            input: ProcedureParams<T['inputSchema']>
            signal?: AbortSignal
            timeout?: number
        }
    ): Promise<ProcedureOutput<T['outputSchema']>>
}
