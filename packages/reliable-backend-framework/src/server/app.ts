import type { AppDefinition } from '../types/app'
import type { QueuesConfig } from '../types/core'

function defineBackend<
    TBaseContext,
    TSchema extends Record<string, unknown> = Record<string, unknown>,
    TQueues extends QueuesConfig<TBaseContext, TSchema> = QueuesConfig<
        TBaseContext,
        TSchema
    >,
>(opts: { queues: TQueues }): AppDefinition<TBaseContext, TSchema, TQueues> {
    return {
        queues: opts.queues,
        mutation: () => {},
        query: () => {},
    }
}
