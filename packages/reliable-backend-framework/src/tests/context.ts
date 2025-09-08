import { after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { connect } from '@nats-io/transport-node'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createQueue } from '../helpers'
import * as schema from '../schema'

export const posts = pgTable('posts', {
    id: text('id').notNull(),
    name: text('name').notNull(),
})

export async function createTestContext() {
    const nats = await connect({
        servers: [process.env.NATS_URL!],
        token: process.env.NATS_TOKEN,
    })

    const client = new PGlite()

    const db = drizzle(client, { schema: { ...schema, posts } })

    await client.query(`CREATE TABLE rbf_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_request_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('request', 'message')),
        path TEXT NOT NULL,
        data JSONB NOT NULL,
        target_at BIGINT,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
    );`)

    await client.query(`CREATE TABLE rbf_results (
        request_id TEXT PRIMARY KEY,
        requested_path TEXT NOT NULL,
        requested_input TEXT NOT NULL,
        data JSONB NOT NULL,
        status INTEGER NOT NULL,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
    );`)

    await client.query(`CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    );`)

    await createQueue(nats, {
        streamName: 'requests',
        subject: 'requests',
    })

    after(() => {
        nats.close()
        client.close()
    })

    return { db: db as unknown as PostgresJsDatabase, nats }
}
