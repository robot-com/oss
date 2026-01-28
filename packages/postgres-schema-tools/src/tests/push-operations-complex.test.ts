/**
 * Comprehensive tests for pushing complex schemas and applying migrations
 * Tests the full SQL generation and application pipeline
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import { localSchemaToRemoteSchema } from '../schema/local/to-remote'
import type { LocalSchema } from '../schema/local/types'
import { generatePushDiffSchema } from '../schema/push/diff'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch'
import { ecommerceSchema, saasSchema } from './fixtures/complex-schemas'

/**
 * Helper to apply SQL statements
 */
async function applyStatements(
    client: { query: (sql: string) => Promise<unknown> },
    statements: string[],
) {
    for (const s of statements) {
        const parts = s
            .split(/;\s*\n|;\s*$/g)
            .map((p) => p.trim())
            .filter(Boolean)
        for (const p of parts) {
            await client.query(p).catch((e) => {
                console.error('Error applying statement:', p)
                throw e
            })
        }
    }
}

test('push: create entire e-commerce schema from scratch', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    // Generate and apply SQL
    const statements = generatePushNewSchema(ecommerceSchema)
    await applyStatements(client, statements)

    // Fetch back and verify
    const fetched = await fetchSchemaPgLite(client)

    assert.equal(fetched.enums.length, 4)
    assert.equal(fetched.tables.length, 6)
    assert.equal(fetched.views.length, 2)

    // Verify foreign keys work
    const products = fetched.tables.find((t) => t.name === 'products')!
    assert.equal(products.foreign_keys.length, 2)

    const orderItems = fetched.tables.find((t) => t.name === 'order_items')!
    assert.equal(orderItems.foreign_keys.length, 2)

    // Verify self-referential FK
    const categories = fetched.tables.find((t) => t.name === 'categories')!
    const selfFk = categories.foreign_keys.find(
        (fk) => fk.foreign_table === 'categories',
    )
    assert.ok(selfFk)
})

test('push: create entire SaaS schema from scratch', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const statements = generatePushNewSchema(saasSchema)
    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)

    assert.equal(fetched.enums.length, 4)
    assert.equal(fetched.tables.length, 5)
    assert.equal(fetched.views.length, 2)

    // Verify composite PKs
    const tenantMembers = fetched.tables.find(
        (t) => t.name === 'tenant_members',
    )!
    const pk = tenantMembers.constraints.find((c) => c.type === 'PRIMARY KEY')!
    assert.deepEqual(pk.columns, ['tenant_id', 'user_id'])

    // Verify UUID defaults
    const tenants = fetched.tables.find((t) => t.name === 'tenants')!
    const idCol = tenants.columns.find((c) => c.name === 'id')!
    assert.ok(idCol.default?.includes('gen_random_uuid'))
})

test('push: apply complex migration with all operation types', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    // Start with a simple schema
    const oldSchema: LocalSchema = {
        enums: [
            { name: 'status', values: ['active', 'inactive'] },
            { name: 'old_enum', values: ['a'] },
        ],
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                    { name: 'name', data_type: 'text' },
                    { name: 'old_col', data_type: 'text' },
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
                name: 'old_table',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
        ],
        views: [
            {
                name: 'old_view',
                definition: 'SELECT * FROM users',
            },
        ],
    }

    // Apply old schema
    await applyStatements(client, generatePushNewSchema(oldSchema))

    // Evolve to new schema with many changes
    const newSchema: LocalSchema = {
        enums: [
            { name: 'status', values: ['active', 'inactive', 'archived'] }, // enum modified
            { name: 'new_enum', values: ['x', 'y'] }, // enum added
            // old_enum removed
        ],
        tables: [
            {
                name: 'users',
                description: 'User accounts', // description added
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                        is_identity: true, // identity added
                        identity_generation: 'BY DEFAULT',
                    },
                    {
                        name: 'name',
                        data_type: 'text',
                        is_nullable: false, // nullability changed
                        description: 'User full name', // description added
                    },
                    {
                        name: 'email',
                        data_type: 'text',
                        is_nullable: false,
                    }, // column added
                    // old_col removed
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                    {
                        name: 'users_email_unique',
                        type: 'UNIQUE',
                        columns: ['email'],
                    }, // constraint added
                ],
                indexes: [
                    {
                        name: 'idx_users_email',
                        is_unique: false,
                        columns: [{ name: 'email' }],
                    }, // index added
                ],
            },
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                    { name: 'user_id', data_type: 'integer', is_nullable: false },
                    { name: 'title', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'posts_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
                foreign_keys: [
                    {
                        name: 'posts_user_fk',
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE',
                        on_update: 'CASCADE',
                    },
                ],
            }, // table added
            // old_table removed
        ],
        views: [
            {
                name: 'active_users',
                definition: "SELECT * FROM users WHERE name IS NOT NULL",
            }, // view added
            // old_view removed
        ],
    }

    // Generate and apply migration
    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    // Verify statements are generated
    assert.ok(statements.length > 0)

    // Apply migration
    await applyStatements(client, statements)

    // Verify the result matches expectations
    const fetched = await fetchSchemaPgLite(client)

    // Enums
    assert.equal(fetched.enums.length, 2)
    assert.ok(fetched.enums.find((e) => e.name === 'status'))
    assert.ok(fetched.enums.find((e) => e.name === 'new_enum'))
    assert.ok(!fetched.enums.find((e) => e.name === 'old_enum'))

    // Tables
    assert.equal(fetched.tables.length, 2)
    assert.ok(fetched.tables.find((t) => t.name === 'users'))
    assert.ok(fetched.tables.find((t) => t.name === 'posts'))
    assert.ok(!fetched.tables.find((t) => t.name === 'old_table'))

    // Users table changes
    const users = fetched.tables.find((t) => t.name === 'users')!
    assert.equal(users.description, 'User accounts')
    assert.ok(users.columns.find((c) => c.name === 'email'))
    assert.ok(!users.columns.find((c) => c.name === 'old_col'))

    const idCol = users.columns.find((c) => c.name === 'id')!
    assert.equal(idCol.is_identity, true)

    const nameCol = users.columns.find((c) => c.name === 'name')!
    assert.equal(nameCol.is_nullable, false)
    assert.equal(nameCol.description, 'User full name')

    assert.ok(users.constraints.find((c) => c.name === 'users_email_unique'))
    assert.ok(users.indexes.find((i) => i.name === 'idx_users_email'))

    // Posts table with FK
    const posts = fetched.tables.find((t) => t.name === 'posts')!
    assert.equal(posts.foreign_keys.length, 1)
    assert.equal(posts.foreign_keys[0].on_delete, 'CASCADE')

    // Views
    assert.equal(fetched.views.length, 1)
    assert.ok(fetched.views.find((v) => v.name === 'active_users'))
    assert.ok(!fetched.views.find((v) => v.name === 'old_view'))
})

test('push: migrate referential action changes', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'parent',
                columns: [{ name: 'id', data_type: 'integer' }],
                constraints: [
                    {
                        name: 'parent_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'child',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'parent_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'child_parent_fk',
                        columns: ['parent_id'],
                        foreign_table: 'parent',
                        foreign_columns: ['id'],
                        on_delete: 'NO ACTION',
                        on_update: 'NO ACTION',
                    },
                ],
            },
        ],
    }

    await applyStatements(client, generatePushNewSchema(oldSchema))

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'parent',
                columns: [{ name: 'id', data_type: 'integer' }],
                constraints: [
                    {
                        name: 'parent_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'child',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'parent_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'child_parent_fk',
                        columns: ['parent_id'],
                        foreign_table: 'parent',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE', // changed
                        on_update: 'RESTRICT', // changed
                    },
                ],
            },
        ],
    }

    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)
    const child = fetched.tables.find((t) => t.name === 'child')!
    const fk = child.foreign_keys[0]

    assert.equal(fk.on_delete, 'CASCADE')
    assert.equal(fk.on_update, 'RESTRICT')
})

test('push: handle self-referential foreign key', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const schema: LocalSchema = {
        tables: [
            {
                name: 'categories',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                        is_identity: true,
                        identity_generation: 'BY DEFAULT',
                    },
                    { name: 'parent_id', data_type: 'integer', is_nullable: true },
                    { name: 'name', data_type: 'text', is_nullable: false },
                ],
                constraints: [
                    {
                        name: 'categories_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
                foreign_keys: [
                    {
                        name: 'categories_parent_fk',
                        columns: ['parent_id'],
                        foreign_table: 'categories',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE',
                        on_update: 'CASCADE',
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    await applyStatements(client, statements)

    // Verify it was created successfully
    const fetched = await fetchSchemaPgLite(client)
    const categories = fetched.tables[0]

    assert.equal(categories.foreign_keys.length, 1)
    assert.equal(categories.foreign_keys[0].foreign_table, 'categories')

    // Test that the FK actually works
    await client.query('INSERT INTO categories (name) VALUES ($1)', ['Root'])
    await client.query(
        'INSERT INTO categories (parent_id, name) VALUES (1, $1)',
        ['Child'],
    )

    // Should cascade delete
    await client.query('DELETE FROM categories WHERE id = 1')
    const result = await client.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM categories',
    )
    assert.equal(Number(result.rows[0].count), 0)
})

test('push: handle composite foreign keys', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const schema: LocalSchema = {
        tables: [
            {
                name: 'parent',
                columns: [
                    { name: 'id1', data_type: 'integer', is_nullable: false },
                    { name: 'id2', data_type: 'integer', is_nullable: false },
                ],
                constraints: [
                    {
                        name: 'parent_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id1', 'id2'],
                    },
                ],
            },
            {
                name: 'child',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                    { name: 'parent_id1', data_type: 'integer' },
                    { name: 'parent_id2', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'child_parent_fk',
                        columns: ['parent_id1', 'parent_id2'],
                        foreign_table: 'parent',
                        foreign_columns: ['id1', 'id2'],
                        on_delete: 'CASCADE',
                        on_update: 'CASCADE',
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)
    const child = fetched.tables.find((t) => t.name === 'child')!

    assert.equal(child.foreign_keys.length, 1)
    assert.deepEqual(child.foreign_keys[0].columns, ['parent_id1', 'parent_id2'])
    assert.deepEqual(child.foreign_keys[0].foreign_columns, ['id1', 'id2'])
})

test('push: create indexes with various configurations', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const schema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'name', data_type: 'text' },
                    { name: 'category', data_type: 'text' },
                    { name: 'tags', data_type: 'text[]' },
                    { name: 'metadata', data_type: 'jsonb' },
                    { name: 'deleted_at', data_type: 'timestamp with time zone' },
                ],
                indexes: [
                    {
                        name: 'idx_simple',
                        is_unique: false,
                        columns: [{ name: 'name' }],
                    },
                    {
                        name: 'idx_unique',
                        is_unique: true,
                        columns: [{ name: 'name' }],
                    },
                    {
                        name: 'idx_composite',
                        is_unique: false,
                        columns: [
                            { name: 'category', sort_order: 'ASC', nulls_order: 'NULLS LAST' },
                            { name: 'name', sort_order: 'DESC', nulls_order: 'NULLS FIRST' },
                        ],
                    },
                    {
                        name: 'idx_partial',
                        is_unique: false,
                        columns: [{ name: 'id' }],
                        predicate: 'deleted_at IS NULL',
                    },
                    {
                        name: 'idx_gin_array',
                        is_unique: false,
                        index_type: 'gin',
                        columns: [{ name: 'tags' }],
                    },
                    {
                        name: 'idx_gin_jsonb',
                        is_unique: false,
                        index_type: 'gin',
                        columns: [{ name: 'metadata' }],
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)
    const table = fetched.tables[0]

    assert.equal(table.indexes.length, 6)

    const simpleIdx = table.indexes.find((i) => i.name === 'idx_simple')!
    assert.ok(simpleIdx)
    assert.equal(simpleIdx.is_unique, false)

    const uniqueIdx = table.indexes.find((i) => i.name === 'idx_unique')!
    assert.equal(uniqueIdx.is_unique, true)

    const compositeIdx = table.indexes.find((i) => i.name === 'idx_composite')!
    assert.equal(compositeIdx.columns.length, 2)
    assert.equal(compositeIdx.columns[0].sort_order, 'ASC')
    assert.equal(compositeIdx.columns[1].sort_order, 'DESC')

    const partialIdx = table.indexes.find((i) => i.name === 'idx_partial')!
    assert.ok(partialIdx.predicate)

    const ginArrayIdx = table.indexes.find((i) => i.name === 'idx_gin_array')!
    assert.equal(ginArrayIdx.index_type, 'gin')

    const ginJsonbIdx = table.indexes.find((i) => i.name === 'idx_gin_jsonb')!
    assert.equal(ginJsonbIdx.index_type, 'gin')
})

test('push: create and modify check constraints', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'price', data_type: 'numeric' },
                ],
                constraints: [
                    {
                        name: 'price_positive',
                        type: 'CHECK',
                        check_predicate: 'price > 0',
                    },
                ],
            },
        ],
    }

    await applyStatements(client, generatePushNewSchema(oldSchema))

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'price', data_type: 'numeric' },
                    { name: 'discount', data_type: 'numeric' },
                ],
                constraints: [
                    {
                        name: 'price_positive',
                        type: 'CHECK',
                        check_predicate: 'price >= 0', // changed
                    },
                    {
                        name: 'discount_valid',
                        type: 'CHECK',
                        check_predicate: 'discount >= 0 AND discount <= price',
                    },
                ],
            },
        ],
    }

    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    ).flat()

    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)
    const table = fetched.tables[0]

    const priceCheck = table.constraints.find((c) => c.name === 'price_positive')!
    assert.ok(priceCheck)
    assert.ok(priceCheck.check_predicate?.includes('price >= 0'))

    const discountCheck = table.constraints.find(
        (c) => c.name === 'discount_valid',
    )!
    assert.ok(discountCheck)
    assert.ok(
        discountCheck.check_predicate?.includes('discount') &&
            discountCheck.check_predicate?.includes('price'),
    )
})

test('push: handle nulls_not_distinct in unique constraints', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    const schema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
                    { name: 'parent_id', data_type: 'integer', is_nullable: true },
                    { name: 'name', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'test_email_unique',
                        type: 'UNIQUE',
                        columns: ['email'],
                        nulls_not_distinct: true,
                    },
                    {
                        name: 'test_name_per_parent',
                        type: 'UNIQUE',
                        columns: ['parent_id', 'name'],
                        nulls_not_distinct: true,
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    await applyStatements(client, statements)

    const fetched = await fetchSchemaPgLite(client)
    const table = fetched.tables[0]

    const emailUnique = table.constraints.find(
        (c) => c.name === 'test_email_unique',
    )!
    assert.equal(emailUnique.nulls_not_distinct, true)

    const compositeUnique = table.constraints.find(
        (c) => c.name === 'test_name_per_parent',
    )!
    assert.equal(compositeUnique.nulls_not_distinct, true)
})

test('push: verify migration order preserves referential integrity', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    // Start with tables that have FKs
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [{ name: 'id', data_type: 'integer' }],
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
                        on_delete: 'CASCADE',
                        on_update: 'CASCADE',
                    },
                ],
            },
        ],
        views: [
            {
                name: 'user_posts',
                definition: 'SELECT * FROM posts',
            },
        ],
    }

    await applyStatements(client, generatePushNewSchema(oldSchema))

    // Modify FK and view
    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [{ name: 'id', data_type: 'integer' }],
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
                        on_delete: 'RESTRICT', // changed
                        on_update: 'RESTRICT', // changed
                    },
                ],
            },
        ],
        views: [
            {
                name: 'user_posts',
                definition: 'SELECT id, user_id FROM posts', // changed
            },
        ],
    }

    const statements = generatePushDiffSchema(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    // Views should be dropped first (before FK changes)
    const firstStatement = statements[0]?.[0] || ''
    assert.ok(
        firstStatement.includes('DROP VIEW'),
        'Views should be dropped first',
    )

    // Apply all statements - should succeed without FK violations
    await applyStatements(client, statements.flat())

    const fetched = await fetchSchemaPgLite(client)
    const posts = fetched.tables.find((t) => t.name === 'posts')!
    assert.equal(posts.foreign_keys[0].on_delete, 'RESTRICT')
})
