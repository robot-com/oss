import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import { fetchSchemaPgLite } from '../schema/fetch'

test('fetch table with columns', async () => {
    const client = (await createLocalDatabase({})).$client

    await client.query('create table test (id int, name text) ')

    const schema = await fetchSchemaPgLite(client)

    assert.equal(schema.tables.length, 1)
    assert.equal(schema.tables[0].columns.length, 2)
    assert.equal(schema.tables[0].columns[0].name, 'id')
    assert.equal(schema.tables[0].columns[0].data_type, 'integer')
    assert.equal(schema.tables[0].columns[0].is_nullable, true)
    assert.equal(schema.tables[0].columns[1].name, 'name')
    assert.equal(schema.tables[0].columns[1].data_type, 'text')
    assert.equal(schema.tables[0].columns[1].is_nullable, true)
})

test('fetch table with index', async () => {
    const client = (await createLocalDatabase({})).$client

    await client.query('create table test (id int, name text) ')
    await client.query('create index idx_test_id on test (id) ')

    const schema = await fetchSchemaPgLite(client)

    assert.equal(schema.tables.length, 1)
    assert.equal(schema.tables[0].indexes.length, 1)
    assert.equal(schema.tables[0].indexes[0].name, 'idx_test_id')
    assert.equal(schema.tables[0].indexes[0].is_constraint_index, false)
    assert.equal(schema.tables[0].indexes[0].is_unique, false)
    assert.equal(schema.tables[0].indexes[0].columns.length, 1)
    assert.equal(schema.tables[0].indexes[0].columns[0].name, 'id')
})

test('fetch unique constraint', async () => {
    const client = (await createLocalDatabase({})).$client

    await client.query('create table test (id int, name text, unique (id)) ')

    const schema = await fetchSchemaPgLite(client)

    // Constraints
    assert.equal(schema.tables.length, 1)
    assert.equal(schema.tables[0].constraints.length, 1)
    assert.equal(schema.tables[0].constraints[0].name, 'test_id_key')
    assert.equal(schema.tables[0].constraints[0].type, 'UNIQUE')
    assert.equal(schema.tables[0].constraints[0].nulls_not_distinct, false)

    // Indexes
    assert.equal(schema.tables[0].indexes.length, 1)
    assert.equal(schema.tables[0].indexes[0].name, 'test_id_key')
    assert.equal(schema.tables[0].indexes[0].is_constraint_index, true)
    assert.equal(schema.tables[0].indexes[0].is_unique, true)
    assert.equal(schema.tables[0].indexes[0].nulls_not_distinct, false)
})

test('fetch unique constraint null not distinct', async () => {
    const client = (await createLocalDatabase({})).$client

    await client.query(
        'create table test (id int, name text, unique nulls not distinct (id)) '
    )

    const schema = await fetchSchemaPgLite(client)

    // Constraints
    assert.equal(schema.tables.length, 1)
    assert.equal(schema.tables[0].constraints.length, 1)
    assert.equal(schema.tables[0].constraints[0].name, 'test_id_key')
    assert.equal(schema.tables[0].constraints[0].type, 'UNIQUE')
    assert.equal(schema.tables[0].constraints[0].nulls_not_distinct, true)

    // Indexes
    assert.equal(schema.tables[0].indexes.length, 1)
    assert.equal(schema.tables[0].indexes[0].name, 'test_id_key')
    assert.equal(schema.tables[0].indexes[0].is_constraint_index, true)
    assert.equal(schema.tables[0].indexes[0].is_unique, true)
    assert.equal(schema.tables[0].indexes[0].nulls_not_distinct, true)
})
