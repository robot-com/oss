import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('subscribe', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeString('test/better-mqtt/subscribe_1')

    mqtt.publish('test/better-mqtt/subscribe_1', 'test message')

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message')
        break
    }

    mqtt.end()
})

test('subscribe with event handler', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeString('test/better-mqtt/subscribe_1')

    const { promise, resolve } = Promise.withResolvers<void>()

    sub.on('message', (message) => {
        assert.strictEqual(message.content, 'test message')
        resolve()
    })

    mqtt.publish('test/better-mqtt/subscribe_1', 'test message')

    await promise

    mqtt.end()
})

test('multiple messages', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeString('test/better-mqtt/subscribe_2')

    mqtt.publish('test/better-mqtt/subscribe_2', 'test message 1')
    mqtt.publish('test/better-mqtt/subscribe_2', 'test message 2')
    mqtt.publish('test/better-mqtt/subscribe_2', 'test message 3')
    mqtt.publish('test/better-mqtt/subscribe_2', 'test message 4')

    let i = 1
    for await (const message of sub) {
        assert.strictEqual(message.content, `test message ${i}`)
        if (i === 4) {
            break
        }
        i++
    }

    mqtt.end()
})

test('subscribe async', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = await mqtt.subscribeStringAsync('test/better-mqtt/subscribe_2')

    mqtt.publish('test/better-mqtt/subscribe_2', 'test message async')

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message async')
        break
    }

    mqtt.end()
})

test('two subscriptions', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub1 = await mqtt.subscribeStringAsync('test/better-mqtt/subscribe_3')
    const sub2 = await mqtt.subscribeStringAsync('test/better-mqtt/subscribe_3')

    mqtt.publish('test/better-mqtt/subscribe_3', 'test message async')

    for await (const message of sub1) {
        assert.strictEqual(message.content, 'test message async')
        break
    }

    for await (const message of sub2) {
        assert.strictEqual(message.content, 'test message async')
        break
    }

    mqtt.end()
})

test('unsubscribe', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = await mqtt.subscribeStringAsync('test/better-mqtt/subscribe_4')

    mqtt.publish('test/better-mqtt/subscribe_4', 'test message to unsubscribe')

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message to unsubscribe')
        break
    }

    mqtt.unsubscribe(sub)

    mqtt.publish(
        'test/better-mqtt/subscribe_4',
        'this message should not be received',
    )

    let received = false
    for await (const _ of sub) {
        received = true
    }

    assert.strictEqual(received, false)

    mqtt.end()
})

test(
    'unsubscribe only one subscription',
    { timeout: TEST_TIMEOUT },
    async () => {
        const mqtt = await BetterMQTT.connectAsync(connectOptions)

        const sub1 = await mqtt.subscribeStringAsync(
            'test/better-mqtt/subscribe_5',
        )
        const sub2 = await mqtt.subscribeStringAsync(
            'test/better-mqtt/subscribe_5',
        )

        mqtt.publish(
            'test/better-mqtt/subscribe_5',
            'test message to unsubscribe',
        )

        for await (const message of sub1) {
            assert.strictEqual(message.content, 'test message to unsubscribe')
            break
        }

        mqtt.unsubscribe(sub1)

        mqtt.publish(
            'test/better-mqtt/subscribe_5',
            'this message should not be received',
        )

        let received = false
        for await (const _ of sub1) {
            received = true
        }

        for await (const message of sub2) {
            assert.strictEqual(message.content, 'test message to unsubscribe')
            break
        }

        assert.strictEqual(received, false)

        mqtt.end()
    },
)
