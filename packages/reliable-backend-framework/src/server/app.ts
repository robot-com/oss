/** biome-ignore-all lint/complexity/noBannedTypes: Needed for type inference */
import z from 'zod'
import type { AppDefinition, Middleware, QueueConfig } from '../types'
import { Registry } from './registry'

function defineBackend<
    TBaseContext = {},
    TSchema extends Record<string, unknown> = {},
    TQueues extends Record<string, QueueConfig> = {},
    TMutationMetadata extends Record<string, unknown> = {},
    TQueryMetadata extends Record<string, unknown> = {},
    TMiddlewareOutputContext = TBaseContext,
>(opts: {
    schema?: TSchema
    context?: TBaseContext
    queues: TQueues
    registry?: Registry
    middleware?: Middleware<TBaseContext, TSchema, TMiddlewareOutputContext>
}): AppDefinition<
    TBaseContext,
    TSchema,
    TQueues,
    TMutationMetadata,
    TQueryMetadata,
    TMiddlewareOutputContext
> {
    // TODO: ...
    const context = opts.context ?? ({} as TBaseContext)
    const schema = opts.schema ?? ({} as TSchema)
    const middleware =
        opts.middleware ??
        ((() => ({ ctx: context })) as unknown as Middleware<
            TBaseContext,
            TSchema,
            TMiddlewareOutputContext
        >)

    const registry = opts.registry ?? new Registry()

    return {
        _queues: opts.queues,
        _context: context,
        _schema: schema,
        mutation: (queueName, m) =>
            registry.addMutation({
                ...m,
                _context: context,
                _schema: schema,
                _type: 'mutation',
                _queue: opts.queues[queueName],
                _middleware: middleware,
            }),
        query: (queueName, q) =>
            registry.addQuery({
                ...q,
                _context: context,
                _schema: schema,
                _type: 'query',
                _queue: opts.queues[queueName],
                _middleware: middleware,
            }),
        middleware(newMiddleware) {
            return defineBackend({
                ...opts,
                registry,
                middleware: async (args) => {
                    const result = await middleware(args)
                    return await newMiddleware({
                        ...args,
                        ctx: result.ctx,
                    })
                },
            })
        },
        _middleware: middleware,
        registry,
    }
}

const backend = defineBackend({
    queues: {
        jobs: {},
    },
    context: {
        env: 'production' as const,
    },
    middleware: async (args) => {
        return {
            ctx: {
                user: {
                    id: '123',
                    name: 'John Doe',
                },
                ...args.ctx,
            },
        }
    },
})

const createJob = backend.mutation('jobs', {
    path: '/',
    input: z.object({
        name: z.string(),
    }),
    output: z.object({
        name: z.string(),
        id: z.string(),
    }),
    handler: async ({ input, ctx }): Promise<{ name: string; id: string }> => {
        return {
            name: input.name,
            id: '123',
        }
    },
})

const deleteJob = backend.mutation('jobs', {
    path: '/',
    input: z.object({
        id: z.string(),
    }),
    handler: async ({ input, ctx }) => {
        return {
            deleted: true,
        }
    },
})

const orgBackend = backend.middleware(async (args) => {
    return {
        ctx: {
            ...args.ctx,
            org: {
                id: '123',
                name: 'Acme',
            },
        },
    }
})
