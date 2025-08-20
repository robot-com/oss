import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db' // Mocked or actual test DB creator
import type { LocalSchema } from '../schema/local/types'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch' // Your schema fetcher

test('push empty schema', () => {
    const schema: LocalSchema = {
        tables: [],
        enums: [],
        views: [],
    }
    const statements = generatePushNewSchema(schema)
    assert.equal(statements.length, 0)
})

test('push one table with one column', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    assert.equal(statements.length, 1) // CREATE TABLE

    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.tables.length, 1)
    const table = schemaAfter.tables[0]
    assert.equal(table.name, 'users')
    assert.equal(table.columns.length, 1)
    assert.equal(table.columns[0].name, 'id')
    assert.equal(table.columns[0].data_type, 'integer')
    assert.equal(table.columns[0].is_nullable, true)
})

test('push table with various column types', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'name',
                        data_type: 'text',
                        default: "'unnamed'",
                    },
                    {
                        name: 'price',
                        data_type: 'numeric(10,2)',
                    },
                    {
                        name: 'created_at',
                        data_type: 'timestamp with time zone',
                        default: 'NOW()',
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    assert.equal(statements.length, 1)

    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.tables.length, 1)
    const table = schemaAfter.tables[0]
    assert.equal(table.name, 'products')
    assert.equal(table.columns.length, 4)

    const idCol = table.columns.find((c) => c.name === 'id')
    assert.ok(idCol)
    assert.equal(idCol.data_type, 'integer')
    assert.equal(idCol.is_nullable, false)

    const nameCol = table.columns.find((c) => c.name === 'name')
    assert.ok(nameCol)
    assert.equal(nameCol.data_type, 'text')
    assert.equal(nameCol.default, "'unnamed'::text")

    const priceCol = table.columns.find((c) => c.name === 'price')
    assert.ok(priceCol)
    assert.equal(priceCol.data_type, 'numeric')
    assert.equal(priceCol.numeric_precision, 10)
    assert.equal(priceCol.numeric_scale, 2)
})

test('push table with identity and generated columns', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_identity: true,
                        identity_generation: 'BY DEFAULT',
                    },
                    {
                        name: 'email',
                        data_type: 'text',
                        is_nullable: false,
                    },
                    {
                        name: 'email_domain',
                        data_type: 'text',
                        is_generated: true,
                        generation_expression: "split_part(email, '@', 2)",
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]

    const idCol = table.columns.find((c) => c.name === 'id')
    assert.ok(idCol)
    assert.equal(idCol.is_identity, true)
    assert.equal(idCol.identity_generation, 'BY DEFAULT')

    const domainCol = table.columns.find((c) => c.name === 'email_domain')
    assert.ok(domainCol)
    assert.equal(domainCol.is_generated, true)
    assert.equal(
        domainCol.generation_expression,
        "split_part(email, '@'::text, 2)"
    )
})

test('push table with primary key constraint', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const pk = table.constraints.find((c) => c.type === 'PRIMARY KEY')
    assert.ok(pk)
    assert.equal(pk.definition, 'PRIMARY KEY (id)')
})

test('push table with unique constraint', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'email',
                        data_type: 'text',
                        is_nullable: false,
                    },
                ],
                constraints: [
                    {
                        name: 'users_email_unique',
                        type: 'UNIQUE',
                        columns: ['email'],
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const unique = table.constraints.find((c) => c.type === 'UNIQUE')
    assert.ok(unique)
    assert.equal(unique.definition, 'UNIQUE (email)')
})

test('push table with check constraint', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    {
                        name: 'price',
                        data_type: 'integer',
                    },
                ],
                constraints: [
                    {
                        name: 'price_positive',
                        type: 'CHECK',
                        check_predicate: '(price > 0)',
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const check = table.constraints.find((c) => c.type === 'CHECK')
    assert.ok(check)
    assert.equal(check.definition, 'CHECK ((price > 0))')
})

test('push table with foreign key constraint', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
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
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'user_id',
                        data_type: 'integer',
                    },
                ],
                foreign_keys: [
                    {
                        name: 'posts_user_id_fkey',
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE',
                        on_update: 'RESTRICT',
                        match_option: 'SIMPLE',
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const postsTable = schemaAfter.tables.find((t) => t.name === 'posts')
    assert.ok(postsTable)
    const fk = postsTable.foreign_keys[0]
    assert.equal(fk.foreign_table, 'users')
    assert.equal(fk.on_delete, 'CASCADE')
    assert.equal(fk.on_update, 'RESTRICT')
})

test('push table with indexes', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'email',
                        data_type: 'text',
                    },
                    {
                        name: 'created_at',
                        data_type: 'timestamp with time zone',
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
                    {
                        name: 'idx_users_created_at',
                        is_unique: false,
                        columns: [
                            {
                                name: 'created_at',
                                sort_order: 'DESC',
                                nulls_order: 'NULLS FIRST',
                            },
                        ],
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    assert.equal(table.indexes.length, 2)

    const emailIndex = table.indexes.find((i) => i.name === 'idx_users_email')
    assert.ok(emailIndex)
    assert.equal(emailIndex.is_unique, true)

    const createdIndex = table.indexes.find(
        (i) => i.name === 'idx_users_created_at'
    )
    assert.ok(createdIndex)
    assert.equal(createdIndex.is_unique, false)
})

test('push enum type', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'status',
                        data_type: 'USER-DEFINED',
                        udt_name: 'user_status',
                    },
                ],
            },
        ],
        enums: [
            {
                name: 'user_status',
                values: ['active', 'inactive', 'pending'],
            },
        ],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.enums.length, 1)
    const enumType = schemaAfter.enums[0]
    assert.equal(enumType.name, 'user_status')
    assert.deepEqual(enumType.values, ['active', 'inactive', 'pending'])
})

test('push view', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                    },
                    {
                        name: 'email',
                        data_type: 'text',
                    },
                    {
                        name: 'is_active',
                        data_type: 'boolean',
                        default: 'true',
                    },
                ],
            },
        ],
        enums: [],
        views: [
            {
                name: 'active_users',
                definition:
                    'SELECT id, email FROM users WHERE is_active = true',
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.views.length, 1)
    const view = schemaAfter.views[0]
    assert.equal(view.name, 'active_users')
    assert.ok(view.definition.includes('is_active'))
})

test('push multiple tables with dependencies', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'categories',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_identity: true,
                        identity_generation: 'BY DEFAULT',
                        is_nullable: false,
                    },
                    {
                        name: 'name',
                        data_type: 'text',
                        is_nullable: false,
                    },
                ],
                constraints: [
                    {
                        name: 'categories_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'products',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_identity: true,
                        identity_generation: 'BY DEFAULT',
                        is_nullable: false,
                    },
                    {
                        name: 'name',
                        data_type: 'text',
                        is_nullable: false,
                    },
                    {
                        name: 'category_id',
                        data_type: 'integer',
                    },
                ],
                constraints: [
                    {
                        name: 'products_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
                foreign_keys: [
                    {
                        name: 'products_category_id_fkey',
                        columns: ['category_id'],
                        foreign_table: 'categories',
                        foreign_columns: ['id'],
                        on_delete: 'SET NULL',
                        on_update: 'CASCADE',
                        match_option: 'SIMPLE',
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    assert.equal(schemaAfter.tables.length, 2)

    const categoriesTable = schemaAfter.tables.find(
        (t) => t.name === 'categories'
    )
    const productsTable = schemaAfter.tables.find((t) => t.name === 'products')
    assert.ok(categoriesTable)
    assert.ok(productsTable)

    const fk = productsTable.foreign_keys[0]
    assert.equal(fk.foreign_table, 'categories')
    assert.equal(fk.on_delete, 'SET NULL')
})

test('push table with array column type', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'posts',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                    },
                    {
                        name: 'tags',
                        data_type: 'ARRAY',
                        udt_name: '_text',
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const tagsCol = table.columns.find((c) => c.name === 'tags')
    assert.ok(tagsCol)
    assert.equal(tagsCol.data_type, 'ARRAY')
    assert.equal(tagsCol.udt_name, '_text')
})

test('push table with JSON and JSONB columns', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'documents',
                columns: [
                    {
                        name: 'metadata',
                        data_type: 'json',
                    },
                    {
                        name: 'config',
                        data_type: 'jsonb',
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const metaCol = table.columns.find((c) => c.name === 'metadata')
    const configCol = table.columns.find((c) => c.name === 'config')
    assert.ok(metaCol)
    assert.ok(configCol)
    assert.equal(metaCol.data_type, 'json')
    assert.equal(configCol.data_type, 'jsonb')
})

test('push table with composite primary key', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'order_items',
                columns: [
                    {
                        name: 'order_id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'product_id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'quantity',
                        data_type: 'integer',
                    },
                ],
                constraints: [
                    {
                        name: 'order_items_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['order_id', 'product_id'],
                    },
                ],
            },
        ],
        enums: [],
        views: [],
    }

    const statements = generatePushNewSchema(schema)
    const client = (await createLocalDatabase({})).$client
    for (const statement of statements) {
        await client.query(statement)
    }

    const schemaAfter = await fetchSchemaPgLite(client)
    const table = schemaAfter.tables[0]
    const pk = table.constraints.find((c) => c.type === 'PRIMARY KEY')
    assert.ok(pk)
    assert.equal(pk.definition, 'PRIMARY KEY (order_id, product_id)')
})
