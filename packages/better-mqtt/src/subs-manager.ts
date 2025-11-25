import type { IPublishPacket } from 'mqtt'
import { matchTopic } from './match'
import type { Subscription } from './subscription'
import type { BetterMQTTMessage, SubscriptionOptions } from './types'

/**
 * This is a group of virtual subscriptions (`Subscription` class).
 * Multiple subscriptions can be grouped together if they have the same topic.
 *
 * There is a single SubscriptionGroup per topic.
 * This is due to the fact that MQTT protocol does not allow for
 * multiple subscriptions with the same topic, even if they have different options.
 */
class SubscriptionGroup {
    topic: string
    id: number
    subs: Set<Subscription<unknown>>
    options: SubscriptionOptions

    retainedMessage: BetterMQTTMessage<Buffer<ArrayBufferLike>> | null = null

    constructor(topic: string, id: number, options: SubscriptionOptions) {
        this.topic = topic
        this.id = id
        this.subs = new Set()
        this.options = options
    }

    handleMessage(
        topic: string,
        message: Buffer<ArrayBufferLike>,
        _packet: IPublishPacket,
        params?: string[],
    ) {
        const match = params ? { params } : matchTopic(topic, this.topic)

        if (!match) {
            return
        }

        if (this.options.rh < 2) {
            this.retainedMessage = {
                topic,
                content: message,
                params: match.params,
            }
        }

        for (const sub of this.subs) {
            sub.handleMessage(message, topic, match.params)
        }
    }

    add(sub: Subscription<unknown>): boolean {
        this.subs.add(sub)

        // If we have a retained message, we need to send it to the new subscription
        if (this.retainedMessage) {
            sub.handleMessage(
                this.retainedMessage.content,
                this.retainedMessage.topic,
                this.retainedMessage.params,
            )
        }

        if (sub.options.qos !== this.options.qos) {
            return true
        }

        if (sub.options.rh !== this.options.rh) {
            return true
        }

        if (sub.options.rap !== this.options.rap) {
            return true
        }

        if (sub.options.nl !== this.options.nl) {
            return true
        }

        return false
    }

    remove(sub: Subscription<unknown>) {
        this.subs.delete(sub)
    }

    isEmpty() {
        return this.subs.size === 0
    }
}

type SubscriptionAddResult = {
    group: SubscriptionGroup
    resubscribe: boolean
}

export class SubscriptionManager {
    private nextSubIdentifier = 0

    /**
     * Subscription groups by subscription identifier
     */
    private subsById = new Map<number, SubscriptionGroup>()

    /**
     * Subscription groups by topic
     */
    private subsByTopic = new Map<string, SubscriptionGroup>()

    nextId() {
        return ++this.nextSubIdentifier
    }

    add(sub: Subscription<unknown>): SubscriptionAddResult {
        const entry = this.subsByTopic.get(sub.topic)
        // Existing group found
        if (entry) {
            // Add subscription to group
            return {
                resubscribe: entry.add(sub),
                group: entry,
            }
        }

        const id = this.nextId()
        const group = new SubscriptionGroup(sub.topic, id, sub.options)
        this.subsById.set(id, group)
        this.subsByTopic.set(sub.topic, group)
        group.add(sub)
        return {
            resubscribe: true,
            group,
        }
    }

    remove(sub: Subscription<unknown>) {
        const group = this.subsByTopic.get(sub.topic)

        // Subscription not registered
        if (!group) {
            return null
        }

        // Remove subscription from group
        group.remove(sub)

        // If group is empty, remove it
        if (group.isEmpty()) {
            this.subsById.delete(group.id)
            this.subsByTopic.delete(group.topic)
            return group
        }

        return group
    }

    handleMessage(
        topic: string,
        message: Buffer<ArrayBufferLike>,
        packet: IPublishPacket,
    ) {
        const subId = packet.properties?.subscriptionIdentifier
        if (!subId) {
            // Fallback if no subscription identifier is present
            for (const [subTopic, group] of this.subsByTopic.entries()) {
                const match = matchTopic(topic, subTopic)
                if (!match) {
                    continue
                }

                group.handleMessage(topic, message, packet)
            }

            return
        }

        const subsIds = Array.isArray(subId) ? subId : [subId]
        for (const id of subsIds) {
            const group = this.subsById.get(id)
            if (!group) {
                continue
            }

            group.handleMessage(topic, message, packet)
        }
    }
}
