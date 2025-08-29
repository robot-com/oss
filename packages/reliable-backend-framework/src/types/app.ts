/** biome-ignore-all lint/suspicious/noExplicitAny: It is required for the type inference */
import type z from 'zod'
import type { DbTx, MiddlewareFn, MutationDefinition, QueryDefinition, QueuesConfig, Scheduler } from './core'
import type { PathToParams } from './path-to-params'

/**
 * The main application definition. It is the central point for defining
 * queues, mutations, and queries, ensuring type safety across the entire app.
 */
export type AppDefinition<
    TBaseContext,
    TSchema extends Record<string, unknown>,
    TQueues extends QueuesConfig<TBaseContext, TSchema>,
> = {
    /**
     * The configuration of queues provided by the user.
     */
    queues: TQueues

    /**
     * Defines a mutation.
     * @param queueName The name of the queue this mutation listens on. Must be a key of the `queues` object.
     * @param definition The mutation's configuration, including path, schemas, and handler.
     */
    mutation: <
        TQueueName extends keyof TQueues,
        TPath extends string,
        TInputSchema extends z.ZodType,
        TOutputSchema extends z.ZodType,
    >(
        queueName: TQueueName,
        definition: {
            path: TPath
            input?: TInputSchema
            output?: TOutputSchema
            handler: (
                // This is the core of the type inference.
                // It infers the context type from the chosen queue's middleware.
                args: {
                    ctx: TQueues[TQueueName]['middleware'] extends MiddlewareFn<
                        any,
                        any
                    >
                        ? Awaited<ReturnType<TQueues[TQueueName]['middleware']>>
                        : TBaseContext
                    db: DbTx<TSchema>
                    scheduler: Scheduler<
                        AppDefinition<TBaseContext, TSchema, TQueues>
                    >
                    input: z.infer<TInputSchema>
                    params: PathToParams<TPath>
                },
            ) => Promise<z.infer<TOutputSchema>>
        },
    ) => MutationDefinition<
        TQueueName & string,
        // We repeat the context inference here for the definition's type
        TQueues[TQueueName]['middleware'] extends MiddlewareFn<any, any>
            ? Awaited<ReturnType<TQueues[TQueueName]['middleware']>>
            : TBaseContext,
        TSchema,
        TPath,
        TInputSchema,
        TOutputSchema
    >

    /**
     * Defines a query.
     * @param queueName The name of the queue this query listens on. Must be a key of the `queues` object.
     * @param definition The query's configuration, including path, schemas, and handler.
     */
    query: <
        TQueueName extends keyof TQueues,
        TPath extends string,
        TInputSchema extends z.ZodType,
        TOutputSchema extends z.ZodType,
    >(
        queueName: TQueueName,
        definition: {
            path: TPath
            input?: TInputSchema
            output?: TOutputSchema
            handler: (args: {
                ctx: TQueues[TQueueName]['middleware'] extends MiddlewareFn<
                    any,
                    any
                >
                    ? Awaited<ReturnType<TQueues[TQueueName]['middleware']>>
                    : TBaseContext
                db: DbTx<TSchema>
                // Note: No `scheduler` for queries
                input: z.infer<TInputSchema>
                params: PathToParams<TPath>
            }) => Promise<z.infer<TOutputSchema>>
        },
    ) => QueryDefinition<
        TQueueName & string,
        TQueues[TQueueName]['middleware'] extends MiddlewareFn<any, any>
            ? Awaited<ReturnType<TQueues[TQueueName]['middleware']>>
            : TBaseContext,
        TSchema,
        TPath,
        TInputSchema,
        TOutputSchema
    >
}

