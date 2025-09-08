import { v7 as uuidv7 } from 'uuid'
import type {
    AppDefinition,
    EnqueueOptions,
    MutationDefinition,
} from '../types'
import { buildPath } from '../types/path-to-params'
import type { Backend } from './backend'

export type SchedulerQueueItem = {
    id: string
    type: 'request' | 'message'
    path: string
    data: any
    target_at?: number
}

/**
 * The scheduler object, available only within mutation handlers.
 * It provides a type-safe API for enqueuing follow-up tasks.
 */
export class Scheduler {
    backend: Backend<AppDefinition<any, any, any, any, any, any>>

    queue: SchedulerQueueItem[] = []

    constructor(backend: Backend<AppDefinition<any, any, any, any, any, any>>) {
        this.backend = backend
    }

    /**
     * Schedules a task to run immediately after the current transaction commits.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    enqueue<TDef extends MutationDefinition<any, any, any, any, any>>(
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ): void {
        const queue = mutation._queue
        const subject = `${this.backend.subjectPrefix ?? ''}${queue.subject}.${buildPath(mutation.path, options.params)}`

        const item: SchedulerQueueItem = {
            type: 'request',
            id: uuidv7(),
            path: subject,
            data: options.input,
        }
        this.queue.push(item)
    }

    /**
     * Schedules a task to run at a specific time.
     * @param date The Date object specifying when the task should run.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    runAt<TDef extends MutationDefinition<any, any, any, any, any>>(
        date: Date,
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ): void {
        // Implementation here
        throw new Error('Not implemented')
    }

    /**
     * Schedules a task to run after a specified delay.
     * @param delay An object specifying the delay in seconds, minutes, or hours.
     * @param mutation The mutation definition to execute.
     * @param options The input for the mutation.
     */
    runAfter<TDef extends MutationDefinition<any, any, any, any, any>>(
        delay: { seconds?: number; minutes?: number; hours?: number },
        mutation: TDef,
        options: EnqueueOptions<TDef>,
    ): void {
        // Implementation here
        throw new Error('Not implemented')
    }

    /**
     * Publishes a raw message to a NATS subject, bypassing the RBF task format.
     * Useful for integrating with other non-RBF systems.
     * @param subject The target NATS subject.
     * @param payload The message payload.
     */
    publish(subject: string, payload: Uint8Array): void {
        // Implementation here
        throw new Error('Not implemented')
    }

    /**
     * Suggests a delay before NATS should redeliver a failed message.
     * @param delay An object specifying the retry delay in seconds.
     */
    setRetryDelay(delay: { seconds: number }): void {
        // Implementation here
        throw new Error('Not implemented')
    }
}
