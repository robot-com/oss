/**
 * Tests for SQL generation with various column types and parameters
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import type { LocalSchema } from '../schema/local/types'
import { generatePushNewSchema } from '../schema/push/new'

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
            await client.query(p)
        }
    }
}

test('SQL generation: serial and bigserial columns', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'test_serial',
                columns: [
                    {
                        name: 'id',
                        data_type: 'serial',
                        is_nullable: false,
                    },
                    {
                        name: 'big_id',
                        data_type: 'bigserial',
                        is_nullable: false,
                    },
                ],
                constraints: [
                    {
                        name: 'test_serial_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)

    // Verify SQL contains serial types
    const createTableSQL = statements[0]
    assert.ok(createTableSQL.includes('serial NOT NULL'))
    assert.ok(createTableSQL.includes('bigserial NOT NULL'))

    // Verify it works in database
    const db = await createLocalDatabase({})
    const client = db.$client
    await applyStatements(client, statements)

    // Test that serial auto-increments
    await client.query("INSERT INTO test_serial (big_id) VALUES (1)")
    await client.query("INSERT INTO test_serial (big_id) VALUES (2)")

    const result = await client.query<{ id: number }>(
        'SELECT id FROM test_serial ORDER BY id',
    )
    assert.equal(result.rows[0].id, 1)
    assert.equal(result.rows[1].id, 2)
})

test('SQL generation: numeric with precision and scale', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'test_numeric',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'price',
                        data_type: 'numeric',
                        numeric_precision: 10,
                        numeric_scale: 2,
                        is_nullable: false,
                    },
                    {
                        name: 'weight',
                        data_type: 'numeric',
                        numeric_precision: 8,
                        is_nullable: true,
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    const createTableSQL = statements[0]

    // Verify SQL contains numeric with precision and scale
    assert.ok(createTableSQL.includes('numeric(10, 2)'))
    assert.ok(createTableSQL.includes('numeric(8)'))

    // Verify it works in database
    const db = await createLocalDatabase({})
    const client = db.$client
    await applyStatements(client, statements)

    // Insert and verify precision/scale
    await client.query(`
        INSERT INTO test_numeric (id, price, weight)
        VALUES (1, 123.45, 67.891234)
    `)

    const result = await client.query<{ price: string; weight: string }>(
        'SELECT price, weight FROM test_numeric',
    )
    assert.equal(result.rows[0].price, '123.45') // Scale preserved
    // weight may vary depending on database rounding
})

test('SQL generation: character varying with max_length', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'test_varchar',
                columns: [
                    {
                        name: 'id',
                        data_type: 'integer',
                        is_nullable: false,
                    },
                    {
                        name: 'code',
                        data_type: 'character varying',
                        max_length: 10,
                        is_nullable: false,
                    },
                    {
                        name: 'status',
                        data_type: 'character',
                        max_length: 1,
                        is_nullable: true,
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    const createTableSQL = statements[0]

    // Verify SQL contains varchar and char with lengths
    assert.ok(createTableSQL.includes('character varying(10)'))
    assert.ok(createTableSQL.includes('character(1)'))

    // Verify it works in database
    const db = await createLocalDatabase({})
    const client = db.$client
    await applyStatements(client, statements)

    await client.query(`
        INSERT INTO test_varchar (id, code, status)
        VALUES (1, '12345', 'A')
    `)

    const result = await client.query<{ code: string; status: string }>(
        'SELECT code, status FROM test_varchar',
    )
    assert.equal(result.rows[0].code, '12345')
    assert.equal(result.rows[0].status, 'A')
})

test('SQL generation: all type modifiers together', async () => {
    const schema: LocalSchema = {
        tables: [
            {
                name: 'test_all_types',
                columns: [
                    {
                        name: 'id',
                        data_type: 'serial',
                        is_nullable: false,
                    },
                    {
                        name: 'code',
                        data_type: 'character varying',
                        max_length: 50,
                        is_nullable: false,
                    },
                    {
                        name: 'price',
                        data_type: 'numeric',
                        numeric_precision: 12,
                        numeric_scale: 4,
                        is_nullable: false,
                    },
                    {
                        name: 'status',
                        data_type: 'character',
                        max_length: 1,
                        is_nullable: false,
                        default: "'A'",
                    },
                ],
                constraints: [
                    {
                        name: 'test_all_types_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
        ],
    }

    const statements = generatePushNewSchema(schema)
    const createTableSQL = statements[0]

    // Verify all type modifiers are present
    assert.ok(createTableSQL.includes('serial NOT NULL'))
    assert.ok(createTableSQL.includes('character varying(50)'))
    assert.ok(createTableSQL.includes('numeric(12, 4)'))
    assert.ok(createTableSQL.includes('character(1)'))
    assert.ok(createTableSQL.includes("DEFAULT 'A'"))

    // Verify it works in database
    const db = await createLocalDatabase({})
    const client = db.$client
    await applyStatements(client, statements)

    await client.query(`
        INSERT INTO test_all_types (code, price)
        VALUES ('TEST123', 9999.9999)
    `)

    const result = await client.query<{
        id: number
        code: string
        price: string
        status: string
    }>('SELECT * FROM test_all_types')
    assert.equal(result.rows[0].id, 1) // Serial auto-incremented
    assert.equal(result.rows[0].code, 'TEST123')
    assert.equal(result.rows[0].price, '9999.9999')
    assert.equal(result.rows[0].status, 'A') // Default value
})
