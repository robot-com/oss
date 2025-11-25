import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type BetterMQTT, stringParser } from '..'
import { SubscriptionManager } from '../subs-manager'
import { Subscription } from '../subscription'
import type { BetterMQTTMessage } from '../types'
import { TEST_TIMEOUT } from './options'

// Mock BetterMQTT
const mockMqtt = {
    unsubscribe: () => {},
} as unknown as BetterMQTT

test('subscription manager', { timeout: TEST_TIMEOUT }, async (t) => {
    await t.test('add subscription', () => {
        const manager = new SubscriptionManager()
        const sub1 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
        })

        // First subscription to a topic
        const result1 = manager.add(sub1)
        assert.strictEqual(result1.resubscribe, true)
        assert.strictEqual(result1.group.topic, 'test/topic')
        assert.strictEqual(result1.group.subs.size, 1)
        assert.ok(result1.group.subs.has(sub1))

        // Second subscription to the same topic
        const sub2 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
        })
        const result2 = manager.add(sub2)
        assert.strictEqual(result2.resubscribe, false)
        assert.strictEqual(result2.group, result1.group)
        assert.strictEqual(result2.group.subs.size, 2)
        assert.ok(result2.group.subs.has(sub2))
    })

    await t.test('add subscription with different options', () => {
        const manager = new SubscriptionManager()
        const sub1 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
            options: { qos: 0 },
        })

        manager.add(sub1)

        const sub2 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
            options: { qos: 1 },
        })

        const result = manager.add(sub2)
        assert.strictEqual(result.resubscribe, true)
        assert.strictEqual(result.group.subs.size, 2)
    })

    await t.test('remove subscription', () => {
        const manager = new SubscriptionManager()
        const sub1 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
        })
        const sub2 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
        })

        manager.add(sub1)
        manager.add(sub2)

        // Remove one subscription
        const group = manager.remove(sub1)
        assert.ok(group)
        assert.strictEqual(group.subs.size, 1)
        assert.ok(!group.subs.has(sub1))
        assert.ok(group.subs.has(sub2))

        // Remove the last subscription
        const group2 = manager.remove(sub2)
        assert.ok(group2)
        assert.strictEqual(group2.subs.size, 0)

        // Verify group is removed from manager (internal check via public API behavior if possible, or just trust return)
        // Since we can't easily check private state, we can try to remove again and expect null
        assert.strictEqual(manager.remove(sub1), null)
    })

    await t.test('handleMessage with subscriptionIdentifier', () => {
        const manager = new SubscriptionManager()
        const sub = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/topic',
            parser: stringParser,
        })

        const { group } = manager.add(sub)
        const subId = group.id

        let receivedMessage: BetterMQTTMessage<string> | null = null
        sub.on('message', (msg) => {
            receivedMessage = msg
        })

        manager.handleMessage('test/topic', Buffer.from('payload'), {
            cmd: 'publish',
            qos: 0,
            dup: false,
            retain: false,
            topic: 'test/topic',
            payload: Buffer.from('payload'),
            properties: {
                subscriptionIdentifier: subId,
            },
        })

        assert.ok(receivedMessage)
        const msg = receivedMessage as BetterMQTTMessage<string>
        assert.strictEqual(msg.content, 'payload')
        assert.strictEqual(msg.topic, 'test/topic')
    })

    await t.test(
        'handleMessage without subscriptionIdentifier (wildcard match)',
        () => {
            const manager = new SubscriptionManager()
            const sub = new Subscription({
                mqtt: mockMqtt,
                topic: 'test/+',
                parser: stringParser,
            })

            manager.add(sub)

            let receivedMessage: BetterMQTTMessage<string> | null = null
            sub.on('message', (msg) => {
                receivedMessage = msg
            })

            manager.handleMessage('test/topic', Buffer.from('payload'), {
                cmd: 'publish',
                qos: 0,
                dup: false,
                retain: false,
                topic: 'test/topic',
                payload: Buffer.from('payload'),
            })

            assert.ok(receivedMessage)
            const msg = receivedMessage as BetterMQTTMessage<string>
            assert.strictEqual(msg.content, 'payload')
            assert.strictEqual(msg.topic, 'test/topic')
            assert.deepStrictEqual(msg.params, ['topic'])
        },
    )

    await t.test('handleMessage retained', () => {
        const manager = new SubscriptionManager()
        // rh: 0 means send retained messages on subscribe
        // But here we are testing the logic inside SubscriptionGroup.handleMessage where it stores retained message if rh < 2

        const sub1 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/retained',
            parser: stringParser,
            options: { rh: 0 },
        })

        const { group } = manager.add(sub1)

        // Simulate receiving a message (which might be retained or just a regular message that gets cached if we implemented that logic,
        // but looking at code:
        // if (this.options.rh < 2) { this.retainedMessage = ... }
        // So any message received by the group becomes the "retainedMessage" if rh < 2.

        manager.handleMessage(
            'test/retained',
            Buffer.from('retained payload'),
            {
                cmd: 'publish',
                qos: 0,
                dup: false,
                retain: false, // The code doesn't check packet.retain, it just caches the last message if rh < 2
                topic: 'test/retained',
                payload: Buffer.from('retained payload'),
                properties: {
                    subscriptionIdentifier: group.id,
                },
            },
        )

        // Now add a new subscription to the same group
        const sub2 = new Subscription({
            mqtt: mockMqtt,
            topic: 'test/retained',
            parser: stringParser,
            options: { rh: 0 },
        })

        let sub2Received: BetterMQTTMessage<string> | null = null
        sub2.on('message', (msg) => {
            sub2Received = msg
        })

        manager.add(sub2)

        assert.ok(sub2Received)
        const msg = sub2Received as BetterMQTTMessage<string>
        assert.strictEqual(msg.content.toString(), 'retained payload')
    })
})
