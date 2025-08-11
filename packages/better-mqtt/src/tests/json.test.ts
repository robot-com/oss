import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('json publish', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeJson('test/better-mqtt/json_1')

    mqtt.publishJson('test/better-mqtt/json_1', { message: 'test message' })

    for await (const message of sub) {
        assert.deepEqual(message.content, { message: 'test message' })
        break
    }

    mqtt.end()
})
