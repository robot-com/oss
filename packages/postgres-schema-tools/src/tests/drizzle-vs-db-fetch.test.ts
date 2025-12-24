// tests/compare_drizzle_remote.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    unique,
} from 'drizzle-orm/pg-core'
import { createLocalDatabase } from '../db'
import { fetchSchemaDrizzleORM } from '../schema/drizzle/fetch'
import type { LocalSchema } from '../schema/local/types'
import { fetchSchemaPgLite } from '../schema/remote/fetch'

/**
 * Helper to normalize remote schema for comparison with Drizzle-derived schema.
 *
 * TODO: Review why the AI generated this function.
 */
function normalizeRemoteForComparison(remote: LocalSchema): LocalSchema {
    const normalized = JSON.parse(JSON.stringify(remote)) as LocalSchema

    normalized.tables?.forEach((table) => {
        // Normalize Columns
        table.columns.forEach((col) => {
            // Strip postgres type casting from defaults (e.g., "'foo'::text" -> "'foo'")
            if (col.default && typeof col.default === 'string') {
                col.default = col.default.replace(/::[a-zA-Z0-9_ ]+$/, '')
            }
            // Normalize boolean default 'true'/'false' to 'TRUE'/'FALSE' to match Drizzle mapper
            if (col.default === "'true'" || col.default === 'true')
                col.default = 'TRUE'
            if (col.default === "'false'" || col.default === 'false')
                col.default = 'FALSE'

            // Drizzle fetch might return null for default, Remote might return null
            if (col.default === null) delete col.default
        })

        // Filter out implicit indexes.
        // Since is_constraint_index doesn't exist, we assume an index is implicit if
        // a constraint exists with the exact same name (common Postgres behavior for PK/Unique).
        if (table.indexes && table.constraints) {
            const constraintNames = new Set(
                table.constraints.map((c) => c.name),
            )
            table.indexes = table.indexes.filter(
                (idx) => !constraintNames.has(idx.name),
            )
        }
    })

    return normalized
}

/**
 * Helper to sort schema elements to ensure consistent ordering for assertion
 */
function sortSchema(schema: LocalSchema) {
    schema.tables?.sort((a, b) => a.name.localeCompare(b.name))
    schema.enums?.sort((a, b) => a.name.localeCompare(b.name))
    schema.tables?.forEach((t) => {
        t.columns.sort((a, b) => a.name.localeCompare(b.name))
        t.constraints?.sort((a, b) => a.name.localeCompare(b.name))
        t.indexes?.sort((a, b) => a.name.localeCompare(b.name))
    })
    return schema
}

test('compare: basic table with scalars', async () => {
    // 1. Drizzle Definition
    const users = pgTable('users', {
        id: integer('id').notNull(), // Remote implies not null if not specified otherwise usually
        name: text('name'),
        isActive: boolean('is_active').default(true),
        score: integer('score').default(0),
    })

    const drizzleSchema = fetchSchemaDrizzleORM({ users })

    // 2. Remote Definition (Equivalent SQL)
    const db = await createLocalDatabase({})
    await db.$client.query(`
        CREATE TABLE users (
            id INT NOT NULL,
            name TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            score INT DEFAULT 0
        )
    `)
    const remoteSchemaRaw = await fetchSchemaPgLite(db.$client)
    const remoteSchema = normalizeRemoteForComparison(remoteSchemaRaw)

    // 3. Comparison
    sortSchema(drizzleSchema)
    sortSchema(remoteSchema)

    assert.equal(drizzleSchema.tables?.length, 1)
    assert.equal(remoteSchema.tables?.length, 1)

    const dTable = drizzleSchema.tables![0]
    const rTable = remoteSchema.tables![0]

    assert.equal(dTable.name, rTable.name)
    assert.equal(dTable.columns.length, 4)
    assert.equal(rTable.columns.length, 4)

    // Compare columns one by one to catch differences
    dTable.columns.forEach((dCol, i) => {
        const rCol = rTable.columns[i]
        assert.equal(dCol.name, rCol.name)
        assert.equal(dCol.data_type, rCol.data_type)
        assert.equal(
            dCol.is_nullable,
            rCol.is_nullable,
            `Nullable mismatch on ${dCol.name}`,
        )
        assert.equal(
            dCol.default,
            rCol.default,
            `Default mismatch on ${dCol.name}`,
        )
    })
})

test('compare: table with Enums', async () => {
    // 1. Drizzle
    const statusEnum = pgEnum('status', ['open', 'closed', 'archived'])
    const tickets = pgTable('tickets', {
        id: integer('id').primaryKey(),
        status: statusEnum('status'),
    })

    const drizzleSchema = await fetchSchemaDrizzleORM({ statusEnum, tickets })

    // 2. Remote
    const db = await createLocalDatabase({})
    await db.$client.query(
        `CREATE TYPE status AS ENUM ('open', 'closed', 'archived')`,
    )
    await db.$client.query(
        `CREATE TABLE tickets (id INT PRIMARY KEY, status status)`,
    )

    const remoteSchema = normalizeRemoteForComparison(
        await fetchSchemaPgLite(db.$client),
    )

    // 3. Compare
    assert.equal(drizzleSchema.enums?.length, 1)
    assert.equal(remoteSchema.enums?.length, 1)

    assert.equal(drizzleSchema.enums![0].name, remoteSchema.enums![0].name)
    assert.deepEqual(
        drizzleSchema.enums![0].values,
        remoteSchema.enums![0].values,
    )

    const dTable = drizzleSchema.tables![0]
    const rTable = remoteSchema.tables![0]

    assert.equal(dTable.name, 'tickets')
    assert.equal(rTable.name, 'tickets')
})

test('compare: Foreign Keys and Indexes', async () => {
    // 1. Drizzle
    const users = pgTable('users', { id: integer('id').primaryKey() })
    const posts = pgTable(
        'posts',
        {
            id: integer('id').primaryKey(),
            userId: integer('user_id').references(() => users.id, {
                onDelete: 'cascade',
            }),
            title: text('title'),
        },
        (t) => [index('title_idx').on(t.title)],
    )

    const drizzleSchema = await fetchSchemaDrizzleORM({ users, posts })

    // 2. Remote
    const db = await createLocalDatabase({})
    await db.$client.query(`CREATE TABLE users (id INT PRIMARY KEY)`)
    await db.$client.query(`
        CREATE TABLE posts (
            id INT PRIMARY KEY, 
            user_id INT REFERENCES users(id) ON DELETE CASCADE, 
            title TEXT
        )
    `)
    await db.$client.query(`CREATE INDEX title_idx ON posts (title)`)

    const remoteSchema = normalizeRemoteForComparison(
        await fetchSchemaPgLite(db.$client),
    )
    sortSchema(drizzleSchema)
    sortSchema(remoteSchema)

    // 3. Compare Tables
    const dPosts = drizzleSchema.tables?.find((t) => t.name === 'posts')!
    const rPosts = remoteSchema.tables?.find((t) => t.name === 'posts')!

    assert.ok(dPosts)
    assert.ok(rPosts)

    // Compare FKs
    assert.equal(dPosts.foreign_keys?.length, 1)
    assert.equal(rPosts.foreign_keys?.length, 1)

    const dFK = dPosts.foreign_keys![0]
    const rFK = rPosts.foreign_keys![0]

    assert.deepEqual(dFK.columns, rFK.columns)
    assert.deepEqual(dFK.foreign_columns, rFK.foreign_columns)
    assert.equal(dFK.foreign_table, rFK.foreign_table)
    // Note: Drizzle stores 'cascade', Postgres might return 'CASCADE'
    assert.equal(dFK.on_delete?.toUpperCase(), rFK.on_delete?.toUpperCase())

    // Compare Indexes
    assert.equal(dPosts.indexes?.length, 1)
    assert.equal(rPosts.indexes?.length, 1)
    assert.equal(dPosts.indexes![0].name, 'title_idx')
    assert.equal(rPosts.indexes![0].name, 'title_idx')
})

test('compare: Primary Key and Unique Constraints', async () => {
    // 1. Drizzle
    const config = pgTable(
        'config',
        {
            key: text('key'),
            val: text('val'),
        },
        (t) => [
            primaryKey({ columns: [t.key] }),
            unique('val_unique').on(t.val),
        ],
    )

    const drizzleSchema = await fetchSchemaDrizzleORM({ config })

    // 2. Remote
    const db = await createLocalDatabase({})
    await db.$client.query(`
        CREATE TABLE config (
            key TEXT, 
            val TEXT,
            PRIMARY KEY (key),
            CONSTRAINT val_unique UNIQUE (val)
        )
    `)

    const remoteSchema = normalizeRemoteForComparison(
        await fetchSchemaPgLite(db.$client),
    )

    // 3. Compare
    const dTable = drizzleSchema.tables![0]
    const rTable = remoteSchema.tables![0]

    // Constraints
    assert.equal(dTable.constraints?.length, 2)
    assert.equal(rTable.constraints?.length, 2)

    const dPK = dTable.constraints?.find((c) => c.type === 'PRIMARY KEY')
    const rPK = rTable.constraints?.find((c) => c.type === 'PRIMARY KEY')
    assert.deepEqual(dPK?.columns, rPK?.columns)

    const dUQ = dTable.constraints?.find((c) => c.type === 'UNIQUE')
    const rUQ = rTable.constraints?.find((c) => c.type === 'UNIQUE')

    assert.equal(dUQ?.name, rUQ?.name)
    assert.deepEqual(dUQ?.columns, rUQ?.columns)
})
