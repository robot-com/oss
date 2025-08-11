import { test } from 'node:test'
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
        '$share/testing_share_1/test/better-mqtt/share_1'
    )
    const sub2 = await mqtt2.subscribeStringAsync(
        '$share/testing_share_1/test/better-mqtt/share_1'
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
