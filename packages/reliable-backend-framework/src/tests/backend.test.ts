/** biome-ignore-all lint/complexity/noBannedTypes: Needed for testing */

import assert from 'node:assert'
import test from 'node:test'
import { eq, inArray } from 'drizzle-orm'
import { v7 } from 'uuid'
import z from 'zod'
import { defineBackend } from '../server/app'
import { Backend } from '../server/backend'
import { RBFError } from '../server/error'
import { createConsoleLogger } from '../types/logger'
import { createTestContext, posts } from './context'

const { db, nats } = await createTestContext()

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

await test('backend tests sequentially', { concurrency: false }, async (t) => {
    await t.test('basic query', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const getRequest = app.query('requests', {
            path: 'requests.get.query',
            handler: async () => {
                return {
                    id: '123',
                }
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const r = await backend.query(getRequest, {})
        assert.strictEqual(r.id, '123')

        await backend.stop()
    })

    await t.test('basic mutation', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postId = v7()

        const postRequest = app.mutation('requests', {
            path: 'requests.post.mutation',
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
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const r = await backend.mutate(postRequest, {})
        assert.strictEqual(r.id, postId)

        const [post] = await db.select().from(posts).where(eq(posts.id, postId))
        assert.strictEqual(post.id, postId)

        await backend.stop()
    })

    await t.test('with input', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postRequest = app.mutation('requests', {
            path: 'requests.post.mutation-w-i.$param0',
            input: z.object({
                param1: z.string().optional(),
            }),
            output: z.boolean(),
            handler: async () => {
                return true
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })

        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        await backend.mutate(postRequest, {
            params: { param0: 'test' },
            input: { param1: 'test' },
        })

        await backend.stop()
    })

    await t.test('retry once mutation', async () => {
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
            path: 'requests.post.retry',
            handler: async ({ db }) => {
                if (!retried) {
                    retried = true
                    throw new Error('Retrying...')
                }
                await db.insert(posts).values({
                    id: postId,
                    name: 'Test Post',
                })
                return { id: postId }
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const r = await backend.mutate(postRequest, {})
        assert.strictEqual(r.id, postId)

        const [post] = await db.select().from(posts).where(eq(posts.id, postId))
        assert.strictEqual(post.id, postId)

        await backend.stop()
    })

    await t.test('custom error', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const getRequest = app.query('requests', {
            path: 'requests.get.error',
            handler: async () => {
                throw new RBFError('CONFLICT', 'Custom conflict error')
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })
        const r = await backend
            .query(getRequest, {})
            .then(() => {
                throw new Error('Expected error')
            })
            .catch((e) => e)

        assert(r instanceof RBFError)

        await backend.stop()
    })

    await t.test('with params', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const getRequest = app.query('requests', {
            path: 'requests.get.params.$id.$slug',
            handler: async ({ params }) => {
                assert.strictEqual(params.id, 'req-123')
                assert.strictEqual(params.slug, 'test-slug')

                return params.id
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const r = await backend.query(getRequest, {
            params: {
                id: 'req-123',
                slug: 'test-slug',
            },
        })

        assert.strictEqual(r, 'req-123')

        await backend.stop()
    })

    await t.test('idempotency with custom request id', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postId = v7()
        await db.insert(posts).values({
            id: postId,
            name: 'Idempotency Test',
            views: 0,
        })

        const incrementViews = app.mutation('requests', {
            path: 'posts.views.increment',
            handler: async ({ db }) => {
                const [post] = await db
                    .select()
                    .from(posts)
                    .where(eq(posts.id, postId))
                await db
                    .update(posts)
                    .set({ views: (post.views ?? 0) + 1 })
                    .where(eq(posts.id, postId))

                return { id: postId, views: (post.views ?? 0) + 1 }
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const requestId = `test-idempotency-${v7()}`

        // First call
        const r1 = await backend.mutate(incrementViews, { requestId })
        assert.strictEqual(r1.views, 1)

        // Second call with the same request ID
        const r2 = await backend.mutate(incrementViews, { requestId })
        assert.strictEqual(r2.views, 1) // Should return cached result

        const [finalPost] = await db
            .select()
            .from(posts)
            .where(eq(posts.id, postId))
        assert.strictEqual(finalPost.views, 1) // Assert it only ran once

        await backend.stop()
    })

    await t.test('idempotency with concurrent requests', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postId = v7()
        await db.insert(posts).values({
            id: postId,
            name: 'Idempotency Test',
            views: 0,
        })

        const incrementViews = app.mutation('requests', {
            path: 'posts.views.increment',
            handler: async ({ db }) => {
                const [post] = await db
                    .select()
                    .from(posts)
                    .where(eq(posts.id, postId))
                await db
                    .update(posts)
                    .set({ views: (post.views ?? 0) + 1 })
                    .where(eq(posts.id, postId))

                return { id: postId, views: (post.views ?? 0) + 1 }
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const requestId = `test-idempotency-${v7()}`

        // First call
        const [r1, r2] = await Promise.all([
            backend.mutate(incrementViews, { requestId }),
            backend.mutate(incrementViews, { requestId }),
        ])

        assert.strictEqual(r1.views, 1)

        // Second call with the same request ID
        assert.strictEqual(r2.views, 1) // Should return cached result

        const [finalPost] = await db
            .select()
            .from(posts)
            .where(eq(posts.id, postId))
        assert.strictEqual(finalPost.views, 1) // Assert it only ran once

        await backend.stop()
    })

    await t.test('middleware correctly augments context', async () => {
        const baseApp = defineBackend({
            queues: {
                requests: { subject: 'requests' },
            },
        })

        const appWithUser = baseApp.middleware(async () => {
            return {
                ctx: {
                    user: { id: 'user_123' },
                },
            }
        })

        const getContextUser = appWithUser.query('requests', {
            path: 'context.user.get',
            handler: async ({ ctx }) => {
                assert.deepStrictEqual(ctx.user, { id: 'user_123' })
                return ctx.user
            },
        })

        const backend = new Backend(appWithUser, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        const user = await backend.query(getContextUser, {})
        assert.deepStrictEqual(user, { id: 'user_123' })

        await backend.stop()
    })

    await t.test('transactional outbox enqueue success', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postId1 = v7()
        const postId2 = v7()

        // This is the task that gets enqueued
        const createSecondPost = app.mutation('requests', {
            path: 'posts.create.second',
            handler: async ({ db }) => {
                await db
                    .insert(posts)
                    .values({ id: postId2, name: 'Second Post' })

                return { id: postId2 }
            },
        })

        // This is the initial task
        const createFirstPost = app.mutation('requests', {
            path: 'posts.create.first',
            handler: async ({ db, scheduler }) => {
                await db
                    .insert(posts)
                    .values({ id: postId1, name: 'First Post' })

                scheduler.enqueue(createSecondPost, {
                    input: undefined,
                    params: {},
                })
                return { id: postId1 }
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        await backend.mutate(createFirstPost, {})

        // Give NATS time to process the enqueued message
        await new Promise((resolve) => setTimeout(resolve, 3000))

        const r = await db
            .select()
            .from(posts)
            .where(inArray(posts.id, [postId1, postId2]))

        assert.equal(r.length, 2, 'Two posts should exist')

        await backend.stop()
    })

    await t.test('transactional outbox enqueue rollback', async () => {
        const app = defineBackend({
            queues: {
                requests: {
                    subject: 'requests',
                },
            },
        })

        const postId1 = v7()
        const postId2 = v7()

        const createSecondPost = app.mutation('requests', {
            path: 'posts.create.second.rollback',
            handler: async ({ db }) => {
                await db
                    .insert(posts)
                    .values({ id: postId2, name: 'Second Post' })
                return { id: postId2 }
            },
        })

        let touch = false

        const createFirstPostAndFail = app.mutation('requests', {
            path: 'posts.create.first.fail',
            handler: async ({ db, scheduler }) => {
                await db
                    .insert(posts)
                    .values({ id: postId1, name: 'First Post' })
                scheduler.enqueue(createSecondPost, {
                    input: null,
                    params: {},
                })

                touch = true

                throw new Error('Intentional failure to trigger rollback')
            },
        })

        const backend = new Backend(app, {
            db,
            nats,
            logger: createConsoleLogger(),
        })
        backend.start()
        t.after(async () => {
            if (backend.running) {
                await backend.stop()
            }
        })

        try {
            await backend.mutate(createFirstPostAndFail, {
                timeout: 20 * 1000,
                retries: 1,
            })
            throw new Error('Expected mutation to fail')
        } catch (error) {
            assert(error instanceof RBFError)
            assert(error.code === 'ABORTED')
        }

        // Give some time to ensure the message is NOT processed
        await new Promise((resolve) => setTimeout(resolve, 5000))

        const r = await db
            .select()
            .from(posts)
            .where(inArray(posts.id, [postId1, postId2]))

        assert.equal(r.length, 0, 'No posts should exist')

        assert.equal(
            touch,
            true,
            'The mutation handler should have been invoked',
        )

        await backend.stop()
    })

    // await t.test('massive concurrent requests', async () => {
    //     const app = defineBackend({
    //         queues: {
    //             requests: {
    //                 subject: 'requests',
    //             },
    //         },
    //     })

    //     const getRequest = app.query('requests', {
    //         path: 'requests.get.query.massive',
    //         handler: async () => {
    //             await new Promise((resolve) => setTimeout(resolve, 1000))
    //             return {
    //                 id: '123',
    //             }
    //         },
    //     })

    //     const backend = new Backend(app, {
    //         db,
    //         nats,
    //         logger: createConsoleLogger(),
    //     })
    //     backend.start()
    //     t.after(async () => {
    //         if (backend.running) {
    //             await backend.stop()
    //         }
    //     })

    //     const promises: Promise<unknown>[] = []

    //     for (let i = 0; i < 100; i++) {
    //         promises.push(backend.query(getRequest, {}))
    //     }

    //     const r = await Promise.allSettled(promises)

    //     const rejected = r.filter((result) => result.status === 'rejected')
    //     const fulfilled = r.filter((result) => result.status === 'fulfilled')

    //     assert(rejected.length === 0)
    //     assert(fulfilled.length === 100)

    //     await backend.stop()
    // })
})
