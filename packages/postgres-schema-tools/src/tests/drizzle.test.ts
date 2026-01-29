import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sql } from 'drizzle-orm'
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core'
import { fetchSchemaDrizzleORM } from '../schema/drizzle/fetch'

test('fetch empty schema', async () => {
    const schema = fetchSchemaDrizzleORM({})

    assert.equal(schema.tables?.length, 0)
    assert.equal(schema.enums?.length, 0)
    assert.equal(schema.views?.length, 0)
    assert.ok(Array.isArray(schema.tables))
    assert.ok(Array.isArray(schema.enums))
    assert.ok(Array.isArray(schema.views))
})

test('fetch simple table schema', async () => {
    const users = pgTable('users', {
        id: integer('id').primaryKey(),
        name: text('name').notNull(),
        isActive: boolean('is_active').default(true),
    })

    const schema = fetchSchemaDrizzleORM({ users })

    assert.equal(schema.tables?.length, 1)
    const table = schema.tables![0]

    assert.equal(table.name, 'users')
    assert.equal(table.columns.length, 3)

    const idCol = table.columns.find((c) => c.name === 'id')
    assert.ok(idCol)
    assert.equal(idCol.data_type, 'integer')
    assert.equal(idCol.is_nullable, false)

    const nameCol = table.columns.find((c) => c.name === 'name')
    assert.ok(nameCol)
    assert.equal(nameCol.data_type, 'text')
    assert.equal(nameCol.is_nullable, false)

    const activeCol = table.columns.find((c) => c.name === 'is_active')
    assert.ok(activeCol)
    assert.equal(activeCol.data_type, 'boolean')
    assert.equal(activeCol.default, 'TRUE')
})

test('fetch enums', async () => {
    const roleEnum = pgEnum('role', ['admin', 'user', 'guest'])
    const users = pgTable('users', {
        id: integer('id'),
        role: roleEnum('role'),
    })

    const schema = fetchSchemaDrizzleORM({ roleEnum, users })

    assert.equal(schema.enums?.length, 1)
    assert.equal(schema.enums![0].name, 'role')
    assert.deepEqual(schema.enums![0].values, ['admin', 'user', 'guest'])
})

test('fetch foreign keys and indexes', async () => {
    const users = pgTable('users', {
        id: integer('id').primaryKey(),
    })

    const posts = pgTable(
        'posts',
        {
            id: integer('id').primaryKey(),
            userId: integer('user_id').references(() => users.id, {
                onDelete: 'cascade',
                onUpdate: 'no action',
            }),
            title: text('title'),
        },
        // Updated: Returning an Array instead of an Object
        (t) => [index('title_idx').on(t.title)],
    )

    const schema = fetchSchemaDrizzleORM({ users, posts })

    assert.equal(schema.tables?.length, 2)

    const postsTable = schema.tables?.find((t) => t.name === 'posts')
    assert.ok(postsTable)

    // Verify FK
    assert.equal(postsTable.foreign_keys?.length, 1)
    const fk = postsTable.foreign_keys![0]
    assert.equal(fk.foreign_table, 'users')
    assert.deepEqual(fk.columns, ['user_id'])
    assert.deepEqual(fk.foreign_columns, ['id'])
    assert.equal(fk.on_delete, 'CASCADE')

    // Verify Index
    assert.equal(postsTable.indexes?.length, 1)
    const idx = postsTable.indexes![0]
    assert.equal(idx.name, 'title_idx')
    assert.deepEqual(idx.columns, [{ name: 'title', sort_order: 'ASC', nulls_order: 'NULLS LAST' }])
})

test('fetch composite primary key', async () => {
    const membership = pgTable(
        'membership',
        {
            userId: integer('user_id'),
            groupId: integer('group_id'),
        },
        (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
    )

    const schema = fetchSchemaDrizzleORM({ membership })
    const table = schema.tables![0]

    // Verify Composite PK
    const pk = table.constraints?.find((c) => c.type === 'PRIMARY KEY')
    assert.ok(pk)
    assert.deepEqual(pk.columns, ['user_id', 'group_id'])
})

test('fetch complex edge cases: composite unique, check constraints, self-referential FK, multi-col index', async () => {
    // 1. A category table with self-referential FK
    const categories = pgTable(
        'categories',
        {
            id: integer('id').primaryKey(),
            parentId: integer('parent_id'), // Self reference
            name: text('name').notNull(),
            slug: text('slug').notNull(),
            metadata: jsonb('metadata').default({}),
        },
        (t) => [
            // Self-referential Foreign Key
            foreignKey({
                columns: [t.parentId],
                foreignColumns: [t.id],
                name: 'categories_parent_fk',
            }).onDelete('set null'),
            // Composite Unique Constraint
            unique('unique_name_parent').on(t.parentId, t.name),
        ],
    )

    // 2. A complex audit log table
    const auditLogs = pgTable(
        'audit_logs',
        {
            id: integer('id').primaryKey(),
            action: text('action').notNull(),
            severity: integer('severity').notNull(),
            createdAt: timestamp('created_at').default(sql`now() + ${1}`),
            entityId: integer('entity_id'),
            entityType: text('entity_type'),
        },
        (t) => [
            // Multi-column Index
            index('audit_composite_idx').on(
                t.entityType,
                t.entityId,
                t.createdAt,
            ),
            // Check Constraint using SQL
            check(
                'severity_check',
                sql`${t.severity} >= 1 AND ${t.severity} <= 5`,
            ),
        ],
    )

    const schema = fetchSchemaDrizzleORM({ categories, auditLogs })

    assert.equal(schema.tables?.length, 2)

    // Validate Categories (Self-Ref FK + Composite Unique)
    const catTable = schema.tables?.find((t) => t.name === 'categories')
    assert.ok(catTable)

    const selfFk = catTable.foreign_keys?.find(
        (fk) => fk.name === 'categories_parent_fk',
    )
    assert.ok(selfFk, 'Self-referential FK missing')
    assert.equal(selfFk.foreign_table, 'categories')
    assert.deepEqual(selfFk.columns, ['parent_id'])
    assert.deepEqual(selfFk.foreign_columns, ['id'])
    assert.equal(selfFk.on_delete, 'SET NULL')

    const compositeUnique = catTable.constraints?.find(
        (c) => c.name === 'unique_name_parent',
    )
    assert.ok(compositeUnique, 'Composite Unique missing')
    assert.equal(compositeUnique.type, 'UNIQUE')
    assert.deepEqual(compositeUnique.columns, ['parent_id', 'name'])

    // Validate AuditLogs (Multi-col Index + Check Constraint)
    const auditTable = schema.tables?.find((t) => t.name === 'audit_logs')
    assert.ok(auditTable)

    const compositeIdx = auditTable.indexes?.find(
        (i) => i.name === 'audit_composite_idx',
    )
    assert.ok(compositeIdx, 'Composite Index missing')
    assert.deepEqual(compositeIdx.columns, [
        { name: 'entity_type', sort_order: 'ASC', nulls_order: 'NULLS LAST' },
        { name: 'entity_id', sort_order: 'ASC', nulls_order: 'NULLS LAST' },
        { name: 'created_at', sort_order: 'ASC', nulls_order: 'NULLS LAST' },
    ])

    const checkConstraint = auditTable.constraints?.find(
        (c) => c.name === 'severity_check',
    )
    assert.ok(checkConstraint, 'Check constraint missing')
    assert.equal(checkConstraint.type, 'CHECK')
    // The content of the check predicate usually comes out as a SQL string.
    // Exact string matching might be brittle depending on Drizzle's SQL generation, but we check existence.
    assert.ok(checkConstraint.check_predicate)
    console.log(checkConstraint.check_predicate)
    assert.ok(checkConstraint.check_predicate?.includes('severity'))
})
