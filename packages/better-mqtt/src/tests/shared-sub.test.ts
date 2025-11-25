import assert from 'node:assert'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { BetterMQTT } from '..'
import { connectOptions, TEST_TIMEOUT } from './options'

test('shared subscription', { timeout: TEST_TIMEOUT }, async () => {
    const mqtt1 = await BetterMQTT.connectAsync({
        ...connectOptions,
        clientId: 'shared_subscription_test_client_1',
    })
    const mqtt2 = await BetterMQTT.connectAsync({
        ...connectOptions,
        clientId: 'shared_subscription_test_client_2',
    })

    const sub1 = await mqtt1.subscribeStringAsync(
        '$share/testing_share_1/test/better-mqtt/share_1',
    )
    const sub2 = await mqtt2.subscribeStringAsync(
        '$share/testing_share_1/test/better-mqtt/share_1',
    )

    const { promise: promise1, resolve: resolve1 } =
        Promise.withResolvers<void>()
    const { promise: promise2, resolve: resolve2 } =
        Promise.withResolvers<void>()
    const { promise: promise3, resolve: resolve3 } =
        Promise.withResolvers<void>()
    const { promise: promise4, resolve: resolve4 } =
        Promise.withResolvers<void>()

    const resolvers = [resolve1, resolve2, resolve3, resolve4]

    const seen = new Set<string>()

    mqtt1.on('error', (err) => {
        console.error('MQTT1 Error:', err)
    })

    mqtt2.on('error', (err) => {
        console.error('MQTT2 Error:', err)
    })

    sub1.on('message', (message) => {
        if (seen.has(message.content)) {
            throw new Error(`Duplicate message received: ${message.content}`)
        }
        seen.add(message.content)
        resolvers.shift()?.()
    })

    sub2.on('message', (message) => {
        if (seen.has(message.content)) {
            throw new Error(`Duplicate message received: ${message.content}`)
        }
        seen.add(message.content)
        resolvers.shift()?.()
    })

    mqtt1.publishAsync('test/better-mqtt/share_1', 'test 1')
    mqtt1.publishAsync('test/better-mqtt/share_1', 'test 2')
    mqtt1.publishAsync('test/better-mqtt/share_1', 'test 3')
    mqtt1.publishAsync('test/better-mqtt/share_1', 'test 4')

    await Promise.all([promise1, promise2, promise3, promise4])

    mqtt1.end()
    mqtt2.end()
})

test(
    'shared subscription thow sares same topic',
    { timeout: TEST_TIMEOUT },
    async () => {
        const mqtt = await BetterMQTT.connectAsync(connectOptions)

        const sub1 = await mqtt.subscribeStringAsync(
            '$share/testing_shares_same_topic_1/test/better-mqtt/shared-sub-same-topic',
        )

        const sub2 = await mqtt.subscribeStringAsync(
            '$share/testing_shares_same_topic_2/test/better-mqtt/shared-sub-same-topic',
        )

        const { promise: promise1, resolve: resolve1 } =
            Promise.withResolvers<void>()
        const { promise: promise2, resolve: resolve2 } =
            Promise.withResolvers<void>()

        const seen1 = new Set<string>()
        const seen2 = new Set<string>()

        let foundDup = false

        sub1.on('message', (message) => {
            if (seen1.has(message.content)) {
                foundDup = true
            }
            seen1.add(message.content)
            resolve1()
        })

        sub2.on('message', (message) => {
            if (seen2.has(message.content)) {
                foundDup = true
            }
            seen2.add(message.content)
            resolve2()
        })

        mqtt.publishAsync('test/better-mqtt/shared-sub-same-topic', 'test 1')

        await setTimeout(2500)

        assert(!foundDup, 'Must not receive the same message twice')

        await Promise.all([promise1, promise2])

        mqtt.end()
    },
)
