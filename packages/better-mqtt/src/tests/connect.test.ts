import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('connect async', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    assert.strictEqual(mqtt.status, 'online')

    mqtt.end()
})

test('connect', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = BetterMQTT.connect(connectOptions)

    assert.strictEqual(mqtt.status, 'offline')

    const { resolve, reject, promise } = Promise.withResolvers<string>()

    const timer = setTimeout(() => reject(), 3500)

    mqtt.on('status', (status) => {
        clearTimeout(timer)
        resolve(status)
    })

    assert.strictEqual(await promise, 'online')
    assert.strictEqual(mqtt.status, 'online')

    mqtt.end()
})
