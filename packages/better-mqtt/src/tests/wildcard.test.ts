import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('wildcard publish (+)', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeString('test/better-mqtt/wildcard_1/+')

    mqtt.publish('test/better-mqtt/wildcard_1_wrong/not-match/1', 'wrong')
    mqtt.publish('test/better-mqtt/wildcard_1/1/wrong', 'wrong')
    mqtt.publish('test/better-mqtt/wildcard_1/1', 'test message')

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message')
        assert.deepStrictEqual(message.params, ['1'])
        assert.strictEqual(message.topic, 'test/better-mqtt/wildcard_1/1')
        break
    }

    mqtt.end()
})

test('wildcard publish (#)', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    const sub = mqtt.subscribeString('test/better-mqtt/wildcard_2/#')

    mqtt.publish('test/better-mqtt/wildcard_2/1/2/3', 'test message')

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message')
        assert.deepStrictEqual(message.params, ['1/2/3'])
        assert.strictEqual(message.topic, 'test/better-mqtt/wildcard_2/1/2/3')
        break
    }

    mqtt.end()
})
