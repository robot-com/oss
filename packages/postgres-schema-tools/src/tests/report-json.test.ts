/**
 * Tests for JSON diff report generation
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createJsonDiffReport } from '../report/json'
import type { RemoteSchema } from '../schema/remote/types'

function createEmptySchema(schema = 'public'): RemoteSchema {
    return {
        schema,
        tables: [],
        enums: [],
        views: [],
    }
}

test('json: no changes between identical schemas', () => {
    const schemaA = createEmptySchema()
    const schemaB = createEmptySchema()

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, false)
    assert.strictEqual(report.tables.added.length, 0)
    assert.strictEqual(report.tables.removed.length, 0)
    assert.strictEqual(report.tables.modified.length, 0)
})

test('json: detect added table', () => {
    const schemaA = createEmptySchema()
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.tables.added.length, 1)
    assert.strictEqual(report.tables.added[0].name, 'users')
})

test('json: detect removed table', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }
    const schemaB = createEmptySchema()

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.tables.removed.length, 1)
    assert.strictEqual(report.tables.removed[0].name, 'users')
})

test('json: detect added column', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'id',
                        description: null,
                        position: 1,
                        data_type: 'integer',
                        is_nullable: false,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'int4',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'id',
                        description: null,
                        position: 1,
                        data_type: 'integer',
                        is_nullable: false,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'int4',
                    },
                    {
                        name: 'email',
                        description: null,
                        position: 2,
                        data_type: 'text',
                        is_nullable: true,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'text',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.tables.modified.length, 1)
    assert.strictEqual(report.tables.modified[0].columns.added.length, 1)
    assert.strictEqual(report.tables.modified[0].columns.added[0].name, 'email')
})

test('json: property ordering should not affect comparison', () => {
    // This test verifies the fix for the JSON.stringify property ordering bug
    // Two objects with the same values but different property order should be equal

    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'id',
                        description: null,
                        position: 1,
                        data_type: 'integer',
                        is_nullable: false,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'int4',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    // Same content but different property order in column definition
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        // Different order of properties
                        udt_name: 'int4',
                        numeric_scale: null,
                        numeric_precision: null,
                        max_length: null,
                        identity_generation: null,
                        is_identity: false,
                        generation_expression: null,
                        is_generated: false,
                        default: null,
                        is_nullable: false,
                        data_type: 'integer',
                        position: 1,
                        description: null,
                        name: 'id',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Should NOT detect changes because the values are identical
    assert.strictEqual(
        report.has_changes,
        false,
        'Property ordering should not cause false positive differences',
    )
    assert.strictEqual(report.tables.modified.length, 0)
})

test('json: property ordering in nested objects should not affect comparison', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        enums: [
            {
                name: 'status',
                description: 'User status',
                values: ['active', 'inactive'],
            },
        ],
    }

    // Same values, different property order
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        enums: [
            {
                values: ['active', 'inactive'],
                description: 'User status',
                name: 'status',
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(
        report.has_changes,
        false,
        'Property ordering in enums should not cause false positive differences',
    )
})

test('json: detect enum added', () => {
    const schemaA = createEmptySchema()
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        enums: [{ name: 'status', description: null, values: ['active', 'inactive'] }],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.enums.added.length, 1)
    assert.strictEqual(report.enums.added[0].name, 'status')
})

test('json: detect view modified', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        views: [
            {
                name: 'active_users',
                description: null,
                definition: 'SELECT * FROM users WHERE active = true',
            },
        ],
    }
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        views: [
            {
                name: 'active_users',
                description: null,
                definition: 'SELECT * FROM users WHERE active = true AND verified = true',
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.views.modified.length, 1)
    assert.strictEqual(report.views.modified[0].from.name, 'active_users')
})

test('json: column position changes should be ignored', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'id',
                        description: null,
                        position: 1, // Position 1
                        data_type: 'integer',
                        is_nullable: false,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'int4',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'id',
                        description: null,
                        position: 5, // Different position
                        data_type: 'integer',
                        is_nullable: false,
                        default: null,
                        is_generated: false,
                        generation_expression: null,
                        is_identity: false,
                        identity_generation: null,
                        max_length: null,
                        numeric_precision: null,
                        numeric_scale: null,
                        udt_name: 'int4',
                    },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Position changes should be ignored for columns
    assert.strictEqual(report.has_changes, false)
    assert.strictEqual(report.tables.modified.length, 0)
})

test('json: detect constraint index filtering', () => {
    // Constraint indexes should be filtered out from comparison
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [],
                constraints: [],
                indexes: [
                    {
                        name: 'users_pkey',
                        columns: ['id'],
                        is_unique: true,
                        is_primary: true,
                        is_constraint_index: true, // This should be filtered
                        type: 'btree',
                        predicate: null,
                    },
                ],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [],
                constraints: [],
                indexes: [], // No indexes
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Constraint index should be filtered, so no changes
    assert.strictEqual(report.has_changes, false)
})

test('json: table description change should be detected', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: 'User accounts',
                columns: [],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }
    const schemaB: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: 'All user accounts in the system',
                columns: [],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    assert.strictEqual(report.has_changes, true)
    assert.strictEqual(report.tables.modified.length, 1)
    assert.strictEqual(report.tables.modified[0].description?.from, 'User accounts')
    assert.strictEqual(report.tables.modified[0].description?.to, 'All user accounts in the system')
})
