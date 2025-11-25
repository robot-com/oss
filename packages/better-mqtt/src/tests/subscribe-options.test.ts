import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('subscribe options retain', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt = await BetterMQTT.connectAsync(connectOptions)

    mqtt.publish(
        'test/better-mqtt/subscribe_options_retain_1',
        'test message',
        {
            retain: true,
        },
    )

    const sub = mqtt.subscribeString(
        'test/better-mqtt/subscribe_options_retain_1',
        {
            rh: 0,
        },
    )

    for await (const message of sub) {
        assert.strictEqual(message.content, 'test message')
        break
    }

    mqtt.end()
})

test(
    'subscribe options retain multiple',
    { timeout: TEST_TIMEOUT },
    async () => {
        const mqtt = await BetterMQTT.connectAsync(connectOptions)

        mqtt.publish(
            'test/better-mqtt/subscribe_options_retain_2',
            'test message',
            {
                retain: true,
            },
        )

        const sub = mqtt.subscribeString(
            'test/better-mqtt/subscribe_options_retain_2',
            {
                rh: 0,
            },
        )

        for await (const message of sub) {
            assert.strictEqual(message.content, 'test message')
            break
        }

        const sub2 = mqtt.subscribeString(
            'test/better-mqtt/subscribe_options_retain_2',
            {
                rh: 0,
            },
        )

        for await (const message of sub2) {
            assert.strictEqual(message.content, 'test message')
            break
        }

        mqtt.end()
    },
)
