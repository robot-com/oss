import z from 'zod'
import type { AppDefinition, QueueConfig } from '../types'

function defineBackend<
    TBaseContext extends object = {},
    TSchema extends Record<string, unknown> = {},
    TQueues extends Record<string, QueueConfig> = {},
    TMutationMetadata extends Record<string, unknown> = {},
    TQueryMetadata extends Record<string, unknown> = {},
>(opts: {
    schema?: TSchema
    context?: TBaseContext
    queues: TQueues
}): AppDefinition<
    TBaseContext,
    TSchema,
    TQueues,
    TMutationMetadata,
    TQueryMetadata
> {
    // TODO: ...
    const context = opts.context ?? ({} as TBaseContext)
    const schema = opts.schema ?? ({} as TSchema)

    return {
        _queues: opts.queues,
        _context: context,
        _schema: schema,
        mutation: (queueName, m) => {
            const mutation = {
                ...m,
                _context: context,
                _schema: schema,
                _type: 'mutation',
                _queue: opts.queues[queueName],
            } as const

            // TODO: Register query

            return mutation
        },
        query: (queueName, q) => {
            const query = {
                ...q,
                _context: context,
                _schema: schema,
                _type: 'query',
                _queue: opts.queues[queueName],
            } as const

            // TODO: Register query

            return query
        },
    }
}

const backend = defineBackend({
    queues: {
        jobs: {},
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
    handler: async ({ input }): Promise<{ name: string; id: string }> => {
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
    handler: async ({ input }) => {
        return {
            deleted: true,
        }
    },
})
