import type { JsMsg } from '@nats-io/jetstream'
import type { ZodType } from 'zod'
import type { RpcErrorCode } from './error'

export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT'

export type Procedure<
    P extends ZodType = ZodType,
    I extends ZodType | null = ZodType | null,
    O extends ZodType = ZodType,
> = {
    /**
     * HTTP method for the procedure.
     * If using over NATS or other transports, the method can be embedded into the path.
     */
    method: HttpMethod
    /**
     * Path for the procedure.
     *
     * For example `jobs.$namespace.$method`
     * - HTTP: POST /jobs/$namespace/
     * - NATS: jobs.$namespace.create
     *
     * METHOD names in nats: POST -> create, GET -> get, PATCH -> update, DELETE -> delete
     */
    path: string
    /**
     * Expected URL and query parameters.
     * This is used to validate the incoming request.
     * The parameters are validated against the schema.
     */
    paramsSchema: P
    /**
     * Body payload schema.
     */
    inputSchema: I
    /**
     * Response schema.
     */
    outputSchema: O
    // /**
    //  * For React Query integration
    //  */
    // rq: <TQueryOptions extends Record<string, unknown>>(
    //     params: P extends ZodType<infer U> ? U : never,
    //     options?: TQueryOptions
    // ) => {
    //     queryKey: [string, any],
    //     queryFn: () => Promise<O extends ZodType<infer U> ? U : never>
    // } & TQueryOptions;
}

export type ProcedureInput<T> = T extends ZodType<infer U> ? U : never

export type ProcedureParams<T> = T extends ZodType<infer U> ? U : never

export type ProcedureOutput<T> = T extends ZodType<infer U> ? U : never

export type ProcedureImplementation<C, P, I, O> = (opts: {
    msg: { ack: () => Promise<void>; nack: () => Promise<void> }
    ctx: C
    params: P
    input: I
}) => Promise<
    { data: O; status?: number } | { error: RpcErrorCode; status?: number }
>

export type TransportType = 'http' | 'nats' | 'ws'

export interface RpcRequest {
    procedure: Procedure
    msg: JsMsg | null
}

export type Matcher = {
    httpMethod: HttpMethod
    rpcPathRegex: RegExp
    httpPathRegex: RegExp
    paramsNames: string[]
    match: (
        method: HttpMethod | null,
        path: string
    ) => { params: Record<string, string> } | null
}

export type RegistryImplementation<
    InitialContext = unknown,
    Context = unknown,
    P extends ZodType = ZodType,
    I extends ZodType = ZodType,
    O extends ZodType = ZodType,
> = {
    initialContext: InitialContext
    middleware: (
        initialContext: InitialContext,
        req: RpcRequest
    ) => Promise<Context>
    procedure: Procedure<P, I, O>
    matcher: Matcher
    handler: ProcedureImplementation<
        Context,
        ProcedureParams<P>,
        ProcedureInput<I>,
        ProcedureOutput<O>
    >
}
