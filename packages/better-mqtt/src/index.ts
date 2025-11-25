/** biome-ignore-all lint/suspicious/noExplicitAny: I'm sure it is fine */
import { EventEmitter } from 'ee-ts'
import mqtt, {
    type ErrorWithReasonCode,
    type IClientOptions,
    type MqttClient,
} from 'mqtt'
import { SubscriptionManager } from './subs-manager'
import { Subscription } from './subscription'
import type { SubscriptionOptions } from './types'

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

    get status() {
        return this.client.connected ? 'online' : 'offline'
    }

    private subscriptions: SubscriptionManager = new SubscriptionManager()

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

        this.client.off('end', () => {
            this.end(false)
        })

        this.client.on('message', (topic, message, packet) => {
            this.subscriptions.handleMessage(topic, message, packet)
        })
    }

    publish(
        topic: string,
        message: string | Buffer,
        opts?: { qos?: 0 | 1 | 2; dup?: boolean; retain?: boolean },
    ) {
        this.client.publish(topic, message, {
            qos: opts?.qos ?? 2,
            dup: opts?.dup,
            retain: opts?.retain,
        })
    }

    async publishAsync(
        topic: string,
        message: string | Buffer,
        opts?: { qos?: 0 | 1 | 2; dup?: boolean; retain?: boolean },
    ): Promise<void> {
        await this.client.publishAsync(topic, message, {
            qos: opts?.qos ?? 2,
            dup: opts?.dup,
            retain: opts?.retain,
        })
    }

    publishJson<T>(topic: string, message: T) {
        this.publish(topic, JSON.stringify(message))
    }

    async publishJsonAsync<T>(topic: string, message: T): Promise<void> {
        await this.publishAsync(topic, JSON.stringify(message))
    }

    unsubscribe(sub: Subscription<unknown>) {
        sub.emit('end')
        const group = this.subscriptions.remove(sub)
        if (group?.isEmpty()) {
            this.client.unsubscribe(group.topic)
        }
    }

    subscribe<T>(
        topic: string,
        parser: MessageParser<T>,
        options?: Partial<SubscriptionOptions>,
    ): Subscription<T> {
        const sub = new Subscription<T>({ mqtt: this, topic, parser, options })

        const { resubscribe, group } = this.subscriptions.add(sub)

        if (resubscribe) {
            this.client.subscribe(sub.topic, {
                qos: sub.options.qos,
                rh: sub.options.rh,
                rap: sub.options.rap,
                nl: sub.options.nl,
                properties: {
                    subscriptionIdentifier: group.id,
                },
            })
        }

        return sub
    }

    subscribeString(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Subscription<string> {
        return this.subscribe(topic, stringParser, options)
    }

    subscribeJson<T>(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Subscription<T> {
        return this.subscribe<T>(topic, jsonParser, options)
    }

    // TODO: Subscribe zod

    subscribeBinary(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Subscription<Buffer> {
        return this.subscribe(topic, binaryParser, options)
    }

    async unsubscribeAsync(sub: Subscription<unknown>) {
        sub.emit('end')
        const group = this.subscriptions.remove(sub)
        if (group?.isEmpty()) {
            await this.client.unsubscribeAsync(group.topic)
        }
    }

    async subscribeAsync<T>(
        topic: string,
        parser: MessageParser<T>,
        options?: Partial<SubscriptionOptions>,
    ): Promise<Subscription<T>> {
        const sub = new Subscription<T>({ mqtt: this, topic, parser, options })

        const { resubscribe, group } = this.subscriptions.add(sub)

        if (resubscribe) {
            await this.client.subscribeAsync(sub.topic, {
                qos: sub.options.qos,
                rh: sub.options.rh,
                rap: sub.options.rap,
                nl: sub.options.nl,
                properties: {
                    subscriptionIdentifier: group.id,
                },
            })
        }

        return sub
    }

    async subscribeStringAsync(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Promise<Subscription<string>> {
        return this.subscribeAsync(topic, stringParser, options)
    }

    async subscribeJsonAsync<T>(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Promise<Subscription<T>> {
        return this.subscribeAsync<T>(topic, jsonParser, options)
    }

    async subscribeBinaryAsync(
        topic: string,
        options?: Partial<SubscriptionOptions>,
    ): Promise<Subscription<Buffer>> {
        return this.subscribeAsync(topic, binaryParser, options)
    }

    static async connectAsync(...args: ConnectArgs): Promise<BetterMQTT> {
        const client = await mqtt.connectAsync(...(args as [any, any]))
        return new BetterMQTT(client)
    }

    static connect(...args: ConnectArgs): BetterMQTT {
        const client = mqtt.connect(...(args as [any, any]))
        return new BetterMQTT(client)
    }

    end(endClient = true) {
        const subs = this.subscriptions.all()
        for (const sub of subs) {
            sub.emit('end')
            if (endClient) {
                this.unsubscribe(sub)
            }
        }

        if (endClient) {
            this.client.end()
        }

        this.emit('end')
    }

    async endAsync(endClient = true) {
        const subs = this.subscriptions.all()
        for (const sub of subs) {
            sub.emit('end')
        }

        if (endClient) {
            await Promise.all(subs.map((sub) => this.unsubscribeAsync(sub)))
            await this.client.endAsync()
        }

        this.emit('end')
    }
}
