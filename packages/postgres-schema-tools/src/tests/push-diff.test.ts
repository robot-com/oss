import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import { localSchemaToRemoteSchema } from '../schema/local/to-remote'
import type { LocalSchema } from '../schema/local/types'
import { generatePushDiffSchema } from '../schema/push/diff'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch'

async function applyStatements(
    client: { query: (sql: string) => Promise<unknown> },
    statements: string[],
) {
    for (const s of statements) {
        // Some generator outputs include multiple SQL commands in a single string
        // (e.g., CREATE ...; COMMENT ON ...;). PGlite cannot run multiple commands
        // in one prepared statement, so split and run them individually.
        const parts = s
            .split(/;\s*\n|;\s*$/g)
            .map((p) => p.trim())
            .filter(Boolean)
        for (const p of parts) {
            await client.query(p).catch((e) => {
                console.error('Error applying statement:', p)
                console.debug('All statements:', statements)
                throw e
            })
        }
    }
}

test('diff: no-op when schemas are identical', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
                ],
            },
        ],
        enums: [],
        views: [],
    }
    const newSchema: LocalSchema = JSON.parse(JSON.stringify(oldSchema))

    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    assert.equal(statements.length, 0)

    const db = await createLocalDatabase({})
    const client = db.$client
    await applyStatements(client, generatePushNewSchema(oldSchema))
    await applyStatements(client, statements)

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.tables.length, 1)
    assert.equal(schemaAfter.tables[0].columns.length, 2)
})

test('diff: create a new table', async () => {
    const oldSchema: LocalSchema = { tables: [], enums: [], views: [] }
    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
                ],
            },
        ],
    }

    const db = await createLocalDatabase({})
    const client = db.$client

    await applyStatements(client, generatePushNewSchema(oldSchema))
    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()
    assert.ok(statements.some((s) => /CREATE TABLE "users"/i.test(s)))

    await applyStatements(client, statements)

    const schemaAfter = await fetchSchemaPgLite(client)
    const users = schemaAfter.tables.find((t) => t.name === 'users')
    assert.ok(users)
    assert.equal(users.columns.length, 2)
})

test('diff: alter existing table columns (type/default/nullability/identity/comments) + add/drop columns', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'profiles',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'name', data_type: 'text' },
                    { name: 'age', data_type: 'integer' },
                    { name: 'val', data_type: 'integer' },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'profiles',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                        is_identity: true,
                        identity_generation: 'BY DEFAULT',
                    },
                    {
                        name: 'name',
                        data_type: 'text',
                        default: "'anon'",
                        description: 'display name',
                    },
                    { name: 'val', data_type: 'text' }, // type changed
                    {
                        name: 'created_at',
                        data_type: 'timestamp with time zone',
                        default: 'NOW()',
                    }, // new column
                ],
            },
        ],
    }

    const db = await createLocalDatabase({})
    const client = db.$client

    await applyStatements(client, generatePushNewSchema(oldSchema))
    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    // Expect a mix of ALTERs including DROP COLUMN age, ADD COLUMN created_at, and updates on others
    assert.ok(statements.some((s) => /DROP COLUMN IF EXISTS "age"/i.test(s)))
    assert.ok(statements.some((s) => /ADD COLUMN "created_at"/i.test(s)))
    assert.ok(
        statements.some((s) =>
            /ALTER TABLE "profiles" ALTER COLUMN "val" TYPE text/i.test(s),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /ALTER TABLE "profiles" ALTER COLUMN "id" SET NOT NULL/i.test(s),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /ALTER TABLE "profiles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY/i.test(
                s,
            ),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /ALTER TABLE "profiles" ALTER COLUMN "name" SET DEFAULT 'anon'/i.test(
                s,
            ),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /COMMENT ON COLUMN "profiles"\."name" IS 'display name';/i.test(s),
        ),
    )

    await applyStatements(client, statements)

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables.find((t) => t.name === 'profiles')!

    const idCol = table.columns.find((c) => c.name === 'id')!
    assert.equal(idCol.is_nullable, false)
    assert.equal(idCol.is_identity, true)
    assert.equal(idCol.identity_generation, 'BY DEFAULT')

    const nameCol = table.columns.find((c) => c.name === 'name')!
    assert.equal(nameCol.default, "'anon'::text")
    assert.equal(nameCol.description, 'display name')

    const valCol = table.columns.find((c) => c.name === 'val')!
    assert.equal(valCol.data_type, 'text')

    assert.ok(!table.columns.find((c) => c.name === 'age'))
    assert.ok(table.columns.find((c) => c.name === 'created_at'))
})

test('diff: constraints and indexes are dropped and recreated when changed', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'email', data_type: 'text', is_nullable: false },
                    { name: 'name', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'users_email_unique',
                        type: 'UNIQUE',
                        columns: ['email'],
                    },
                ],
                indexes: [
                    {
                        name: 'idx_users_email',
                        is_unique: true,
                        columns: [
                            {
                                name: 'email',
                                sort_order: 'ASC',
                                nulls_order: 'NULLS LAST',
                            },
                        ],
                    },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'email', data_type: 'text', is_nullable: false },
                    { name: 'name', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'users_email_unique',
                        type: 'UNIQUE',
                        columns: ['email', 'name'],
                    },
                ],
                indexes: [
                    {
                        name: 'idx_users_email',
                        is_unique: true,
                        columns: [
                            {
                                name: 'email',
                                sort_order: 'DESC',
                                nulls_order: 'NULLS FIRST',
                            },
                            {
                                name: 'name',
                                sort_order: 'ASC',
                                nulls_order: 'NULLS LAST',
                            },
                        ],
                    },
                ],
            },
        ],
    }

    const db = await createLocalDatabase({})
    const client = db.$client

    await applyStatements(client, generatePushNewSchema(oldSchema))
    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    // Should drop old unique/index then add new ones
    assert.ok(
        statements.some((s) =>
            /DROP CONSTRAINT IF EXISTS "users_email_unique"/i.test(s),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /ADD CONSTRAINT "users_email_unique" UNIQUE \("email", "name"\)/i.test(
                s,
            ),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /DROP INDEX IF EXISTS "idx_users_email"/i.test(s),
        ),
    )
    assert.ok(
        statements.some((s) =>
            /CREATE UNIQUE INDEX "idx_users_email" ON "users" \("email" DESC NULLS FIRST, "name" ASC NULLS LAST\)/i.test(
                s,
            ),
        ),
    )

    await applyStatements(client, statements)

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables.find((t) => t.name === 'users')!
    const unique = table.constraints.find(
        (c) => c.name === 'users_email_unique',
    )!
    assert.equal(unique.definition, 'UNIQUE (email, name)')
    const idx = table.indexes.find((i) => i.name === 'idx_users_email')!
    assert.equal(idx.is_unique, true)
    assert.equal(idx.columns.length, 2)
    assert.equal(idx.columns[0].name, 'email')
    assert.equal(idx.columns[0].sort_order, 'DESC')
    assert.equal(idx.columns[0].nulls_order, 'NULLS FIRST')
})

test('diff: drop removed views first; change FKs; create/update/drop views; enums create/update/delete', async () => {
    const oldSchema: LocalSchema = {
        enums: [
            {
                name: 'status',
                description: 'old status',
                values: ['new', 'done'],
            },
            { name: 'legacy', description: null, values: ['x'] },
        ],
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'user_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'posts_user_fk',
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_update: 'NO ACTION',
                        on_delete: 'NO ACTION',
                    },
                ],
            },
        ],
        views: [{ name: 'posts_view', definition: 'SELECT * FROM posts' }],
    }

    const newSchema: LocalSchema = {
        enums: [
            {
                name: 'status',
                description: 'new status',
                values: ['new', 'done'],
            }, // comment updated
            { name: 'mood', description: null, values: ['sad', 'ok', 'happy'] }, // new enum
        ],
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'user_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'posts_user_fk',
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_update: 'RESTRICT',
                        on_delete: 'CASCADE',
                    },
                ],
            },
        ],
        views: [
            { name: 'posts_view2', definition: 'SELECT id FROM posts' }, // new view
        ],
    }

    const db = await createLocalDatabase({})
    const client = db.$client

    await applyStatements(client, generatePushNewSchema(oldSchema))

    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    // Verify view drop happens
    assert.ok(/DROP VIEW IF EXISTS "posts_view"/i.test(statements[0] || ''))

    await applyStatements(client, statements)

    const schemaAfter = await fetchSchemaPgLite(client)

    // Enums: legacy dropped; status comment updated; mood created
    assert.ok(!schemaAfter.enums.find((e) => e.name === 'legacy'))
    const status = schemaAfter.enums.find((e) => e.name === 'status')!
    assert.equal(status.description, 'new status')
    assert.ok(schemaAfter.enums.find((e) => e.name === 'mood'))

    // Views
    assert.ok(!schemaAfter.views.find((v) => v.name === 'posts_view'))
    assert.ok(schemaAfter.views.find((v) => v.name === 'posts_view2'))

    // FK updated
    const posts = schemaAfter.tables.find((t) => t.name === 'posts')!
    const fk = posts.foreign_keys.find((f) => f.name === 'posts_user_fk')!
    assert.equal(fk.on_delete, 'CASCADE')
    assert.equal(fk.on_update, 'RESTRICT')
})
