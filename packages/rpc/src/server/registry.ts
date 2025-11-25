import type { ZodType } from 'zod'
import type {
    HttpMethod,
    Procedure,
    ProcedureImplementation,
    ProcedureInput,
    ProcedureOutput,
    ProcedureParams,
    RegistryImplementation,
    RpcRequest,
} from '../types'
import { createRpcMatcher } from './matcher'

// biome-ignore lint/suspicious/noExplicitAny: Default is any for ease of use
export class Registry<InitialContext = any, Context = any> {
    initialContext: InitialContext
    middleware: (
        initialContext: InitialContext,
        req: RpcRequest,
    ) => Promise<Context>

    // biome-ignore lint/suspicious/noExplicitAny: Default is any for ease of use
    implementations: RegistryImplementation<any, any, any, any, any>[] = []

    constructor(opts: {
        initialContext: InitialContext
        middleware: (
            initialContext: InitialContext,
            req: RpcRequest,
        ) => Promise<Context>
    }) {
        this.initialContext = opts.initialContext
        this.middleware = opts.middleware
    }

    impl<P extends ZodType, I extends ZodType, O extends ZodType>(
        procedure: Procedure<P, I, O>,
        handler: ProcedureImplementation<
            Context,
            ProcedureParams<P>,
            ProcedureInput<I>,
            ProcedureOutput<O>
        >,
    ): Registry<InitialContext, Context> {
        const impl: RegistryImplementation<InitialContext, Context, P, I, O> = {
            initialContext: this.initialContext,
            middleware: this.middleware,
            procedure,
            handler,
            matcher: createRpcMatcher(procedure),
        }

        this.implementations.push(impl)

        return this
    }

    merge(
        registry: Registry<InitialContext, Context>,
    ): Registry<InitialContext, Context> {
        this.implementations.push(...registry.implementations)
        return this
    }

    match(
        method: HttpMethod | null,
        path: string,
    ):
        | (RegistryImplementation & { params: Record<string, string> })
        | undefined {
        for (const impl of this.implementations) {
            const match = impl.matcher.match(method, path)
            if (match) {
                return {
                    ...impl,
                    params: match.params,
                }
            }
        }

        return undefined
    }
}
