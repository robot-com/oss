import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('cleanup on unsubscribe', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = await mqtt.subscribeStringAsync('test/better-mqtt/cleanup_1')
    const iterator = sub[Symbol.asyncIterator]()

    // Ensure subscription is active
    mqtt.publish('test/better-mqtt/cleanup_1', 'message 1')
    const first = await iterator.next()
    assert.strictEqual(first.value.content, 'message 1')
    assert.strictEqual(first.done, false)

    // Unsubscribe
    mqtt.unsubscribe(sub)

    // The iterator should end
    // We use Promise.race to ensure it doesn't hang if implementation is broken
    const next = await Promise.race([
        iterator.next(),
        new Promise<{ value: unknown; done: boolean }>((_, reject) =>
            setTimeout(() => reject(new Error('Iterator did not close')), 1000),
        ),
    ])

    assert.strictEqual(next.done, true)
    assert.strictEqual(next.value, undefined)

    mqtt.end()
})

test('cleanup on client end', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = await mqtt.subscribeStringAsync('test/better-mqtt/cleanup_2')
    const iterator = sub[Symbol.asyncIterator]()

    mqtt.publish('test/better-mqtt/cleanup_2', 'message 1')
    const first = await iterator.next()
    assert.strictEqual(first.value.content, 'message 1')

    // End client
    mqtt.end()

    // The iterator should end
    const next = await Promise.race([
        iterator.next(),
        new Promise<{ value: unknown; done: boolean }>((_, reject) =>
            setTimeout(() => reject(new Error('Iterator did not close')), 1000),
        ),
    ])

    assert.strictEqual(next.done, true)
})
