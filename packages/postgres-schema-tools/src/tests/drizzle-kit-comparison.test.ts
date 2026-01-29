/**
 * Comprehensive tests comparing postgres-schema-tools with drizzle-kit.
 *
 * These tests verify that our implementation produces equivalent results
 * to drizzle-kit's official pushSchema API.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { sql } from 'drizzle-orm'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import {
    bigint,
    bigserial,
    boolean,
    char,
    check,
    date,
    doublePrecision,
    foreignKey,
    index,
    inet,
    integer,
    interval,
    json,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    real,
    serial,
    smallint,
    text,
    time,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'
import { PGlite } from '@electric-sql/pglite'
import { fetchSchemaDrizzleORM } from '../schema/drizzle/fetch'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch'
import { createJsonDiffReport } from '../report/json'
import type { RemoteSchema } from '../schema/remote/types'

// Use createRequire to load drizzle-kit (it needs CommonJS require)
const require = createRequire(import.meta.url)
const { pushSchema } = require('drizzle-kit/api') as {
    pushSchema: (
        schema: Record<string, unknown>,
        db: ReturnType<typeof drizzlePglite>,
    ) => Promise<{ apply: () => Promise<void> }>
}

/**
 * Push schema using drizzle-kit's official API
 */
async function pushWithDrizzleKit(
    schemaObj: Record<string, unknown>,
): Promise<RemoteSchema> {
    const pglite = new PGlite()
    const db = drizzlePglite(pglite)

    const result = await pushSchema(schemaObj, db)
    await result.apply()

    return fetchSchemaPgLite(pglite)
}

/**
 * Push schema using our implementation
 */
async function pushWithOurImplementation(
    schemaObj: Record<string, unknown>,
): Promise<RemoteSchema> {
    const pglite = new PGlite()
    const localSchema = fetchSchemaDrizzleORM(schemaObj)
    const statements = generatePushNewSchema(localSchema)

    for (const statement of statements) {
        const parts = statement
            .split(/;\s*\n|;\s*$/g)
            .map((p) => p.trim())
            .filter(Boolean)
        for (const part of parts) {
            await pglite.query(part)
        }
    }

    return fetchSchemaPgLite(pglite)
}

// ============================================================================
// drizzle-kit vs our implementation comparison tests
// ============================================================================

test('drizzle-kit vs ours: basic table with scalar columns', async () => {
    const users = pgTable('users', {
        id: serial('id').primaryKey(),
        email: text('email').notNull(),
        name: text('name'),
        isActive: boolean('is_active').default(true),
    })

    const schemaObj = { users }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: enum types', async () => {
    const statusEnum = pgEnum('status', ['active', 'inactive', 'pending'])
    const roleEnum = pgEnum('role', ['admin', 'user', 'guest'])

    const users = pgTable('users', {
        id: serial('id').primaryKey(),
        status: statusEnum('status').notNull().default('pending'),
        role: roleEnum('role').default('user'),
    })

    const schemaObj = { statusEnum, roleEnum, users }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: unique and check constraints', async () => {
    const products = pgTable(
        'products',
        {
            id: serial('id').primaryKey(),
            name: text('name').notNull(),
            sku: text('sku').notNull(),
            price: numeric('price', { precision: 10, scale: 2 }).notNull(),
        },
        (t) => [
            unique('products_sku_unique').on(t.sku),
            check('price_positive', sql`${t.price} > 0`),
        ],
    )

    const schemaObj = { products }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: foreign keys', async () => {
    const users = pgTable('users', {
        id: serial('id').primaryKey(),
        email: text('email').notNull(),
    })

    const posts = pgTable('posts', {
        id: serial('id').primaryKey(),
        authorId: integer('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
    })

    const schemaObj = { users, posts }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: indexes', async () => {
    const users = pgTable(
        'users',
        {
            id: serial('id').primaryKey(),
            email: text('email').notNull(),
            createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
        },
        (t) => [
            index('idx_users_email').on(t.email),
            index('idx_users_created_at').on(t.createdAt),
        ],
    )

    const schemaObj = { users }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: composite primary key', async () => {
    const orderItems = pgTable(
        'order_items',
        {
            orderId: integer('order_id').notNull(),
            productId: integer('product_id').notNull(),
            quantity: integer('quantity').default(1),
        },
        (t) => [primaryKey({ columns: [t.orderId, t.productId] })],
    )

    const schemaObj = { orderItems }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: self-referential foreign key', async () => {
    const categories = pgTable(
        'categories',
        {
            id: serial('id').primaryKey(),
            parentId: integer('parent_id'),
            name: text('name').notNull(),
        },
        (t) => [
            foreignKey({
                columns: [t.parentId],
                foreignColumns: [t.id],
                name: 'categories_parent_fk',
            }).onDelete('cascade'),
        ],
    )

    const schemaObj = { categories }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: UUID and JSONB', async () => {
    const users = pgTable(
        'users',
        {
            id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
            email: text('email').notNull(),
            settings: jsonb('settings').default({}),
        },
        (t) => [unique('users_email_unique').on(t.email)],
    )

    const schemaObj = { users }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: complex e-commerce schema', async () => {
    const statusEnum = pgEnum('order_status', [
        'pending',
        'processing',
        'shipped',
        'delivered',
    ])

    const customers = pgTable(
        'customers',
        {
            id: serial('id').primaryKey(),
            email: text('email').notNull(),
            name: text('name'),
        },
        (t) => [unique('customers_email_unique').on(t.email)],
    )

    const products = pgTable(
        'products',
        {
            id: serial('id').primaryKey(),
            name: text('name').notNull(),
            price: numeric('price', { precision: 10, scale: 2 }).notNull(),
        },
        (t) => [check('products_price_check', sql`${t.price} > 0`)],
    )

    const orders = pgTable(
        'orders',
        {
            id: serial('id').primaryKey(),
            customerId: integer('customer_id')
                .notNull()
                .references(() => customers.id),
            status: statusEnum('status').notNull().default('pending'),
            total: numeric('total', { precision: 10, scale: 2 }).notNull(),
        },
        (t) => [
            index('idx_orders_customer').on(t.customerId),
            index('idx_orders_status').on(t.status),
        ],
    )

    const orderItems = pgTable(
        'order_items',
        {
            orderId: integer('order_id')
                .notNull()
                .references(() => orders.id, { onDelete: 'cascade' }),
            productId: integer('product_id')
                .notNull()
                .references(() => products.id),
            quantity: integer('quantity').notNull().default(1),
        },
        (t) => [
            primaryKey({ columns: [t.orderId, t.productId] }),
            check('order_items_quantity_check', sql`${t.quantity} > 0`),
        ],
    )

    const schemaObj = { statusEnum, customers, products, orders, orderItems }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: multi-tenant SaaS schema', async () => {
    const planEnum = pgEnum('plan', ['free', 'pro', 'enterprise'])
    const roleEnum = pgEnum('role', ['owner', 'admin', 'member'])

    const tenants = pgTable(
        'tenants',
        {
            id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
            name: text('name').notNull(),
            slug: text('slug').notNull(),
            plan: planEnum('plan').notNull().default('free'),
            settings: jsonb('settings').default({}),
        },
        (t) => [
            unique('tenants_slug_unique').on(t.slug),
            index('idx_tenants_plan').on(t.plan),
        ],
    )

    const users = pgTable('users', {
        id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
        email: text('email').notNull(),
        name: text('name'),
    })

    const members = pgTable(
        'members',
        {
            tenantId: uuid('tenant_id')
                .notNull()
                .references(() => tenants.id, { onDelete: 'cascade' }),
            userId: uuid('user_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
            role: roleEnum('role').notNull().default('member'),
        },
        (t) => [
            primaryKey({ columns: [t.tenantId, t.userId] }),
            index('idx_members_user').on(t.userId),
        ],
    )

    const schemaObj = { planEnum, roleEnum, tenants, users, members }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: all numeric types', async () => {
    const numbers = pgTable('numbers', {
        id: serial('id').primaryKey(),
        smallNum: smallint('small_num').notNull(),
        regularNum: integer('regular_num').default(42),
        bigNum: bigint('big_num', { mode: 'number' }),
        bigSerialNum: bigserial('big_serial_num', { mode: 'number' }),
        realNum: real('real_num').default(3.14),
        doubleNum: doublePrecision('double_num'),
        decimalNum: numeric('decimal_num', { precision: 10, scale: 2 }),
    })

    const schemaObj = { numbers }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: string types with length', async () => {
    const strings = pgTable('strings', {
        id: serial('id').primaryKey(),
        shortText: varchar('short_text', { length: 50 }).notNull(),
        fixedChar: char('fixed_char', { length: 10 }),
        unlimitedText: text('unlimited_text'),
        defaultVarchar: varchar('default_varchar', { length: 255 }).default('hello'),
    })

    const schemaObj = { strings }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: date and time types', async () => {
    const events = pgTable('events', {
        id: serial('id').primaryKey(),
        eventDate: date('event_date').notNull(),
        eventTime: time('event_time'),
        createdAt: timestamp('created_at').notNull().default(sql`NOW()`),
        scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
        duration: interval('duration'),
    })

    const schemaObj = { events }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: json types', async () => {
    const documents = pgTable('documents', {
        id: serial('id').primaryKey(),
        metadata: json('metadata'),
        settings: jsonb('settings').default({}),
        tags: jsonb('tags').default([]),
    })

    const schemaObj = { documents }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: network types', async () => {
    const servers = pgTable('servers', {
        id: serial('id').primaryKey(),
        ipAddress: inet('ip_address').notNull(),
        hostname: text('hostname'),
    })

    const schemaObj = { servers }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: complex default values', async () => {
    const records = pgTable('records', {
        id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
        createdAt: timestamp('created_at').default(sql`CURRENT_TIMESTAMP`),
        updatedAt: timestamp('updated_at').default(sql`NOW()`),
        counter: integer('counter').default(0),
        isActive: boolean('is_active').default(true),
        rating: numeric('rating', { precision: 3, scale: 2 }).default('0.00'),
    })

    const schemaObj = { records }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: multiple foreign keys between tables', async () => {
    const users = pgTable('users', {
        id: serial('id').primaryKey(),
        name: text('name').notNull(),
    })

    const tasks = pgTable('tasks', {
        id: serial('id').primaryKey(),
        title: text('title').notNull(),
        createdBy: integer('created_by')
            .notNull()
            .references(() => users.id),
        assignedTo: integer('assigned_to').references(() => users.id),
        reviewedBy: integer('reviewed_by').references(() => users.id, {
            onDelete: 'set null',
        }),
    })

    const schemaObj = { users, tasks }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: multiple indexes on same table', async () => {
    const products = pgTable(
        'products',
        {
            id: serial('id').primaryKey(),
            sku: text('sku').notNull(),
            name: text('name').notNull(),
            category: text('category'),
            price: numeric('price', { precision: 10, scale: 2 }),
            createdAt: timestamp('created_at').default(sql`NOW()`),
        },
        (t) => [
            index('idx_products_sku').on(t.sku),
            index('idx_products_name').on(t.name),
            index('idx_products_category').on(t.category),
            index('idx_products_price').on(t.price),
            unique('products_sku_unique').on(t.sku),
        ],
    )

    const schemaObj = { products }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})

test('drizzle-kit vs ours: nullable vs non-nullable columns', async () => {
    const profiles = pgTable('profiles', {
        id: serial('id').primaryKey(),
        requiredField: text('required_field').notNull(),
        optionalField: text('optional_field'),
        requiredWithDefault: text('required_with_default').notNull().default('default'),
        optionalWithDefault: text('optional_with_default').default('optional'),
    })

    const schemaObj = { profiles }

    const [dkSchema, ourSchema] = await Promise.all([
        pushWithDrizzleKit(schemaObj),
        pushWithOurImplementation(schemaObj),
    ])

    const diff = createJsonDiffReport(dkSchema, ourSchema)

    assert.equal(
        diff.has_changes,
        false,
        `Schemas should match. Differences:\n${JSON.stringify(diff, null, 2)}`,
    )
})
