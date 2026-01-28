/**
 * Comprehensive tests for complex Drizzle ORM schemas
 * Uses MODERN Drizzle syntax (returning arrays, not objects)
 * Tests the full type mapping and schema conversion pipeline
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sql } from 'drizzle-orm'
import {
    bigint,
    bigserial,
    boolean,
    check,
    date,
    foreignKey,
    index,
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
    text,
    time,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'
import { createLocalDatabase } from '../db'
import { fetchSchemaDrizzleORM } from '../schema/drizzle/fetch'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch'

test('drizzle: complex e-commerce schema with all features', async () => {
    // Define enums
    const userRoleEnum = pgEnum('user_role', ['customer', 'vendor', 'admin'])
    const orderStatusEnum = pgEnum('order_status', [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
    ])
    const paymentMethodEnum = pgEnum('payment_method', [
        'credit_card',
        'paypal',
        'bank_transfer',
    ])

    // Users table
    const users = pgTable(
        'users',
        {
            id: serial('id').primaryKey(),
            email: text('email').notNull(),
            username: text('username').notNull(),
            passwordHash: text('password_hash').notNull(),
            role: userRoleEnum('role').notNull().default('customer'),
            firstName: text('first_name'),
            lastName: text('last_name'),
            isActive: boolean('is_active').notNull().default(true),
            metadata: jsonb('metadata').default({}),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
        },
        // MODERN SYNTAX: return an array
        (t) => [
            unique('users_email_unique').on(t.email),
            unique('users_username_unique').on(t.username),
            check('users_email_check', sql`${t.email} ~* '^[A-Za-z0-9._%+-]+@'`),
            index('idx_users_role').on(t.role),
            index('idx_users_created_at').on(t.createdAt.desc()),
        ],
    )

    // Categories table (self-referential)
    const categories = pgTable(
        'categories',
        {
            id: serial('id').primaryKey(),
            parentId: integer('parent_id'),
            name: text('name').notNull(),
            slug: text('slug').notNull(),
            displayOrder: integer('display_order').notNull().default(0),
            isActive: boolean('is_active').notNull().default(true),
        },
        (t) => [
            foreignKey({
                columns: [t.parentId],
                foreignColumns: [t.id],
                name: 'categories_parent_fk',
            })
                .onDelete('cascade')
                .onUpdate('cascade'),
            unique('categories_slug_unique').on(t.slug),
            unique('categories_unique_name_per_parent').on(t.parentId, t.name),
            index('idx_categories_parent_id').on(t.parentId),
        ],
    )

    // Products table
    const products = pgTable(
        'products',
        {
            id: serial('id').primaryKey(),
            vendorId: integer('vendor_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
            categoryId: integer('category_id')
                .notNull()
                .references(() => categories.id, { onDelete: 'restrict' }),
            sku: text('sku').notNull(),
            name: text('name').notNull(),
            description: text('description'),
            price: numeric('price', { precision: 10, scale: 2 }).notNull(),
            compareAtPrice: numeric('compare_at_price', { precision: 10, scale: 2 }),
            stockQuantity: integer('stock_quantity').notNull().default(0),
            tags: text('tags').array().default(sql`'{}'::text[]`),
            metadata: jsonb('metadata').default({}),
            isFeatured: boolean('is_featured').notNull().default(false),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
            publishedAt: timestamp('published_at', { withTimezone: true }),
        },
        (t) => [
            unique('products_sku_unique').on(t.sku),
            check('products_price_check', sql`${t.price} > 0`),
            check(
                'products_compare_price_check',
                sql`${t.compareAtPrice} IS NULL OR ${t.compareAtPrice} >= ${t.price}`,
            ),
            check('products_stock_check', sql`${t.stockQuantity} >= 0`),
            index('idx_products_vendor_id').on(t.vendorId),
            index('idx_products_category_id').on(t.categoryId),
            index('idx_products_price').on(t.price),
        ],
    )

    // Orders table
    const orders = pgTable(
        'orders',
        {
            id: serial('id').primaryKey(),
            customerId: integer('customer_id')
                .notNull()
                .references(() => users.id, { onDelete: 'restrict' }),
            orderNumber: text('order_number').notNull(),
            status: orderStatusEnum('status').notNull().default('pending'),
            subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
            taxAmount: numeric('tax_amount', { precision: 10, scale: 2 })
                .notNull()
                .default('0'),
            shippingAmount: numeric('shipping_amount', { precision: 10, scale: 2 })
                .notNull()
                .default('0'),
            total: numeric('total', { precision: 10, scale: 2 }).notNull(),
            paymentMethod: paymentMethodEnum('payment_method'),
            shippingAddress: jsonb('shipping_address').notNull(),
            billingAddress: jsonb('billing_address').notNull(),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
        },
        (t) => [
            unique('orders_order_number_unique').on(t.orderNumber),
            check('orders_total_check', sql`${t.total} >= 0`),
            index('idx_orders_customer_id').on(t.customerId),
            index('idx_orders_status').on(t.status),
            index('idx_orders_created_at').on(t.createdAt.desc()),
            index('idx_orders_customer_status').on(t.customerId, t.status),
        ],
    )

    // Order items (composite PK)
    const orderItems = pgTable(
        'order_items',
        {
            orderId: integer('order_id')
                .notNull()
                .references(() => orders.id, { onDelete: 'cascade' }),
            productId: integer('product_id')
                .notNull()
                .references(() => products.id, { onDelete: 'restrict' }),
            quantity: integer('quantity').notNull().default(1),
            unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
            total: numeric('total', { precision: 10, scale: 2 }).notNull(),
            productSnapshot: jsonb('product_snapshot').notNull(),
        },
        (t) => [
            primaryKey({ columns: [t.orderId, t.productId] }),
            check('order_items_quantity_check', sql`${t.quantity} > 0`),
            check('order_items_unit_price_check', sql`${t.unitPrice} >= 0`),
            index('idx_order_items_product_id').on(t.productId),
        ],
    )

    // Fetch schema from Drizzle definitions
    const drizzleSchema = fetchSchemaDrizzleORM({
        userRoleEnum,
        orderStatusEnum,
        paymentMethodEnum,
        users,
        categories,
        products,
        orders,
        orderItems,
    })

    // Verify enums
    assert.equal(drizzleSchema.enums?.length, 3)
    assert.ok(drizzleSchema.enums?.find((e) => e.name === 'user_role'))
    assert.ok(drizzleSchema.enums?.find((e) => e.name === 'order_status'))
    assert.ok(drizzleSchema.enums?.find((e) => e.name === 'payment_method'))

    // Verify tables
    assert.equal(drizzleSchema.tables?.length, 5)

    // Verify users table
    const usersTable = drizzleSchema.tables?.find((t) => t.name === 'users')!
    assert.ok(usersTable)
    assert.ok(usersTable.columns.find((c) => c.name === 'metadata'))
    assert.ok(usersTable.constraints?.find((c) => c.name === 'users_email_unique'))
    assert.ok(
        usersTable.constraints?.find((c) => c.name === 'users_username_unique'),
    )
    assert.ok(usersTable.constraints?.find((c) => c.name === 'users_email_check'))
    assert.ok(usersTable.indexes?.find((i) => i.name === 'idx_users_role'))

    // Verify self-referential FK
    const categoriesTable = drizzleSchema.tables?.find(
        (t) => t.name === 'categories',
    )!
    const selfFk = categoriesTable.foreign_keys?.find(
        (fk) => fk.name === 'categories_parent_fk',
    )
    assert.ok(selfFk)
    assert.equal(selfFk.foreign_table, 'categories')
    assert.equal(selfFk.on_delete, 'CASCADE')

    // Verify products table
    const productsTable = drizzleSchema.tables?.find((t) => t.name === 'products')!
    assert.ok(productsTable)
    assert.equal(productsTable.foreign_keys?.length, 2)

    const priceCol = productsTable.columns.find((c) => c.name === 'price')!
    assert.equal(priceCol.data_type, 'numeric')

    const tagsCol = productsTable.columns.find((c) => c.name === 'tags')!
    assert.equal(tagsCol.data_type, 'text[]')

    // Verify composite PK
    const orderItemsTable = drizzleSchema.tables?.find(
        (t) => t.name === 'order_items',
    )!
    const compositePk = orderItemsTable.constraints?.find(
        (c) => c.type === 'PRIMARY KEY',
    )
    assert.ok(compositePk)
    assert.deepEqual(compositePk.columns, ['order_id', 'product_id'])

    // INTEGRATION TEST: Push to database and verify
    const db = await createLocalDatabase({})
    const client = db.$client

    const statements = generatePushNewSchema(drizzleSchema)
    for (const s of statements) {
        const parts = s
            .split(/;\s*\n|;\s*$/g)
            .map((p) => p.trim())
            .filter(Boolean)
        for (const p of parts) {
            await client.query(p)
        }
    }

    // Fetch back from DB and verify
    const fetched = await fetchSchemaPgLite(client)
    assert.equal(fetched.enums.length, 3)
    assert.equal(fetched.tables.length, 5)

    // Verify self-ref FK was created
    const fetchedCategories = fetched.tables.find((t) => t.name === 'categories')!
    assert.ok(
        fetchedCategories.foreign_keys.find((fk) => fk.foreign_table === 'categories'),
    )
})

test('drizzle: SaaS multi-tenant schema with UUIDs', async () => {
    const subscriptionPlanEnum = pgEnum('subscription_plan', [
        'free',
        'starter',
        'professional',
        'enterprise',
    ])
    const memberRoleEnum = pgEnum('member_role', [
        'owner',
        'admin',
        'member',
        'viewer',
    ])

    const tenants = pgTable(
        'tenants',
        {
            id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
            name: text('name').notNull(),
            slug: text('slug').notNull(),
            plan: subscriptionPlanEnum('plan').notNull().default('free'),
            settings: jsonb('settings').notNull().default({}),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
            deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
        emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .default(sql`NOW()`),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    })

    const tenantMembers = pgTable(
        'tenant_members',
        {
            tenantId: uuid('tenant_id')
                .notNull()
                .references(() => tenants.id, { onDelete: 'cascade' }),
            userId: uuid('user_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
            role: memberRoleEnum('role').notNull().default('member'),
            invitedBy: uuid('invited_by').references(() => users.id, {
                onDelete: 'set null',
            }),
            joinedAt: timestamp('joined_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
        },
        (t) => [
            primaryKey({ columns: [t.tenantId, t.userId] }),
            index('idx_tenant_members_user_id').on(t.userId),
            index('idx_tenant_members_role').on(t.tenantId, t.role),
        ],
    )

    const projects = pgTable(
        'projects',
        {
            id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
            tenantId: uuid('tenant_id')
                .notNull()
                .references(() => tenants.id, { onDelete: 'cascade' }),
            name: text('name').notNull(),
            description: text('description'),
            metadata: jsonb('metadata').notNull().default({}),
            createdBy: uuid('created_by')
                .notNull()
                .references(() => users.id, { onDelete: 'restrict' }),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
            deletedAt: timestamp('deleted_at', { withTimezone: true }),
        },
        (t) => [
            unique('projects_unique_name_per_tenant').on(t.tenantId, t.name),
            index('idx_projects_tenant_id').on(t.tenantId),
            index('idx_projects_created_by').on(t.createdBy),
        ],
    )

    const drizzleSchema = fetchSchemaDrizzleORM({
        subscriptionPlanEnum,
        memberRoleEnum,
        tenants,
        users,
        tenantMembers,
        projects,
    })

    assert.equal(drizzleSchema.enums?.length, 2)
    assert.equal(drizzleSchema.tables?.length, 4)

    // Verify UUID columns
    const tenantsTable = drizzleSchema.tables?.find((t) => t.name === 'tenants')!
    const idCol = tenantsTable.columns.find((c) => c.name === 'id')!
    assert.equal(idCol.data_type, 'uuid')

    // Verify composite PK
    const membersTable = drizzleSchema.tables?.find(
        (t) => t.name === 'tenant_members',
    )!
    const pk = membersTable.constraints?.find((c) => c.type === 'PRIMARY KEY')!
    assert.deepEqual(pk.columns, ['tenant_id', 'user_id'])

    // Verify self-referential FK (invited_by)
    const invitedByFk = membersTable.foreign_keys?.find(
        (fk) => fk.columns[0] === 'invited_by',
    )
    assert.ok(invitedByFk)
    assert.equal(invitedByFk.foreign_table, 'users')
    assert.equal(invitedByFk.on_delete, 'SET NULL')

    // Verify composite unique
    const projectsTable = drizzleSchema.tables?.find((t) => t.name === 'projects')!
    const uniqueConstraint = projectsTable.constraints?.find(
        (c) => c.name === 'projects_unique_name_per_tenant',
    )
    assert.ok(uniqueConstraint)
    assert.deepEqual(uniqueConstraint.columns, ['tenant_id', 'name'])
})

test('drizzle: all PostgreSQL data types', async () => {
    const testTable = pgTable('all_types', {
        // Numeric types
        colBigint: bigint('col_bigint', { mode: 'number' }),
        colBigserial: bigserial('col_bigserial', { mode: 'number' }),
        colInteger: integer('col_integer'),
        colNumeric: numeric('col_numeric', { precision: 10, scale: 2 }),
        colReal: real('col_real'),
        colSerial: serial('col_serial'),

        // Character types
        colText: text('col_text'),
        colVarchar: varchar('col_varchar', { length: 255 }),

        // Boolean
        colBoolean: boolean('col_boolean'),

        // Date/time types
        colDate: date('col_date'),
        colTime: time('col_time'),
        colTimestamp: timestamp('col_timestamp'),
        colTimestampTz: timestamp('col_timestamptz', { withTimezone: true }),
        colInterval: interval('col_interval'),

        // UUID
        colUuid: uuid('col_uuid'),

        // JSON
        colJson: json('col_json'),
        colJsonb: jsonb('col_jsonb'),

        // Arrays
        colTextArray: text('col_text_array').array(),
        colIntArray: integer('col_int_array').array(),
    })

    const drizzleSchema = fetchSchemaDrizzleORM({ testTable })
    const table = drizzleSchema.tables![0]

    assert.ok(table.columns.find((c) => c.name === 'col_bigint'))
    assert.ok(table.columns.find((c) => c.name === 'col_integer'))
    assert.ok(table.columns.find((c) => c.name === 'col_numeric'))
    assert.ok(table.columns.find((c) => c.name === 'col_text'))
    assert.ok(table.columns.find((c) => c.name === 'col_varchar'))
    assert.ok(table.columns.find((c) => c.name === 'col_boolean'))
    assert.ok(table.columns.find((c) => c.name === 'col_date'))
    assert.ok(table.columns.find((c) => c.name === 'col_timestamp'))
    assert.ok(table.columns.find((c) => c.name === 'col_uuid'))
    assert.ok(table.columns.find((c) => c.name === 'col_json'))
    assert.ok(table.columns.find((c) => c.name === 'col_jsonb'))

    const textArrayCol = table.columns.find((c) => c.name === 'col_text_array')!
    assert.equal(textArrayCol.data_type, 'text[]')

    const intArrayCol = table.columns.find((c) => c.name === 'col_int_array')!
    assert.equal(intArrayCol.data_type, 'integer[]')
})

test('drizzle: complex default values', async () => {
    const testTable = pgTable('defaults_test', {
        id: serial('id').primaryKey(),
        simpleText: text('simple_text').default('hello'),
        simpleNumber: integer('simple_number').default(42),
        simpleBool: boolean('simple_bool').default(true),
        sqlDefault: timestamp('sql_default').default(sql`NOW()`),
        sqlExpression: integer('sql_expression').default(sql`1 + 1`),
        arrayDefault: text('array_default')
            .array()
            .default(sql`'{}'::text[]`),
        jsonDefault: jsonb('json_default').default({}),
        uuidDefault: uuid('uuid_default').default(sql`gen_random_uuid()`),
    })

    const drizzleSchema = fetchSchemaDrizzleORM({ testTable })
    const table = drizzleSchema.tables![0]

    const simpleTextCol = table.columns.find((c) => c.name === 'simple_text')!
    assert.equal(simpleTextCol.default, "'hello'")

    const simpleNumberCol = table.columns.find((c) => c.name === 'simple_number')!
    assert.equal(simpleNumberCol.default, '42')

    const simpleBoolCol = table.columns.find((c) => c.name === 'simple_bool')!
    assert.equal(simpleBoolCol.default, 'TRUE')

    const sqlDefaultCol = table.columns.find((c) => c.name === 'sql_default')!
    assert.ok(sqlDefaultCol.default?.includes('NOW'))

    const sqlExpressionCol = table.columns.find(
        (c) => c.name === 'sql_expression',
    )!
    assert.ok(sqlExpressionCol.default)

    const arrayDefaultCol = table.columns.find((c) => c.name === 'array_default')!
    assert.ok(arrayDefaultCol.default)

    const jsonDefaultCol = table.columns.find((c) => c.name === 'json_default')!
    assert.ok(jsonDefaultCol.default)

    const uuidDefaultCol = table.columns.find((c) => c.name === 'uuid_default')!
    assert.ok(uuidDefaultCol.default?.includes('gen_random_uuid'))
})

test('drizzle: multiple foreign keys to same table', async () => {
    const users = pgTable('users', {
        id: serial('id').primaryKey(),
        email: text('email').notNull(),
    })

    const posts = pgTable(
        'posts',
        {
            id: serial('id').primaryKey(),
            authorId: integer('author_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
            reviewerId: integer('reviewer_id').references(() => users.id, {
                onDelete: 'set null',
            }),
            editorId: integer('editor_id').references(() => users.id, {
                onDelete: 'set null',
            }),
            title: text('title').notNull(),
        },
        (t) => [
            index('idx_posts_author_id').on(t.authorId),
            index('idx_posts_reviewer_id').on(t.reviewerId),
        ],
    )

    const drizzleSchema = fetchSchemaDrizzleORM({ users, posts })
    const postsTable = drizzleSchema.tables?.find((t) => t.name === 'posts')!

    // Should have 3 foreign keys, all to users table
    assert.equal(postsTable.foreign_keys?.length, 3)

    const allToUsers = postsTable.foreign_keys?.every(
        (fk) => fk.foreign_table === 'users',
    )
    assert.ok(allToUsers)

    const authorFk = postsTable.foreign_keys?.find(
        (fk) => fk.columns[0] === 'author_id',
    )!
    assert.equal(authorFk.on_delete, 'CASCADE')

    const reviewerFk = postsTable.foreign_keys?.find(
        (fk) => fk.columns[0] === 'reviewer_id',
    )!
    assert.equal(reviewerFk.on_delete, 'SET NULL')
})

test('drizzle: composite foreign key', async () => {
    const parent = pgTable(
        'parent',
        {
            id1: integer('id1').notNull(),
            id2: integer('id2').notNull(),
            name: text('name'),
        },
        (t) => [primaryKey({ columns: [t.id1, t.id2] })],
    )

    const child = pgTable(
        'child',
        {
            id: serial('id').primaryKey(),
            parentId1: integer('parent_id1').notNull(),
            parentId2: integer('parent_id2').notNull(),
            data: text('data'),
        },
        (t) => [
            foreignKey({
                columns: [t.parentId1, t.parentId2],
                foreignColumns: [parent.id1, parent.id2],
                name: 'child_parent_fk',
            }).onDelete('cascade'),
        ],
    )

    const drizzleSchema = fetchSchemaDrizzleORM({ parent, child })

    const parentTable = drizzleSchema.tables?.find((t) => t.name === 'parent')!
    const pk = parentTable.constraints?.find((c) => c.type === 'PRIMARY KEY')!
    assert.deepEqual(pk.columns, ['id1', 'id2'])

    const childTable = drizzleSchema.tables?.find((t) => t.name === 'child')!
    const fk = childTable.foreign_keys?.find((fk) => fk.name === 'child_parent_fk')!
    assert.deepEqual(fk.columns, ['parent_id1', 'parent_id2'])
    assert.deepEqual(fk.foreign_columns, ['id1', 'id2'])
    assert.equal(fk.on_delete, 'CASCADE')
})

test('drizzle: check constraints with SQL expressions', async () => {
    const products = pgTable(
        'products',
        {
            id: serial('id').primaryKey(),
            price: numeric('price', { precision: 10, scale: 2 }).notNull(),
            discount: numeric('discount', { precision: 10, scale: 2 }),
            quantity: integer('quantity').notNull(),
            minQuantity: integer('min_quantity').notNull(),
            maxQuantity: integer('max_quantity').notNull(),
            status: text('status').notNull(),
        },
        (t) => [
            check('price_positive', sql`${t.price} > 0`),
            check(
                'discount_valid',
                sql`${t.discount} IS NULL OR (${t.discount} >= 0 AND ${t.discount} <= ${t.price})`,
            ),
            check(
                'quantity_range',
                sql`${t.quantity} >= ${t.minQuantity} AND ${t.quantity} <= ${t.maxQuantity}`,
            ),
            check(
                'status_valid',
                sql`${t.status} IN ('draft', 'active', 'archived')`,
            ),
        ],
    )

    const drizzleSchema = fetchSchemaDrizzleORM({ products })
    const table = drizzleSchema.tables![0]

    const checks = table.constraints?.filter((c) => c.type === 'CHECK')
    assert.ok(checks && checks.length >= 4)

    const priceCheck = checks.find((c) => c.name === 'price_positive')
    assert.ok(priceCheck)
    assert.ok(priceCheck.check_predicate?.includes('price'))

    const discountCheck = checks.find((c) => c.name === 'discount_valid')
    assert.ok(discountCheck)
    assert.ok(discountCheck.check_predicate?.includes('discount'))

    const quantityCheck = checks.find((c) => c.name === 'quantity_range')
    assert.ok(quantityCheck)
    assert.ok(quantityCheck.check_predicate?.includes('quantity'))
})

test('drizzle: push Drizzle-generated schema to database and verify round-trip', async () => {
    const statusEnum = pgEnum('status', ['active', 'inactive', 'pending'])

    const users = pgTable(
        'users',
        {
            id: serial('id').primaryKey(),
            email: text('email').notNull(),
            status: statusEnum('status').notNull().default('pending'),
            metadata: jsonb('metadata').default({}),
            createdAt: timestamp('created_at', { withTimezone: true })
                .notNull()
                .default(sql`NOW()`),
        },
        (t) => [
            unique('users_email_unique').on(t.email),
            check('users_email_format', sql`${t.email} LIKE '%@%'`),
            index('idx_users_status').on(t.status),
        ],
    )

    const posts = pgTable(
        'posts',
        {
            id: serial('id').primaryKey(),
            userId: integer('user_id')
                .notNull()
                .references(() => users.id, { onDelete: 'cascade' }),
            title: text('title').notNull(),
            content: text('content'),
            tags: text('tags').array().default(sql`'{}'::text[]`),
            viewCount: integer('view_count').notNull().default(0),
            publishedAt: timestamp('published_at', { withTimezone: true }),
        },
        (t) => [
            check('posts_title_length', sql`LENGTH(${t.title}) >= 3`),
            check('posts_view_count', sql`${t.viewCount} >= 0`),
            index('idx_posts_user_id').on(t.userId),
            index('idx_posts_published_at').on(t.publishedAt.desc()),
        ],
    )

    // Get schema from Drizzle
    const drizzleSchema = fetchSchemaDrizzleORM({ statusEnum, users, posts })

    // Push to database
    const db = await createLocalDatabase({})
    const client = db.$client

    const statements = generatePushNewSchema(drizzleSchema)
    for (const s of statements) {
        const parts = s
            .split(/;\s*\n|;\s*$/g)
            .map((p) => p.trim())
            .filter(Boolean)
        for (const p of parts) {
            await client.query(p)
        }
    }

    // Fetch back from database
    const fetched = await fetchSchemaPgLite(client)

    // Verify everything round-tripped correctly
    assert.equal(fetched.enums.length, 1)
    assert.equal(fetched.enums[0].name, 'status')

    assert.equal(fetched.tables.length, 2)

    const usersTable = fetched.tables.find((t) => t.name === 'users')!
    assert.ok(usersTable)
    assert.ok(usersTable.columns.find((c) => c.name === 'email'))
    assert.ok(usersTable.columns.find((c) => c.name === 'status'))
    assert.ok(usersTable.columns.find((c) => c.name === 'metadata'))
    assert.ok(usersTable.constraints?.find((c) => c.name === 'users_email_unique'))
    assert.ok(usersTable.indexes?.find((i) => i.name === 'idx_users_status'))

    const postsTable = fetched.tables.find((t) => t.name === 'posts')!
    assert.ok(postsTable)
    assert.equal(postsTable.foreign_keys.length, 1)
    assert.equal(postsTable.foreign_keys[0].foreign_table, 'users')
    assert.equal(postsTable.foreign_keys[0].on_delete, 'CASCADE')

    const tagsCol = postsTable.columns.find((c) => c.name === 'tags')!
    assert.equal(tagsCol.data_type, 'ARRAY')

    // Test that the constraints actually work
    await assert.rejects(
        async () => {
            await client.query("INSERT INTO users (email) VALUES ('invalid')")
        },
        {
            message: /users_email_format|CHECK/,
        },
    )

    // Test FK cascade
    // Note: Use RETURNING to get the actual inserted ID, since the failed INSERT above
    // increments the sequence counter
    const insertResult = await client.query<{ id: number }>(
        "INSERT INTO users (email) VALUES ('test@example.com') RETURNING id",
    )
    const userId = insertResult.rows[0].id
    await client.query(
        `INSERT INTO posts (user_id, title) VALUES (${userId}, 'Test Post')`,
    )
    await client.query(`DELETE FROM users WHERE id = ${userId}`)

    const postCount = await client.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM posts',
    )
    assert.equal(Number(postCount.rows[0].count), 0)
})
