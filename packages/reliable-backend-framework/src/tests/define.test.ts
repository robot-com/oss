/** biome-ignore-all lint/complexity/noBannedTypes: Needed for testing */

import assert from 'node:assert/strict'
import test from 'node:test'
import { expectAssignable, expectType } from 'tsd'
import z from 'zod'
import { defineBackend } from '../server/app'

test('basic', () => {
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

    const postRequest = app.mutation('requests', {
        path: 'requests.post',
        handler: async () => {
            return {
                id: '123',
            }
        },
    })

    assert.equal(app._queues.requests, getRequest._queue)
    assert.equal(app._queues.requests, postRequest._queue)
    assert.equal(app._context, postRequest._context)
    assert.equal(app._schema, postRequest._schema)
    assert.equal(app._middleware, postRequest._middleware)
    assert.equal(app._middleware, getRequest._middleware)
    assert.equal(app._middleware, postRequest._middleware)

    assert.equal(app.registry.match('requests.get')?.definition, getRequest)
})

test('with context', () => {
    const _app = defineBackend({
        context: {
            env: 'testing' as const,
        },
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const _getRequest = _app.query('requests', {
        path: 'requests.get',
        handler: async ({ ctx }) => {
            expectAssignable<{
                env: 'testing'
            }>(ctx)
            return {
                id: '123',
            }
        },
    })
})

test('with input', () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const _getRequest = app.query('requests', {
        path: 'requests.get',
        input: z.object({
            id: z.string(),
        }),
        handler: async ({ input }) => {
            expectType<{
                id: string
            }>(input)
            return {
                id: input.id,
            }
        },
    })
})

test('with output', () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const _getRequest = app.query('requests', {
        path: 'requests.get',
        output: z.object({
            id: z.string(),
        }),
        handler: async () => {
            return {
                id: '123',
            }
        },
    })
})

test('with params', () => {
    const app = defineBackend({
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const _getRequest = app.query('requests', {
        path: 'requests.get.$id',
        handler: async ({ params }) => {
            expectType<{
                id: string
            }>(params)
            return {
                id: params.id,
            }
        },
    })
})

test('with middleware', () => {
    const app = defineBackend({
        context: {
            env: 'testing' as const,
        },
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const appWithOrg = app.middleware(async (args) => {
        return {
            ctx: {
                ...args.ctx,
                org: {
                    id: 'org_123',
                },
            },
        }
    })

    const _getRequest = appWithOrg.query('requests', {
        path: 'requests.get',
        handler: async ({ ctx }) => {
            expectType<{
                env: 'testing'
                org: {
                    id: string
                }
            }>(ctx)
            return {
                id: '123',
            }
        },
    })

    const appWithUser = appWithOrg.middleware(async (args) => {
        return {
            ctx: {
                ...args.ctx,
                user: {
                    id: 'user_123',
                },
            },
        }
    })

    const _postRequest = appWithUser.mutation('requests', {
        path: 'requests.post',
        handler: async ({ ctx }) => {
            expectType<{
                env: 'testing'
                org: {
                    id: string
                }
                user: {
                    id: string
                }
            }>(ctx)
            return {
                id: '123',
            }
        },
    })
})

test('all combined', () => {
    const app = defineBackend({
        context: {
            env: 'testing' as const,
        },
        queues: {
            requests: {
                subject: 'requests',
            },
        },
    })

    const appWithOrg = app.middleware(async (args) => {
        return {
            ctx: {
                ...args.ctx,
                org: {
                    id: 'org_123',
                },
            },
        }
    })

    const _getRequest = appWithOrg.query('requests', {
        path: 'requests.get.$id',
        input: z.object({
            include: z.boolean().optional(),
        }),
        output: z.object({
            id: z.string(),
            orgId: z.string(),
            env: z.string(),
        }),
        handler: async ({ ctx, input, params }) => {
            expectType<{
                env: 'testing'
                org: {
                    id: string
                }
            }>(ctx)
            expectType<{
                include?: boolean | undefined
            }>(input)
            expectType<{
                id: string
            }>(params)

            return {
                id: params.id,
                orgId: ctx.org.id,
                env: ctx.env,
            }
        },
    })
})
