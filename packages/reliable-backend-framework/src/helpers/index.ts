import { jetstreamManager } from '@nats-io/jetstream'
import type { NatsConnection } from '@nats-io/nats-core'

export async function createQueue(
    nc: NatsConnection,
    opts: {
        streamName: string
        consumerName?: string
        subject: string
    },
) {
    const jsm = await jetstreamManager(nc)

    let subject = opts.subject

    if (!subject.endsWith('.>')) {
        if (!subject.endsWith('.')) {
            subject += '.'
        }

        subject += '>'
    }

    await jsm.streams.add({
        name: opts.streamName,
        subjects: [subject],
        retention: 'workqueue',
    })

    await jsm.consumers.add(opts.streamName, {
        durable_name: opts.consumerName ?? opts.streamName,
        ack_policy: 'explicit',
    })
}
