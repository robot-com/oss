import type { Msg as NatsMsg } from '@nats-io/nats-core'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import type { z } from 'zod'
import type { AppDefinition } from './app'
import type { PathToParams } from './path-to-params'

// --- RBF Primitives ---

/**
 * The database transaction type available in handlers and middleware.
 * It's generic over the user's Drizzle schema.
 */
export type DbTx<TSchema extends Record<string, unknown>> = PgTransaction<
    PostgresJsQueryResultHKT,
    TSchema,
    ExtractTablesWithRelations<TSchema>
>

/**
 * The Scheduler object, available only within Mutation handlers.
 * Note: The `enqueue` method is typed to accept any other mutation definition.
 */
export type Scheduler<TApp extends AppDefinition<any, any, any>> = {
    enqueue: <TDef extends MutationDefinition<any, any, any, any, any, any>>(
        definition: TDef,
        options: {
            input: z.infer<TDef['input']>
            // Params are optional as they are often part of the path itself
            params?: TDef['params']
        },
    ) => void
    runAt: <TDef extends MutationDefinition<any, any, any, any, any, any>>(
        date: Date,
        definition: TDef,
        options: {
            input: z.infer<TDef['input']>
            // Params are optional as they are often part of the path itself
            params?: TDef['params']
        },
    ) => void
    runAfter: <TDef extends MutationDefinition<any, any, any, any, any, any>>(
        time: number,
        definition: TDef,
        options: {
            input: z.infer<TDef['input']>
            // Params are optional as they are often part of the path itself
            params?: TDef['params']
        },
    ) => void
    publish: (subject: string, payload?: Uint8Array, options?: any) => void
    setRetryDelay: (delay: { seconds: number }) => void
}

// --- Queue and Middleware Definitions ---

/**
 * The function signature for a queue's middleware.
 * It receives the base context and returns an enriched context.
 */
export type MiddlewareFn<
    TBaseContext,
    TSchema extends Record<string, unknown>,
> = (ctx: TBaseContext, db: DbTx<TSchema>, msg: NatsMsg) => Promise<any>

/**
 * The definition for a single queue within the application.
 */
export type QueueDefinition<
    TBaseContext,
    TSchema extends Record<string, unknown>,
> = {
    middleware?: MiddlewareFn<TBaseContext, TSchema>
}

/**
 * A map of queue names to their definitions. This is what the user provides.
 */
export type QueuesConfig<
    TBaseContext,
    TSchema extends Record<string, unknown>,
> = Record<string, QueueDefinition<TBaseContext, TSchema>>

// --- Mutation and Query Definitions ---

/**
 * The fully resolved definition of a Mutation, including its handler.
 * This is the return type of `app.mutation()`.
 */
export type MutationDefinition<
    TQueueName extends string,
    TContext,
    TSchema extends Record<string, unknown>,
    TPath extends string,
    TInputSchema extends z.ZodType,
    TOutputSchema extends z.ZodType,
> = {
    _rbf: 'mutation'
    queueName: TQueueName
    path: TPath
    input: TInputSchema
    output: TOutputSchema
    params: PathToParams<TPath>
    handler: (args: {
        ctx: TContext
        db: DbTx<TSchema>
        scheduler: Scheduler<any> // Using 'any' to avoid circular refs in this example
        input: z.infer<TInputSchema>
        params: PathToParams<TPath>
    }) => Promise<z.infer<TOutputSchema>>
}

/**
 * The fully resolved definition of a Query.
 * This is the return type of `app.query()`.
 */
export type QueryDefinition<
    TQueueName extends string,
    TContext,
    TSchema,
    TPath extends string,
    TInputSchema extends z.ZodType,
    TOutputSchema extends z.ZodType,
> = {
    _rbf: 'query'
    queueName: TQueueName
    path: TPath
    input: TInputSchema
    output: TOutputSchema
    params: PathToParams<TPath>
    handler: (args: {
        ctx: TContext
        db: DbTx<TSchema extends Record<string, unknown> ? TSchema : never>
        input: z.infer<TInputSchema>
        params: PathToParams<TPath>
    }) => Promise<z.infer<TOutputSchema>>
}
