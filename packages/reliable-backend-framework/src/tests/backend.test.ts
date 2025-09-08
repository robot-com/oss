/** biome-ignore-all lint/complexity/noBannedTypes: Needed for testing */

import assert from 'node:assert'
import test, { after } from 'node:test'
import { eq } from 'drizzle-orm'
import { v7 } from 'uuid'
import { defineBackend } from '../server/app'
import { Backend } from '../server/backend'
import { RBFError } from '../server/error'
import { createTestContext, posts } from './context'

const { db, nats } = await createTestContext()

await test('basic query', async () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const getRequest = app.query('requests', {
        path: 'requests.get',
        handler: async () => {
            return {
                id: '123',
            }
        },
    })

    const backend = new Backend(app, {
        db,
        nats,
    })

    backend.start()

    after(() => backend.stop())

    const r = await backend.query(getRequest, {})

    console.log(r)

    assert.strictEqual(r.id, '123')
})

await test('basic mutation', async () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const postId = v7()

    const postRequest = app.mutation('requests', {
        path: 'requests.post',
        handler: async ({ db }) => {
            await db.insert(posts).values({
                id: postId,
                name: 'Test Post',
            })

            return {
                id: postId,
            }
        },
    })

    const backend = new Backend(app, {
        db,
        nats,
    })

    backend.start()

    after(() => backend.stop())

    const r = await backend.mutate(postRequest, {})

    assert.strictEqual(r.id, postId)

    const [post] = await db.select().from(posts).where(eq(posts.id, postId))

    assert.strictEqual(post.id, postId)
})

await test('retry once mutation', async () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const postId = v7()

    let retried = false

    const postRequest = app.mutation('requests', {
        path: 'requests.post',
        handler: async ({ db }) => {
            if (!retried) {
                retried = true
                throw new Error('Retrying...')
            }

            await db.insert(posts).values({
                id: postId,
                name: 'Test Post',
            })

            return {
                id: postId,
            }
        },
    })

    const backend = new Backend(app, {
        db,
        nats,
    })

    backend.start()

    after(() => backend.stop())

    const r = await backend.mutate(postRequest, {})

    assert.strictEqual(r.id, postId)

    const [post] = await db.select().from(posts).where(eq(posts.id, postId))

    assert.strictEqual(post.id, postId)
})

await test('custom error', async () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const getRequest = app.query('requests', {
        path: 'requests.get',
        handler: async () => {
            throw new RBFError('CONFLICT', 'Custom conflict error')
        },
    })

    const backend = new Backend(app, {
        db,
        nats,
    })

    backend.start()

    after(() => backend.stop())

    const r = await backend
        .query(getRequest, {})
        .then(() => {
            throw new Error('Excpected error')
        })
        .catch((e) => e)
    console.log('r', r)
    assert(r instanceof RBFError)
})
