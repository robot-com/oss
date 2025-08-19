import assert from 'node:assert'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import { fetchSchemaPgLite } from '../schema/fetch'

test('fetch one table', async () => {
    const client = (await createLocalDatabase({})).$client

    await client.query('create table test (id int, name text) ')

    const schema = await fetchSchemaPgLite(client)

    assert.equal(schema.tables.length, 1)
    assert.equal(schema.tables[0].columns.length, 2)
    assert.equal(schema.tables[0].columns[0].name, 'id')
    assert.equal(schema.tables[0].columns[1].name, 'name')
})
