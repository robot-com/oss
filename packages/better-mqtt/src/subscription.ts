import { EventEmitter } from 'ee-ts'
import type { BetterMQTT } from '.'
import { createAsyncGenerator } from './generator'
import type { BetterMQTTMessage, SubscriptionOptions } from './types'

export interface SubscriptionEvents<T> {
    message(message: BetterMQTTMessage<T>): void
    end(): void
    error(error: Error): void
}

export class Subscription<T = string> extends EventEmitter<
    SubscriptionEvents<T>
> {
    private mqtt: BetterMQTT

    private generator: AsyncGenerator<BetterMQTTMessage<T>>

    topic: string

    /** Subscription options */
    options: SubscriptionOptions

    parser: (message: Buffer) => T

    constructor(opts: {
        mqtt: BetterMQTT
        topic: string
        parser: (message: Buffer) => T
        options?: Partial<SubscriptionOptions>
    }) {
        super()

        this.mqtt = opts.mqtt
        this.topic = opts.topic
        this.options = {
            qos: opts.options?.qos ?? 2,
            rh: opts.options?.rh ?? 2,
            rap: opts.options?.rap ?? false,
            nl: opts.options?.nl ?? false,
        }
        this.parser = opts.parser

        const { generator, push, end, throwError } =
            createAsyncGenerator<BetterMQTTMessage<T>>()

        this.on('message', (message) => {
            push(message)
        })

        this.on('end', () => {
            end()
        })

        this.on('error', (error) => {
            throwError(error)
        })

        this.generator = generator
    }

    handleMessage(
        message: Buffer<ArrayBufferLike>,
        topic: string,
        params: string[],
    ) {
        const parsedMessage = this.parser(message)
        this.emit('message', { topic, content: parsedMessage, params })
    }

    // The method that makes the class async iterable
    [Symbol.asyncIterator](): AsyncGenerator<BetterMQTTMessage<T>> {
        return this.generator
    }

    end() {
        this.mqtt.unsubscribe(this)
    }
}
