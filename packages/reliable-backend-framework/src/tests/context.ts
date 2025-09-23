import { after } from 'node:test'
import { connect } from '@nats-io/transport-node'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createQueue } from '../helpers'
import * as schema from '../schema'

export const posts = pgTable('posts', {
    id: text('id').notNull(),
    name: text('name').notNull(),
    views: integer('views').default(0).notNull(),
})

export async function createTestContext() {
    const nats = await connect({
        servers: [process.env.NATS_URL!],
        token: process.env.NATS_TOKEN,
    })

    const client = postgres(process.env.DATABASE_URL!)

    const mergedSchema = { ...schema, posts } as const

    const db = drizzle(client, { schema: mergedSchema })

    await client.unsafe(`CREATE TABLE IF NOT EXISTS rbf_outbox (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        namespace TEXT NOT NULL,
        source_request_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('request', 'message')),
        path TEXT NOT NULL,
        data JSONB,
        target_at BIGINT,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
        PRIMARY KEY (namespace, id)
    );`)

    await client.unsafe(`CREATE TABLE IF NOT EXISTS rbf_results (
        request_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        requested_path TEXT NOT NULL,
        requested_input TEXT NOT NULL,
        data JSONB,
        status INTEGER NOT NULL,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
        PRIMARY KEY (namespace, request_id)
    );`)

    await client.unsafe(`CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0
    );`)

    await createQueue(nats, {
        streamName: 'requests',
        subject: 'requests',
    })

    after(async () => {
        await nats.close()
        await client.end()
    })

    return { db: db as unknown as PostgresJsDatabase, nats }
}
