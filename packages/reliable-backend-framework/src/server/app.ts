import z from 'zod'
import type { AppDefinition, QueueConfig } from '../types'

function defineBackend<
    TBaseContext extends object = {},
    TSchema extends Record<string, unknown> = {},
    TQueues extends Record<string, QueueConfig> = {},
>(opts: { queues: TQueues }): AppDefinition<TBaseContext, TSchema, TQueues> {
    return {
        queues: opts.queues,
        mutation: () => {},
        query: () => {},
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
