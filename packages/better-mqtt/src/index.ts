/** biome-ignore-all lint/suspicious/noExplicitAny: I'm sure it is fine */
import { EventEmitter } from 'ee-ts'
import mqtt, {
    type ErrorWithReasonCode,
    type IClientOptions,
    type MqttClient,
} from 'mqtt'
import { createAsyncGenerator } from './generator'
import { matchTopic } from './match'

export type ConnectArgs =
    | [brokerUrl: string]
    | [brokerUrl: string, opts?: IClientOptions]
    | [opts: IClientOptions]

export interface BetterMQTTEvents {
    status(status: 'online' | 'offline'): void
    error(error: Error | ErrorWithReasonCode): void
    end(): void
}

export type MessageParser<T = string> = (message: Buffer) => T

export function stringParser(message: Buffer): string {
    return message.toString('utf8')
}

export function jsonParser<T = unknown>(message: Buffer): T {
    return JSON.parse(message.toString('utf8'))
}

export function binaryParser(message: Buffer): Buffer {
    return message
}

export class BetterMQTT extends EventEmitter<BetterMQTTEvents> {
    readonly client: MqttClient
    error: Error | ErrorWithReasonCode | null = null

    private lasteSubIdentifier = 0
    getNextSubIdentifier() {
        return ++this.lasteSubIdentifier
    }

    get status() {
        return this.client.connected ? 'online' : 'offline'
    }

    private sharedMqttSubscriptions: Map<
        string,
        { id: number; set: Set<Subscription<unknown>> }
    > = new Map()

    constructor(client: MqttClient) {
        super()

        this.client = client
        this.client.on('offline', () => {
            this.emit('status', 'offline')
        })

        this.client.on('connect', () => {
            this.emit('status', 'online')
        })

        this.client.on('connect', () => {
            this.emit('status', 'online')
        })

        this.client.on('error', (error) => {
            this.error = error
            this.emit('error', error)
        })

        this.client.on('message', (topic, message, packet) => {
            const subscriptions: [Set<Subscription<unknown>>, string[]][] = []
            for (const [
                pattern,
                { set, id },
            ] of this.sharedMqttSubscriptions.entries()) {
                if (
                    Number.isInteger(
                        packet.properties?.subscriptionIdentifier,
                    ) &&
                    id !== packet.properties?.subscriptionIdentifier
                ) {
                    continue
                }

                const match = matchTopic(topic, pattern)
                if (match) {
                    subscriptions.push([set, match.params])
                }
            }

            for (const [set, params] of subscriptions) {
                for (const sub of set) {
                    sub.handleMessage(message, topic, params)
                }
            }
        })
    }

    publish(
        topic: string,
        message: string | Buffer,
        opts?: { qos?: 0 | 1 | 2 },
    ) {
        this.client.publish(topic, message, { qos: opts?.qos ?? 2 })
    }

    async publishAsync(topic: string, message: string | Buffer): Promise<void> {
        this.client.publishAsync(topic, message)
    }

    publishJson<T>(topic: string, message: T) {
        this.publish(topic, JSON.stringify(message))
    }

    async publishJsonAsync<T>(topic: string, message: T): Promise<void> {
        await this.publishAsync(topic, JSON.stringify(message))
    }

    unsubscribe(sub: Subscription<unknown>) {
        const set = this.sharedMqttSubscriptions.get(sub.topic)?.set
        if (set) {
            sub.emit('end')
            set.delete(sub)
            if (set.size === 0) {
                this.sharedMqttSubscriptions.delete(sub.topic)
                this.client.unsubscribe(sub.topic)
            }
        }
    }

    subscribe<T>(topic: string, parser: MessageParser<T>): Subscription<T> {
        const sub = new Subscription<T>({ mqtt: this, topic, parser })

        const s = this.sharedMqttSubscriptions.get(topic)
        if (s) {
            s.set.add(sub)
            sub.mqttSubIdentifier = s.id
        } else {
            const id = this.getNextSubIdentifier()
            this.sharedMqttSubscriptions.set(topic, { id, set: new Set([sub]) })
            this.client.subscribe(topic, {
                qos: 2,
                rh: 2,
                properties: {
                    subscriptionIdentifier: id,
                },
            })
        }

        return sub
    }

    subscribeString(topic: string): Subscription<string> {
        return this.subscribe(topic, stringParser)
    }

    subscribeJson<T>(topic: string): Subscription<T> {
        return this.subscribe<T>(topic, jsonParser)
    }

    // TODO: Subscribe zod

    subscribeBinary(topic: string): Subscription<Buffer> {
        return this.subscribe(topic, binaryParser)
    }

    async subscribeAsync<T>(
        topic: string,
        parser: MessageParser<T>,
    ): Promise<Subscription<T>> {
        const sub = new Subscription<T>({ mqtt: this, topic, parser })

        const s = this.sharedMqttSubscriptions.get(topic)
        if (s) {
            s.set.add(sub)
            sub.mqttSubIdentifier = s.id
        } else {
            const id = this.getNextSubIdentifier()
            this.sharedMqttSubscriptions.set(topic, { id, set: new Set([sub]) })
            await this.client.subscribeAsync(topic, {
                properties: { subscriptionIdentifier: id },
            })
        }

        return sub
    }

    async subscribeStringAsync(topic: string): Promise<Subscription<string>> {
        return this.subscribeAsync(topic, stringParser)
    }

    async subscribeJsonAsync<T>(topic: string): Promise<Subscription<T>> {
        return this.subscribeAsync<T>(topic, jsonParser)
    }

    async subscribeBinaryAsync(topic: string): Promise<Subscription<Buffer>> {
        return this.subscribeAsync(topic, binaryParser)
    }

    static async connectAsync(...args: ConnectArgs): Promise<BetterMQTT> {
        const client = await mqtt.connectAsync(...(args as [any, any]))
        return new BetterMQTT(client)
    }

    static connect(...args: ConnectArgs): BetterMQTT {
        const client = mqtt.connect(...(args as [any, any]))
        return new BetterMQTT(client)
    }

    end() {
        this.client.end()
        this.emit('end')
    }
}

export interface BetterMQTTMessage<T> {
    topic: string
    content: T
    params: string[]
}

export interface SubscriptionEvents<T> {
    message(message: BetterMQTTMessage<T>): void
    end(): void
    error(error: Error): void
}

export class Subscription<T = string> extends EventEmitter<
    SubscriptionEvents<T>
> {
    mqttSubIdentifier: number | undefined

    private mqtt: BetterMQTT

    private generator: AsyncGenerator<BetterMQTTMessage<T>>

    topic: string

    parser: (message: Buffer) => T

    constructor(opts: {
        mqtt: BetterMQTT
        topic: string
        parser: (message: Buffer) => T
    }) {
        super()

        this.mqtt = opts.mqtt
        this.topic = opts.topic
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
