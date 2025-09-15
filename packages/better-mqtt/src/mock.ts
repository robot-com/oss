/** biome-ignore-all lint/suspicious/noExplicitAny: This is a mock */
import { EventEmitter } from 'ee-ts'
import type { ErrorWithReasonCode, IClientOptions, MqttClient } from 'mqtt'

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
    topic: string
    parser: (message: Buffer) => T

    constructor(opts: {
        mqtt: BetterMQTT
        topic: string
        parser: (message: Buffer) => T
    }) {
        super()
        this.topic = opts.topic
        this.parser = opts.parser
    }

    handleMessage(_message: Buffer, _topic: string, _params: string[]): void {
        // Do nothing
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<
        BetterMQTTMessage<T>,
        any,
        any
    > {
        // This is an empty generator
    }

    end(): void {
        this.emit('end')
    }
}

export class BetterMQTT extends EventEmitter<BetterMQTTEvents> {
    readonly client: MqttClient = new EventEmitter() as any
    error: Error | ErrorWithReasonCode | null = null

    get status() {
        return 'offline' as const
    }

    publish(
        _topic: string,
        _message: string | Buffer,
        _opts?: { qos?: 0 | 1 | 2 },
    ): void {
        // Do nothing
    }

    async publishAsync(
        _topic: string,
        _message: string | Buffer,
    ): Promise<void> {
        return Promise.resolve()
    }

    publishJson<T>(_topic: string, _message: T): void {
        // Do nothing
    }

    async publishJsonAsync<T>(_topic: string, _message: T): Promise<void> {
        return Promise.resolve()
    }

    unsubscribe(_sub: Subscription<unknown>): void {
        // Do nothing
    }

    subscribe<T>(topic: string, parser: MessageParser<T>): Subscription<T> {
        return new Subscription<T>({ mqtt: this, topic, parser })
    }

    subscribeString(topic: string): Subscription<string> {
        return this.subscribe(topic, stringParser)
    }

    subscribeJson<T>(topic: string): Subscription<T> {
        return this.subscribe<T>(topic, jsonParser)
    }

    subscribeBinary(topic: string): Subscription<Buffer> {
        return this.subscribe(topic, binaryParser)
    }

    async subscribeAsync<T>(
        topic: string,
        parser: MessageParser<T>,
    ): Promise<Subscription<T>> {
        return Promise.resolve(
            new Subscription<T>({ mqtt: this, topic, parser }),
        )
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

    static async connectAsync(..._args: ConnectArgs): Promise<BetterMQTT> {
        return Promise.resolve(new BetterMQTT())
    }

    static connect(..._args: ConnectArgs): BetterMQTT {
        return new BetterMQTT()
    }

    end(): void {
        this.emit('end')
    }
}
