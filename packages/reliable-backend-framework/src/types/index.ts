// rbf.types.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: It is required for the type inference */
/** biome-ignore-all lint/complexity/noBannedTypes: It is required for the type inference */

import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import type { z } from 'zod'
import type { PathToParams } from './path-to-params'

// --- Core RBF Primitives ---

/**
 * Represents the configuration for a single queue.
 * Reserved for future enhancements like middleware.
 */
export type QueueConfig = {}

/**
 * A type alias for the specific Drizzle transaction object that will be passed
 * to all mutation and query handlers.
 */
export type DrizzleTx<TSchema extends Record<string, unknown>> = PgTransaction<
    PostgresJsQueryResultHKT,
    TSchema,
    ExtractTablesWithRelations<TSchema>
>

/**
 * The options object passed to a scheduled task.
 * It is strongly typed based on the definition of the mutation being scheduled.
 */
type EnqueueOptions<TDef extends MutationDefinition<any, any, any, any, any>> =
    {
        input: z.infer<TDef['input']>
        // `params` could be added here if the framework supports scheduling with dynamic paths
    }

/**
 * The scheduler object, available only within mutation handlers.
 * It provides a type-safe API for enqueuing follow-up tasks.
 */
export type Scheduler = {
    /**
     * Schedules a task to run immediately after the current transaction commits.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    enqueue: <TDef extends MutationDefinition<any, any, any, any, any>>(
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ) => void

    /**
     * Schedules a task to run at a specific time.
     * @param date The Date object specifying when the task should run.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    runAt: <TDef extends MutationDefinition<any, any, any, any, any>>(
        date: Date,
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ) => void

    /**
     * Schedules a task to run after a specified delay.
     * @param delay An object specifying the delay in seconds, minutes, or hours.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    runAfter: <TDef extends MutationDefinition<any, any, any, any, any>>(
        delay: { seconds?: number; minutes?: number; hours?: number },
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ) => void

    /**
     * Publishes a raw message to a NATS subject, bypassing the RBF task format.
     * Useful for integrating with other non-RBF systems.
     * @param subject The target NATS subject.
     * @param payload The message payload.
     */
    publish: (subject: string, payload: Uint8Array) => void

    /**
     * Suggests a delay before NATS should redeliver a failed message.
     * @param delay An object specifying the retry delay in seconds.
     */
    setRetryDelay: (delay: { seconds: number }) => void
}

// --- Handler Argument Types ---

/**
 * The arguments object passed to a mutation handler.
 */
export type MutationHandlerArgs<
    TContext,
    TSchema extends Record<string, unknown>,
    TPath extends string,
    TInput extends z.ZodType,
> = {
    /** The shared application context. */
    ctx: TContext
    /** A Drizzle transaction instance, scoped to this mutation. */
    db: DrizzleTx<TSchema>
    /** The scheduler for enqueuing atomic side-effects. */
    scheduler: Scheduler
    /** The validated and parsed input payload for the mutation. */
    input: z.infer<TInput>
    /** An object containing parameters parsed from the mutation's path. */
    params: PathToParams<TPath>
}

/**
 * The arguments object passed to a query handler.
 * Note: The `scheduler` is not available in queries.
 */
export type QueryHandlerArgs<
    TContext,
    TSchema extends Record<string, unknown>,
    TPath extends string,
    TInput extends z.ZodType,
> = {
    /** The shared application context. */
    ctx: TContext
    /** A Drizzle transaction instance, scoped to this query. */
    db: DrizzleTx<TSchema>
    /** The validated and parsed input payload for the query. */
    input: z.infer<TInput>
    /** An object containing parameters parsed from the query's path. */
    params: PathToParams<TPath>
}

// --- Operation Definitions ---

/**
 * The complete, typed definition of a Mutation.
 * This object is the return type of `app.mutation()` and is used for type
 * inference throughout the framework, including the client and scheduler.
 */
export type MutationDefinition<
    TContext,
    TSchema extends Record<string, unknown>,
    TPath extends string,
    TInput extends z.ZodType = z.ZodNull,
    TOutput extends z.ZodType = z.ZodAny, // The Zod schema for the output
    // The actual type returned by the handler. It must be assignable to the
    // type inferred from the TOutput schema. This enables inference.
    THandlerOutput extends z.infer<TOutput> = z.infer<TOutput>,
> = {
    /** The addressable path for this mutation, e.g., 'users.create'. */
    path: TPath
    /** An optional Zod schema for validating the input payload. */
    input?: TInput
    /** An optional Zod schema for validating the return value. */
    output?: TOutput
    /** The business logic for the mutation. */
    handler: (
        args: MutationHandlerArgs<TContext, TSchema, TPath, TInput>,
    ) => Promise<THandlerOutput>

    // --- Internal properties for type inference ---
    readonly _type: 'mutation'
    readonly _context: TContext
    readonly _schema: TSchema
}

/**
 * The complete, typed definition of a Query.
 * This object is the return type of `app.query()`.
 */
export type QueryDefinition<
    TContext,
    TSchema extends Record<string, unknown>,
    TPath extends string,
    TInput extends z.ZodType = z.ZodNull,
    TOutput extends z.ZodType = z.ZodAny, // The Zod schema for the output
    // The actual type returned by the handler. It must be assignable to the
    // type inferred from the TOutput schema. This enables inference.
    THandlerOutput extends z.infer<TOutput> = z.infer<TOutput>,
> = {
    /** The addressable path for this query, e.g., 'users.get.$userId'. */
    path: TPath
    /** An optional Zod schema for validating the input payload. */
    input?: TInput
    /** An optional Zod schema for validating the return value. */
    output?: TOutput
    /** The business logic for the query. */
    handler: (
        args: QueryHandlerArgs<TContext, TSchema, TPath, TInput>,
    ) => Promise<THandlerOutput>

    // --- Internal properties for type inference ---
    readonly _type: 'query'
    readonly _context: TContext
    readonly _schema: TSchema
}

// --- Main App Definition ---

/**
 * The central definition of an RBF application. It holds the types for the
 * context, database schema, and queues, and provides the methods for defining
 * mutations and queries.
 *
 * @template TBaseContext The shared context object available in all handlers.
 * @template TSchema The Drizzle ORM schema type.
 * @template TQueues A record defining the available message queues.
 */
export type AppDefinition<
    TBaseContext extends object = {},
    TSchema extends Record<string, unknown> = {},
    TQueues extends Record<string, QueueConfig> = {},
> = {
    /**
     * Defines a mutation and registers it with the application.
     * @param queueName The name of the queue this mutation will listen on. Must be a key of the queues defined in `defineBackend`.
     * @param definition The mutation's configuration, including its path, schemas, and handler.
     */
    mutation: <
        TQueueName extends keyof TQueues,
        TPath extends string,
        TInput extends z.ZodType = z.ZodNull,
        TOutputSchema extends z.ZodType = z.ZodAny,
        THandlerOutput extends z.infer<TOutputSchema> = z.infer<TOutputSchema>,
    >(
        queueName: TQueueName,
        definition: Omit<
            MutationDefinition<
                TBaseContext,
                TSchema,
                TPath,
                TInput,
                TOutputSchema,
                THandlerOutput
            >,
            '_type' | '_context' | '_schema'
        >,
    ) => MutationDefinition<
        TBaseContext,
        TSchema,
        TPath,
        TInput,
        TOutputSchema,
        THandlerOutput
    >

    /**
     * Defines a query and registers it with the application.
     * @param queueName The name of the queue this query will listen on. Must be a key of the queues defined in `defineBackend`.
     * @param definition The query's configuration, including its path, schemas, and handler.
     */
    query: <
        TQueueName extends keyof TQueues,
        TPath extends string,
        TInput extends z.ZodType = z.ZodNull,
        TOutputSchema extends z.ZodType = z.ZodAny,
        THandlerOutput extends z.infer<TOutputSchema> = z.infer<TOutputSchema>,
    >(
        queueName: TQueueName,
        definition: Omit<
            QueryDefinition<
                TBaseContext,
                TSchema,
                TPath,
                TInput,
                TOutputSchema,
                THandlerOutput
            >,
            '_type' | '_context' | '_schema'
        >,
    ) => QueryDefinition<
        TBaseContext,
        TSchema,
        TPath,
        TInput,
        TOutputSchema,
        THandlerOutput
    >

    // --- Internal properties for type inference ---
    readonly _queues: TQueues
    readonly _context: TBaseContext
    readonly _schema: TSchema
}
