/**
 * Comprehensive tests for diff report generation
 * Tests the JSON diff algorithm with complex schema changes
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createJsonDiffReport } from '../report/json'
import { localSchemaToRemoteSchema } from '../schema/local/to-remote'
import type { LocalSchema } from '../schema/local/types'
import { ecommerceSchema } from './fixtures/complex-schemas'

test('diff: detect all enum operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        enums: [
            { name: 'status', values: ['active', 'inactive'] },
            { name: 'priority', values: ['low', 'medium', 'high'] },
            { name: 'old_enum', values: ['a', 'b'] },
        ],
        tables: [],
        views: [],
    }

    const newSchema: LocalSchema = {
        enums: [
            { name: 'status', values: ['active', 'inactive', 'archived'] }, // modified
            { name: 'priority', values: ['low', 'medium', 'high'] }, // unchanged
            { name: 'new_enum', values: ['x', 'y', 'z'] }, // added
            // old_enum removed
        ],
        tables: [],
        views: [],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)

    assert.equal(report.enums.added.length, 1)
    assert.equal(report.enums.added[0].name, 'new_enum')

    assert.equal(report.enums.removed.length, 1)
    assert.equal(report.enums.removed[0].name, 'old_enum')

    assert.equal(report.enums.modified.length, 1)
    assert.equal(report.enums.modified[0].from.name, 'status')
    assert.deepEqual(report.enums.modified[0].from.values, [
        'active',
        'inactive',
    ])
    assert.deepEqual(report.enums.modified[0].to.values, [
        'active',
        'inactive',
        'archived',
    ])
})

test('diff: detect all table operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
            {
                name: 'old_table',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' }, // column added
                ],
            },
            {
                name: 'new_table',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
            // old_table removed
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)

    assert.equal(report.tables.added.length, 1)
    assert.equal(report.tables.added[0].name, 'new_table')

    assert.equal(report.tables.removed.length, 1)
    assert.equal(report.tables.removed[0].name, 'old_table')

    assert.equal(report.tables.modified.length, 1)
    assert.equal(report.tables.modified[0].name, 'users')
    assert.equal(report.tables.modified[0].columns.added.length, 1)
    assert.equal(report.tables.modified[0].columns.added[0].name, 'email')
})

test('diff: detect all column operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false },
                    { name: 'name', data_type: 'text', is_nullable: true },
                    { name: 'price', data_type: 'integer' },
                    { name: 'old_col', data_type: 'text' },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                columns: [
                    { name: 'id', data_type: 'integer', is_nullable: false }, // unchanged
                    {
                        name: 'name',
                        data_type: 'text',
                        is_nullable: false,
                        description: 'Product name',
                    }, // modified
                    { name: 'price', data_type: 'numeric' }, // type changed
                    { name: 'new_col', data_type: 'boolean', default: 'TRUE' }, // added
                    // old_col removed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    assert.equal(report.tables.modified.length, 1)

    const tableMod = report.tables.modified[0]

    // Column added
    assert.equal(tableMod.columns.added.length, 1)
    assert.equal(tableMod.columns.added[0].name, 'new_col')

    // Column removed
    assert.equal(tableMod.columns.removed.length, 1)
    assert.equal(tableMod.columns.removed[0].name, 'old_col')

    // Columns modified
    assert.ok(tableMod.columns.modified.length >= 2)

    const nameMod = tableMod.columns.modified.find((m) => m.from.name === 'name')
    assert.ok(nameMod)
    assert.equal(nameMod.from.is_nullable, true)
    assert.equal(nameMod.to.is_nullable, false)
    assert.equal(nameMod.to.description, 'Product name')

    const priceMod = tableMod.columns.modified.find(
        (m) => m.from.name === 'price',
    )
    assert.ok(priceMod)
    assert.equal(priceMod.from.data_type, 'integer')
    assert.equal(priceMod.to.data_type, 'numeric')
})

test('diff: detect column position changes are ignored', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    { name: 'a', data_type: 'text', position: 1 },
                    { name: 'b', data_type: 'text', position: 2 },
                    { name: 'c', data_type: 'text', position: 3 },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    { name: 'a', data_type: 'text', position: 3 }, // position changed
                    { name: 'b', data_type: 'text', position: 1 }, // position changed
                    { name: 'c', data_type: 'text', position: 2 }, // position changed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    // Position changes should be ignored
    assert.equal(report.has_changes, false)
    assert.equal(report.tables.modified.length, 0)
})

test('diff: detect constraint operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
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
                    },
                    {
                        name: 'old_constraint',
                        type: 'CHECK',
                        check_predicate: 'id > 0',
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
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    }, // unchanged
                    {
                        name: 'users_email_unique',
                        type: 'UNIQUE',
                        columns: ['email'],
                        nulls_not_distinct: true,
                    }, // modified
                    {
                        name: 'new_constraint',
                        type: 'CHECK',
                        check_predicate: 'id >= 0',
                    }, // added
                    // old_constraint removed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    const tableMod = report.tables.modified[0]

    assert.equal(tableMod.constraints.added.length, 1)
    assert.equal(tableMod.constraints.added[0].name, 'new_constraint')

    assert.equal(tableMod.constraints.removed.length, 1)
    assert.equal(tableMod.constraints.removed[0].name, 'old_constraint')

    assert.equal(tableMod.constraints.modified.length, 1)
    assert.equal(tableMod.constraints.modified[0].from.name, 'users_email_unique')
    assert.equal(
        tableMod.constraints.modified[0].from.nulls_not_distinct,
        undefined,
    )
    assert.equal(tableMod.constraints.modified[0].to.nulls_not_distinct, true)
})

test('diff: detect index operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'title', data_type: 'text' },
                    { name: 'author_id', data_type: 'integer' },
                ],
                indexes: [
                    {
                        name: 'idx_title',
                        is_unique: false,
                        columns: [{ name: 'title' }],
                    },
                    {
                        name: 'idx_author',
                        is_unique: false,
                        columns: [{ name: 'author_id' }],
                    },
                    {
                        name: 'old_index',
                        is_unique: false,
                        columns: [{ name: 'id' }],
                    },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'title', data_type: 'text' },
                    { name: 'author_id', data_type: 'integer' },
                ],
                indexes: [
                    {
                        name: 'idx_title',
                        is_unique: true, // changed to unique
                        columns: [{ name: 'title' }],
                    },
                    {
                        name: 'idx_author',
                        is_unique: false,
                        columns: [{ name: 'author_id' }],
                    }, // unchanged
                    {
                        name: 'new_index',
                        is_unique: false,
                        index_type: 'gin',
                        columns: [{ name: 'title' }],
                    }, // added
                    // old_index removed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    const tableMod = report.tables.modified[0]

    assert.equal(tableMod.indexes.added.length, 1)
    assert.equal(tableMod.indexes.added[0].name, 'new_index')

    assert.equal(tableMod.indexes.removed.length, 1)
    assert.equal(tableMod.indexes.removed[0].name, 'old_index')

    assert.equal(tableMod.indexes.modified.length, 1)
    assert.equal(tableMod.indexes.modified[0].from.name, 'idx_title')
    assert.equal(tableMod.indexes.modified[0].from.is_unique, false)
    assert.equal(tableMod.indexes.modified[0].to.is_unique, true)
})

test('diff: detect foreign key operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'author_id', data_type: 'integer' },
                    { name: 'reviewer_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'posts_author_fk',
                        columns: ['author_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'NO ACTION',
                        on_update: 'NO ACTION',
                    },
                    {
                        name: 'old_fk',
                        columns: ['reviewer_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE',
                        on_update: 'CASCADE',
                    },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
            {
                name: 'posts',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'author_id', data_type: 'integer' },
                    { name: 'reviewer_id', data_type: 'integer' },
                ],
                foreign_keys: [
                    {
                        name: 'posts_author_fk',
                        columns: ['author_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'CASCADE', // modified
                        on_update: 'RESTRICT', // modified
                    },
                    {
                        name: 'new_fk',
                        columns: ['reviewer_id'],
                        foreign_table: 'users',
                        foreign_columns: ['id'],
                        on_delete: 'SET NULL',
                        on_update: 'CASCADE',
                    }, // added
                    // old_fk removed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    const tableMod = report.tables.modified.find((t) => t.name === 'posts')!

    assert.equal(tableMod.foreign_keys.added.length, 1)
    assert.equal(tableMod.foreign_keys.added[0].name, 'new_fk')

    assert.equal(tableMod.foreign_keys.removed.length, 1)
    assert.equal(tableMod.foreign_keys.removed[0].name, 'old_fk')

    assert.equal(tableMod.foreign_keys.modified.length, 1)
    assert.equal(tableMod.foreign_keys.modified[0].from.name, 'posts_author_fk')
    assert.equal(tableMod.foreign_keys.modified[0].from.on_delete, 'NO ACTION')
    assert.equal(tableMod.foreign_keys.modified[0].to.on_delete, 'CASCADE')
})

test('diff: detect view operations (add, modify, remove)', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'is_active', data_type: 'boolean' },
                ],
            },
        ],
        views: [
            {
                name: 'active_users',
                definition: 'SELECT * FROM users WHERE is_active = true',
            },
            {
                name: 'old_view',
                definition: 'SELECT id FROM users',
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'is_active', data_type: 'boolean' },
                ],
            },
        ],
        views: [
            {
                name: 'active_users',
                definition:
                    'SELECT id, email FROM users WHERE is_active = true', // modified
            },
            {
                name: 'new_view',
                definition: 'SELECT COUNT(*) FROM users',
            }, // added
            // old_view removed
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)

    assert.equal(report.views.added.length, 1)
    assert.equal(report.views.added[0].name, 'new_view')

    assert.equal(report.views.removed.length, 1)
    assert.equal(report.views.removed[0].name, 'old_view')

    assert.equal(report.views.modified.length, 1)
    assert.equal(report.views.modified[0].from.name, 'active_users')
    assert.ok(report.views.modified[0].from.definition.includes('SELECT *'))
    assert.ok(
        report.views.modified[0].to.definition.includes('SELECT id, email'),
    )
})

test('diff: detect table description changes', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                description: 'Old description',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'products',
                description: 'New description',
                columns: [{ name: 'id', data_type: 'integer' }],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    assert.equal(report.tables.modified.length, 1)

    const tableMod = report.tables.modified[0]
    assert.ok(tableMod.description)
    assert.equal(tableMod.description.from, 'Old description')
    assert.equal(tableMod.description.to, 'New description')
})

test('diff: complex e-commerce schema evolution', async () => {
    // Start with a simplified version
    const oldSchema: LocalSchema = {
        enums: [
            {
                name: 'order_status',
                values: ['pending', 'shipped', 'delivered'],
            },
        ],
        tables: [
            {
                name: 'products',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'name', data_type: 'text' },
                    { name: 'price', data_type: 'numeric' },
                ],
                constraints: [
                    {
                        name: 'products_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
            },
            {
                name: 'orders',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'status', data_type: 'USER-DEFINED', udt_name: 'order_status' },
                    { name: 'total', data_type: 'numeric' },
                ],
            },
        ],
    }

    // Evolve to full e-commerce schema
    const newSchema = ecommerceSchema

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)

    // Should detect enum changes
    assert.ok(report.enums.added.length > 0)
    assert.ok(report.enums.modified.length > 0)

    // Should detect new tables
    assert.ok(report.tables.added.length > 0)
    const addedTables = report.tables.added.map((t) => t.name)
    assert.ok(addedTables.includes('users'))
    assert.ok(addedTables.includes('categories'))
    assert.ok(addedTables.includes('reviews'))

    // Should detect table modifications
    assert.ok(report.tables.modified.length > 0)

    const productsMod = report.tables.modified.find((t) => t.name === 'products')
    if (productsMod) {
        assert.ok(productsMod.columns.added.length > 0)
        assert.ok(productsMod.constraints.added.length > 0)
        assert.ok(productsMod.indexes.added.length > 0)
    }

    const ordersMod = report.tables.modified.find((t) => t.name === 'orders')
    if (ordersMod) {
        assert.ok(ordersMod.columns.added.length > 0)
    }

    // Should detect views
    assert.equal(report.views.added.length, 2)
})

test('diff: no changes when schemas are identical', async () => {
    const schema: LocalSchema = {
        enums: [{ name: 'status', values: ['active', 'inactive'] }],
        tables: [
            {
                name: 'users',
                columns: [
                    { name: 'id', data_type: 'integer' },
                    { name: 'email', data_type: 'text' },
                ],
                constraints: [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                    },
                ],
                indexes: [
                    {
                        name: 'idx_email',
                        is_unique: false,
                        columns: [{ name: 'email' }],
                    },
                ],
            },
        ],
        views: [
            {
                name: 'active_users',
                definition: 'SELECT * FROM users',
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(schema),
        localSchemaToRemoteSchema(JSON.parse(JSON.stringify(schema))),
    )

    assert.equal(report.has_changes, false)
    assert.equal(report.enums.added.length, 0)
    assert.equal(report.enums.removed.length, 0)
    assert.equal(report.enums.modified.length, 0)
    assert.equal(report.tables.added.length, 0)
    assert.equal(report.tables.removed.length, 0)
    assert.equal(report.tables.modified.length, 0)
    assert.equal(report.views.added.length, 0)
    assert.equal(report.views.removed.length, 0)
    assert.equal(report.views.modified.length, 0)
})

test('diff: constraint indexes are filtered out', async () => {
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
                indexes: [
                    {
                        name: 'users_pkey',
                        is_unique: true,
                        is_constraint_index: true, // Should be filtered
                        columns: [{ name: 'id' }],
                    },
                    {
                        name: 'idx_custom',
                        is_unique: false,
                        columns: [{ name: 'id' }],
                    },
                ],
            },
        ],
    }

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
                indexes: [
                    {
                        name: 'users_pkey',
                        is_unique: true,
                        is_constraint_index: true, // Should be filtered
                        columns: [{ name: 'id' }],
                    },
                    // idx_custom removed
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    const tableMod = report.tables.modified[0]

    // Only idx_custom should be reported as removed
    assert.equal(tableMod.indexes.removed.length, 1)
    assert.equal(tableMod.indexes.removed[0].name, 'idx_custom')

    // users_pkey should not appear in any index diff
    assert.ok(
        !tableMod.indexes.added.find((i) => i.name === 'users_pkey'),
    )
    assert.ok(
        !tableMod.indexes.removed.find((i) => i.name === 'users_pkey'),
    )
    assert.ok(
        !tableMod.indexes.modified.find((i) => i.from.name === 'users_pkey'),
    )
})

test('diff: detect all column property changes', async () => {
    const oldSchema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    {
                        name: 'col1',
                        data_type: 'integer',
                        is_nullable: true,
                        default: null,
                        is_identity: false,
                        description: null,
                    },
                ],
            },
        ],
    }

    const newSchema: LocalSchema = {
        tables: [
            {
                name: 'test',
                columns: [
                    {
                        name: 'col1',
                        data_type: 'bigint', // type changed
                        is_nullable: false, // nullability changed
                        default: '42', // default added
                        is_identity: true, // identity added
                        identity_generation: 'BY DEFAULT',
                        description: 'Test column', // description added
                    },
                ],
            },
        ],
    }

    const report = createJsonDiffReport(
        localSchemaToRemoteSchema(oldSchema),
        localSchemaToRemoteSchema(newSchema),
    )

    assert.equal(report.has_changes, true)
    const tableMod = report.tables.modified[0]
    assert.equal(tableMod.columns.modified.length, 1)

    const colMod = tableMod.columns.modified[0]
    assert.equal(colMod.from.data_type, 'integer')
    assert.equal(colMod.to.data_type, 'bigint')
    assert.equal(colMod.from.is_nullable, true)
    assert.equal(colMod.to.is_nullable, false)
    assert.equal(colMod.from.default, null)
    assert.equal(colMod.to.default, '42')
    assert.equal(colMod.from.is_identity, false)
    assert.equal(colMod.to.is_identity, true)
    assert.equal(colMod.from.description, undefined)
    assert.equal(colMod.to.description, 'Test column')
})
