import { jetstream } from '@nats-io/jetstream'
import { connect } from '@nats-io/transport-node'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { RPCClientNATS } from './client'
import { RPCError } from './error'
import { defineProcedure } from './procedure'
import { startRpcNatsServer } from './server'
import { Registry } from './server/registry'

test('api', async () => {
    const api = {
        demo: defineProcedure({
            path: 'demo.$id',
            method: 'GET',
            inputSchema: z.null(),
            outputSchema: z.object({ name: z.string() }),
            paramsSchema: z.object({ id: z.string() }),
        }),
    }

    const registry = new Registry({
        initialContext: null,
        middleware: async (_, req) => {
            return {
                req,
            }
        },
    })

    registry.impl(api.demo, async () => {
        return {
            data: { name: 'test' },
        }
    })

    const match = registry.match('GET', 'demo/123')

    assert(match !== undefined)
    assert(match.params.id === '123')
    assert(match.handler !== undefined)
    assert(match.procedure.paramsSchema.parse(match.params) !== undefined)
    assert(match.procedure.inputSchema.parse({ filter: 'test' }) !== undefined)

    const out = await match.handler({
        msg: {
            ack: async () => {
                return
            },
            nack: async () => {
                return
            },
        },
        ctx: match.middleware(null, {
            procedure: match.procedure,
            msg: null,
        }),
        params: match.procedure.paramsSchema.parse(match.params),
        input: match.procedure.inputSchema.parse({ filter: 'test' }),
    })

    assert('data' in out)
    assert(out !== undefined)
    assert(match.procedure.outputSchema.parse(out.data) !== undefined)
    assert(out.data.name === 'test')
    assert(match.procedure.outputSchema.parse(out.data).name === 'test')
    assert(
        match.procedure.inputSchema.parse({ filter: 'test' }).filter === 'test'
    )
    assert(match.procedure.paramsSchema.parse(match.params).id === '123')
})

test('rpc full', async () => {
    const ncsrv = await connect({
        servers: [process.env.NATS_URL!],
        token: process.env.NATS_TOKEN,
    })

    const js = jetstream(ncsrv)

    const man = await js.jetstreamManager()

    await man.streams.delete('engine_test_requests')

    await man.streams.add({
        name: 'engine_test_requests',
        subjects: ['engine_test.requests.>'],
        retention: 'workqueue',
    })

    await man.consumers.add('engine_test_requests', {
        name: 'handler',
        durable_name: 'handler',
        ack_policy: 'explicit',
    })

    // const consumer = await js.consumers.get('engine_test_requests', 'handler')

    const api = {
        demo: defineProcedure({
            path: 'demo.$id',
            method: 'GET',
            inputSchema: z.object({ filter: z.string() }),
            outputSchema: z.object({ name: z.string() }),
            paramsSchema: z.object({ id: z.string() }),
        }),
    }

    const registry = new Registry({
        initialContext: null,
        middleware: async (_, req) => {
            const authorized =
                req.msg?.headers?.get('Authorization') === 'DemoAuthHeader'
            if (!authorized) {
                throw new RPCError('UNAUTHORIZED', 'Unauthorized')
            }

            return {
                req,
            }
        },
    }).impl(api.demo, async () => {
        return { data: { name: 'John Doe' } }
    })

    const server = await startRpcNatsServer({
        nats: ncsrv,
        streamName: 'engine_test_requests',
        consumerName: 'handler',
        subjectPrefix: 'engine_test.requests.',
        registry,
    })

    const ncclient = await connect({
        servers: [process.env.NATS_URL!],
        token: process.env.NATS_TOKEN,
    })

    const client = new RPCClientNATS({
        nats: ncclient,
        publishPrefix: 'engine_test.requests.',
        headers: {
            Authorization: 'DemoAuthHeader',
        },
    })

    const res = await client.call(api.demo, {
        params: { id: '123' },
        input: { filter: 'test' },
    })

    assert.equal(res.name, 'John Doe')

    await server.stop()
    await ncclient.drain()
    await ncsrv.drain()
})
