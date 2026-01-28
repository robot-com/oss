/**
 * Tests for markdown report generation
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMarkdownReport } from '../report/markdown'
import type { JsonReport } from '../report/type'

test('markdown: generate report with no changes', () => {
    const report: JsonReport = {
        has_changes: false,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: { added: [], removed: [], modified: [] },
        views: { added: [], removed: [], modified: [] },
        tables: { added: [], removed: [], modified: [] },
    }

    const markdown = createMarkdownReport(report)
    assert.ok(markdown.includes('Schema Difference Report'))
    assert.ok(markdown.includes('Current'))
    assert.ok(markdown.includes('New'))
    // When there are no changes, the report should be minimal
    assert.ok(!markdown.includes('Enums'))
    assert.ok(!markdown.includes('Tables'))
    assert.ok(!markdown.includes('Views'))
})

test('markdown: generate report with enum changes', () => {
    const report: JsonReport = {
        has_changes: true,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: {
            added: [{ name: 'status', description: null, values: ['active', 'inactive'] }],
            removed: [{ name: 'old_status', description: null, values: ['open', 'closed'] }],
            modified: [
                {
                    from: { name: 'role', description: null, values: ['user', 'admin'] },
                    to: { name: 'role', description: null, values: ['user', 'admin', 'guest'] },
                },
            ],
        },
        views: { added: [], removed: [], modified: [] },
        tables: { added: [], removed: [], modified: [] },
    }

    const markdown = createMarkdownReport(report)
    assert.ok(markdown.includes('status'))
    assert.ok(markdown.includes('old_status'))
    assert.ok(markdown.includes('role'))
    assert.ok(markdown.includes('Added Enum'))
    assert.ok(markdown.includes('Removed Enum'))
    assert.ok(markdown.includes('Modified Enum'))
})

test('markdown: generate report with table changes', () => {
    const report: JsonReport = {
        has_changes: true,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: { added: [], removed: [], modified: [] },
        views: { added: [], removed: [], modified: [] },
        tables: {
            added: [
                {
                    name: 'new_table',
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
            removed: [
                {
                    name: 'old_table',
                    description: null,
                    columns: [],
                    constraints: [],
                    indexes: [],
                    foreign_keys: [],
                    triggers: [],
                },
            ],
            modified: [
                {
                    name: 'users',
                    columns: {
                        added: [
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
                        removed: [
                            {
                                name: 'username',
                                description: null,
                                position: 3,
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
                        modified: [
                            {
                                from: {
                                    name: 'status',
                                    description: null,
                                    position: 1,
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
                                to: {
                                    name: 'status',
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
                            },
                        ],
                    },
                    constraints: { added: [], removed: [], modified: [] },
                    indexes: { added: [], removed: [], modified: [] },
                    foreign_keys: { added: [], removed: [], modified: [] },
                    triggers: { added: [], removed: [], modified: [] },
                },
            ],
        },
    }

    const markdown = createMarkdownReport(report)
    assert.ok(markdown.includes('new_table'))
    assert.ok(markdown.includes('old_table'))
    assert.ok(markdown.includes('users'))
    assert.ok(markdown.includes('email'))
    assert.ok(markdown.includes('username'))
    assert.ok(markdown.includes('status'))
})

test('markdown: generate report with migration code', () => {
    const report: JsonReport = {
        has_changes: true,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: {
            added: [{ name: 'status', description: null, values: ['active', 'inactive'] }],
            removed: [],
            modified: [],
        },
        views: { added: [], removed: [], modified: [] },
        tables: { added: [], removed: [], modified: [] },
    }

    const markdown = createMarkdownReport(report, 'Old', 'New', {
        includeMigrationCode: true,
    })
    assert.ok(markdown.includes('Apply Changes'))
    assert.ok(markdown.includes('CREATE TYPE'))
    assert.ok(markdown.includes('```sql'))
})

test('markdown: generate report with custom schema names', () => {
    const report: JsonReport = {
        has_changes: false,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: { added: [], removed: [], modified: [] },
        views: { added: [], removed: [], modified: [] },
        tables: { added: [], removed: [], modified: [] },
    }

    const markdown = createMarkdownReport(report, 'Development', 'Production')
    assert.ok(markdown.includes('Development'))
    assert.ok(markdown.includes('Production'))
})

test('markdown: generate report with view changes', () => {
    const report: JsonReport = {
        has_changes: true,
        schemas: { from: 'public', to: 'public' },
        generated_at: new Date().toISOString(),
        enums: { added: [], removed: [], modified: [] },
        views: {
            added: [{ name: 'user_stats', description: null, definition: 'SELECT ...' }],
            removed: [{ name: 'old_view', description: null, definition: 'SELECT ...' }],
            modified: [
                {
                    from: {
                        name: 'active_users',
                        description: null,
                        definition: 'SELECT * FROM users WHERE active = true',
                    },
                    to: {
                        name: 'active_users',
                        description: null,
                        definition:
                            'SELECT * FROM users WHERE active = true AND verified = true',
                    },
                },
            ],
        },
        tables: { added: [], removed: [], modified: [] },
    }

    const markdown = createMarkdownReport(report)
    assert.ok(markdown.includes('user_stats'))
    assert.ok(markdown.includes('old_view'))
    assert.ok(markdown.includes('active_users'))
    assert.ok(markdown.includes('Added View'))
    assert.ok(markdown.includes('Removed View'))
    assert.ok(markdown.includes('Modified View'))
})
