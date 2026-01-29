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
        generated_at: new Date().toISOString(),
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
                        description: null,
                        definition: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
                        columns: [
                            { name: 'id', sort_order: 'ASC', nulls_order: 'NULLS LAST' },
                        ],
                        is_unique: true,
                        is_constraint_index: true, // This should be filtered
                        nulls_not_distinct: null,
                        is_valid: true,
                        index_type: 'btree',
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

test('json: indexes with different names but same columns should match semantically', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    {
                        name: 'email',
                        description: null,
                        position: 1,
                        data_type: 'text',
                        is_nullable: false,
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
                indexes: [
                    {
                        name: 'users_email_idx', // Different name
                        description: null,
                        definition: '',
                        is_constraint_index: false,
                        is_unique: false,
                        nulls_not_distinct: false,
                        is_valid: true,
                        index_type: 'btree',
                        columns: [{ name: 'email', sort_order: 'ASC', nulls_order: 'NULLS LAST' }],
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
                columns: [
                    {
                        name: 'email',
                        description: null,
                        position: 1,
                        data_type: 'text',
                        is_nullable: false,
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
                indexes: [
                    {
                        name: 'users_email_index', // Different name but same columns
                        description: null,
                        definition: 'CREATE INDEX users_email_index ON users (email)',
                        is_constraint_index: false,
                        is_unique: false,
                        nulls_not_distinct: false,
                        is_valid: true,
                        index_type: 'btree',
                        columns: [{ name: 'email', sort_order: 'ASC', nulls_order: 'NULLS LAST' }],
                        predicate: null,
                    },
                ],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Should NOT detect changes because indexes are semantically identical
    assert.strictEqual(report.has_changes, false, 'Semantically identical indexes should not cause changes')
    assert.strictEqual(report.tables.modified.length, 0)
})

test('json: foreign keys with different names but same structure should match semantically', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [{ name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' }],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
            {
                name: 'posts',
                description: null,
                columns: [
                    { name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                    { name: 'user_id', description: null, position: 2, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [
                    {
                        name: 'posts_user_fk', // Different name
                        description: null,
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_update: 'NO ACTION',
                        on_delete: 'CASCADE',
                        match_option: 'SIMPLE',
                    },
                ],
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
                columns: [{ name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' }],
                constraints: [],
                indexes: [],
                foreign_keys: [],
                triggers: [],
            },
            {
                name: 'posts',
                description: null,
                columns: [
                    { name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                    { name: 'user_id', description: null, position: 2, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                ],
                constraints: [],
                indexes: [],
                foreign_keys: [
                    {
                        name: 'posts_user_id_users_id_fk', // Different name but same structure
                        description: null,
                        columns: ['user_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_update: 'NO ACTION',
                        on_delete: 'CASCADE',
                        match_option: 'SIMPLE',
                    },
                ],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Should NOT detect changes because FKs are semantically identical
    assert.strictEqual(report.has_changes, false, 'Semantically identical FKs should not cause changes')
    assert.strictEqual(report.tables.modified.length, 0)
})

test('json: index predicate normalization should handle formatting differences', () => {
    const schemaA: RemoteSchema = {
        ...createEmptySchema(),
        tables: [
            {
                name: 'users',
                description: null,
                columns: [
                    { name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                    { name: 'is_active', description: null, position: 2, data_type: 'boolean', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'bool' },
                ],
                constraints: [],
                indexes: [
                    {
                        name: 'active_users_idx',
                        description: null,
                        definition: '',
                        is_constraint_index: false,
                        is_unique: false,
                        nulls_not_distinct: false,
                        is_valid: true,
                        index_type: 'btree',
                        columns: [{ name: 'id', sort_order: 'ASC', nulls_order: 'NULLS LAST' }],
                        predicate: 'is_active IS NOT NULL', // Without parens
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
                columns: [
                    { name: 'id', description: null, position: 1, data_type: 'integer', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'int4' },
                    { name: 'is_active', description: null, position: 2, data_type: 'boolean', is_nullable: false, default: null, is_generated: false, generation_expression: null, is_identity: false, identity_generation: null, max_length: null, numeric_precision: null, numeric_scale: null, udt_name: 'bool' },
                ],
                constraints: [],
                indexes: [
                    {
                        name: 'active_users_idx',
                        description: null,
                        definition: 'CREATE INDEX active_users_idx ON users (id) WHERE (is_active IS NOT NULL)',
                        is_constraint_index: false,
                        is_unique: false,
                        nulls_not_distinct: false,
                        is_valid: true,
                        index_type: 'btree',
                        columns: [{ name: 'id', sort_order: 'ASC', nulls_order: 'NULLS LAST' }],
                        predicate: '(is_active IS NOT NULL)', // With parens
                    },
                ],
                foreign_keys: [],
                triggers: [],
            },
        ],
    }

    const report = createJsonDiffReport(schemaA, schemaB)

    // Should NOT detect changes because predicates are semantically identical
    assert.strictEqual(report.has_changes, false, 'Predicate formatting differences should be normalized')
    assert.strictEqual(report.tables.modified.length, 0)
})
