/** biome-ignore-all lint/complexity/noBannedTypes: Needed for testing */

import assert from 'node:assert/strict'
import test from 'node:test'
import { expectAssignable, expectType } from 'tsd'
import z from 'zod'
import { defineBackend } from '../server/app'
import { Backend } from '../server/backend'

test('basic', async () => {
    const app = defineBackend({
        queues: {
            requests: {},
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

    const backend = new Backend(app, {})
})
