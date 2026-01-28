/**
 * Comprehensive tests for fetching complex schemas from databases
 * Tests the full 426-line SQL query with realistic, large schemas
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDatabase } from '../db'
import { generatePushNewSchema } from '../schema/push/new'
import { fetchSchemaPgLite } from '../schema/remote/fetch'
import { ecommerceSchema, saasSchema } from './fixtures/complex-schemas'

/**
 * Helper to apply SQL statements (split multi-statement strings)
 */
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
            await client.query(p).catch((e) => {
                console.error('Error applying statement:', p)
                throw e
            })
        }
    }
}

test('fetch large e-commerce schema with all features', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    // Push the complex e-commerce schema
    const statements = generatePushNewSchema(ecommerceSchema)
    await applyStatements(client, statements)

    // Fetch it back
    const fetched = await fetchSchemaPgLite(client)

    // Verify enums
    assert.equal(fetched.enums.length, 4, 'Should have 4 enums')
    const orderStatusEnum = fetched.enums.find((e) => e.name === 'order_status')
    assert.ok(orderStatusEnum, 'order_status enum should exist')
    assert.equal(orderStatusEnum.values.length, 6)
    assert.deepEqual(orderStatusEnum.values, [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
    ])
    assert.equal(
        orderStatusEnum.description,
        'Status of an order throughout its lifecycle',
    )

    // Verify tables
    assert.equal(fetched.tables.length, 6, 'Should have 6 tables')
    const tableNames = fetched.tables.map((t) => t.name).sort()
    assert.deepEqual(tableNames, [
        'categories',
        'order_items',
        'orders',
        'products',
        'reviews',
        'users',
    ])

    // Verify users table complexity
    const users = fetched.tables.find((t) => t.name === 'users')!
    assert.ok(users)
    assert.equal(users.description, 'User accounts including customers, vendors, and admins')
    assert.equal(users.columns.length, 14)

    // Check specific columns
    const emailCol = users.columns.find((c) => c.name === 'email')!
    assert.equal(emailCol.data_type, 'text')
    assert.equal(emailCol.is_nullable, false)
    assert.equal(emailCol.description, 'User email address (unique)')

    const roleCol = users.columns.find((c) => c.name === 'role')!
    assert.equal(roleCol.data_type, 'USER-DEFINED')
    assert.equal(roleCol.udt_name, 'user_role')
    assert.ok(roleCol.default?.includes('customer'))

    const metadataCol = users.columns.find((c) => c.name === 'metadata')!
    assert.equal(metadataCol.data_type, 'jsonb')

    // Check constraints
    assert.ok(users.constraints.length >= 3)
    const emailUnique = users.constraints.find(
        (c) => c.name === 'users_email_unique',
    )!
    assert.equal(emailUnique.type, 'UNIQUE')

    const emailCheck = users.constraints.find(
        (c) => c.name === 'users_email_check',
    )!
    assert.equal(emailCheck.type, 'CHECK')
    assert.ok(emailCheck.check_predicate)

    // Check indexes
    assert.ok(users.indexes.length >= 3)
    const metadataGin = users.indexes.find(
        (i) => i.name === 'idx_users_metadata_gin',
    )!
    assert.equal(metadataGin.index_type, 'gin')

    // Verify categories table (self-referential FK)
    const categories = fetched.tables.find((t) => t.name === 'categories')!
    assert.ok(categories)
    assert.equal(
        categories.description,
        'Product categories with hierarchical structure',
    )

    const categoryFk = categories.foreign_keys.find(
        (fk) => fk.name === 'categories_parent_fk',
    )!
    assert.ok(categoryFk, 'Self-referential FK should exist')
    assert.equal(categoryFk.foreign_table, 'categories')
    assert.deepEqual(categoryFk.columns, ['parent_id'])
    assert.deepEqual(categoryFk.foreign_columns, ['id'])
    assert.equal(categoryFk.on_delete, 'CASCADE')
    assert.equal(
        categoryFk.description,
        'Self-referential relationship for category hierarchy',
    )

    const uniqueNamePerParent = categories.constraints.find(
        (c) => c.name === 'categories_unique_name_per_parent',
    )!
    assert.equal(uniqueNamePerParent.type, 'UNIQUE')
    assert.equal(uniqueNamePerParent.nulls_not_distinct, true)

    // Verify products table (most complex)
    const products = fetched.tables.find((t) => t.name === 'products')!
    assert.ok(products)
    assert.equal(products.columns.length, 18)

    const priceCol = products.columns.find((c) => c.name === 'price')!
    assert.equal(priceCol.data_type, 'numeric')
    assert.equal(priceCol.numeric_precision, 10)
    assert.equal(priceCol.numeric_scale, 2)

    const imagesCol = products.columns.find((c) => c.name === 'images')!
    assert.equal(imagesCol.data_type, 'ARRAY')

    const tagsCol = products.columns.find((c) => c.name === 'tags')!
    assert.equal(tagsCol.data_type, 'ARRAY')

    const visibilityCol = products.columns.find((c) => c.name === 'visibility')!
    assert.equal(visibilityCol.data_type, 'USER-DEFINED')
    assert.equal(visibilityCol.udt_name, 'product_visibility')

    // Check partial index
    const partialIdx = products.indexes.find(
        (i) => i.name === 'idx_products_featured_published',
    )!
    assert.ok(partialIdx)
    assert.ok(partialIdx.predicate)
    assert.ok(
        partialIdx.predicate.includes('visibility') &&
            partialIdx.predicate.includes('public'),
    )
    assert.equal(
        partialIdx.description,
        'Partial index for featured, published products',
    )

    // Verify composite primary key (order_items)
    const orderItems = fetched.tables.find((t) => t.name === 'order_items')!
    assert.ok(orderItems)
    const compositePk = orderItems.constraints.find(
        (c) => c.type === 'PRIMARY KEY',
    )!
    assert.deepEqual(compositePk.columns, ['order_id', 'product_id'])

    // Verify multiple FKs on same table
    assert.equal(orderItems.foreign_keys.length, 2)
    const orderFk = orderItems.foreign_keys.find(
        (fk) => fk.name === 'order_items_order_fk',
    )!
    assert.equal(orderFk.on_delete, 'CASCADE')
    const productFk = orderItems.foreign_keys.find(
        (fk) => fk.name === 'order_items_product_fk',
    )!
    assert.equal(productFk.on_delete, 'RESTRICT')

    // Verify reviews table (composite unique constraint)
    const reviews = fetched.tables.find((t) => t.name === 'reviews')!
    assert.ok(reviews)
    const onePerCustomer = reviews.constraints.find(
        (c) => c.name === 'reviews_one_per_customer_product',
    )!
    assert.equal(onePerCustomer.type, 'UNIQUE')
    assert.deepEqual(onePerCustomer.columns, ['product_id', 'customer_id'])

    const ratingCheck = reviews.constraints.find(
        (c) => c.name === 'reviews_rating_check',
    )!
    assert.equal(ratingCheck.type, 'CHECK')
    assert.ok(
        ratingCheck.check_predicate?.includes('rating >= 1') &&
            ratingCheck.check_predicate?.includes('rating <= 5'),
    )

    // Verify views
    assert.equal(fetched.views.length, 2)
    const activeProducts = fetched.views.find(
        (v) => v.name === 'active_products',
    )!
    assert.ok(activeProducts)
    assert.equal(
        activeProducts.description,
        'View of all publicly visible and published products',
    )

    const orderSummary = fetched.views.find((v) => v.name === 'order_summary')!
    assert.ok(orderSummary)
    assert.ok(orderSummary.definition.includes('GROUP BY'))
})

test('fetch SaaS multi-tenant schema with advanced features', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    // Push the complex SaaS schema
    const statements = generatePushNewSchema(saasSchema)
    await applyStatements(client, statements)

    // Fetch it back
    const fetched = await fetchSchemaPgLite(client)

    // Verify enums
    assert.equal(fetched.enums.length, 4)
    const memberRole = fetched.enums.find((e) => e.name === 'member_role')!
    assert.ok(memberRole)
    assert.deepEqual(memberRole.values, ['owner', 'admin', 'member', 'viewer'])

    // Verify tables
    assert.equal(fetched.tables.length, 5)

    // Verify UUID columns
    const tenants = fetched.tables.find((t) => t.name === 'tenants')!
    assert.ok(tenants)
    const tenantId = tenants.columns.find((c) => c.name === 'id')!
    assert.equal(tenantId.data_type, 'uuid')
    assert.ok(tenantId.default?.includes('gen_random_uuid'))

    // Verify soft delete pattern
    const deletedAt = tenants.columns.find((c) => c.name === 'deleted_at')!
    assert.equal(deletedAt.data_type, 'timestamp with time zone')
    assert.equal(deletedAt.is_nullable, true)

    // Verify partial unique index (for soft deletes)
    const slugIdx = tenants.indexes.find((i) => i.name === 'idx_tenants_slug')!
    assert.ok(slugIdx)
    assert.equal(slugIdx.is_unique, true)
    assert.equal(slugIdx.predicate, 'deleted_at IS NULL')

    // Verify composite PK in junction table
    const tenantMembers = fetched.tables.find(
        (t) => t.name === 'tenant_members',
    )!
    assert.ok(tenantMembers)
    const membersPk = tenantMembers.constraints.find(
        (c) => c.type === 'PRIMARY KEY',
    )!
    assert.deepEqual(membersPk.columns, ['tenant_id', 'user_id'])

    // Verify multiple FKs including self-referential (invited_by)
    assert.equal(tenantMembers.foreign_keys.length, 3)
    const invitedByFk = tenantMembers.foreign_keys.find(
        (fk) => fk.name === 'tenant_members_invited_by_fk',
    )!
    assert.ok(invitedByFk)
    assert.equal(invitedByFk.foreign_table, 'users')
    assert.equal(invitedByFk.on_delete, 'SET NULL')

    // Verify full-text search (tsvector)
    const projects = fetched.tables.find((t) => t.name === 'projects')!
    assert.ok(projects)
    const searchVector = projects.columns.find(
        (c) => c.name === 'search_vector',
    )!
    assert.equal(searchVector.data_type, 'tsvector')
    assert.equal(searchVector.description, 'Full-text search vector')

    const searchIdx = projects.indexes.find(
        (i) => i.name === 'idx_projects_search_vector',
    )!
    assert.equal(searchIdx.index_type, 'gin')

    // Verify composite unique with nulls_not_distinct
    const uniqueNamePerTenant = projects.constraints.find(
        (c) => c.name === 'projects_unique_name_per_tenant',
    )!
    assert.equal(uniqueNamePerTenant.type, 'UNIQUE')
    assert.equal(uniqueNamePerTenant.nulls_not_distinct, true)

    // Verify complex partial index
    const activeIdx = projects.indexes.find(
        (i) => i.name === 'idx_projects_active',
    )!
    assert.ok(activeIdx)
    assert.ok(
        activeIdx.predicate?.includes('deleted_at IS NULL') &&
            activeIdx.predicate?.includes("status = 'active'"),
    )

    // Verify audit_logs (time-series optimization)
    const auditLogs = fetched.tables.find((t) => t.name === 'audit_logs')!
    assert.ok(auditLogs)

    // BIGINT with ALWAYS identity
    const auditId = auditLogs.columns.find((c) => c.name === 'id')!
    assert.equal(auditId.data_type, 'bigint')
    assert.equal(auditId.is_identity, true)
    assert.equal(auditId.identity_generation, 'ALWAYS')

    // INET type
    const ipAddress = auditLogs.columns.find((c) => c.name === 'ip_address')!
    assert.equal(ipAddress.data_type, 'inet')

    // BRIN index (time-series)
    const brinIdx = auditLogs.indexes.find(
        (i) => i.name === 'idx_audit_logs_created_at',
    )!
    assert.equal(brinIdx.index_type, 'brin')
    assert.equal(brinIdx.description, 'BRIN index for time-series data')

    // Composite index on resource
    const resourceIdx = auditLogs.indexes.find(
        (i) => i.name === 'idx_audit_logs_resource',
    )!
    assert.equal(resourceIdx.columns.length, 2)
    assert.equal(resourceIdx.columns[0].name, 'resource_type')
    assert.equal(resourceIdx.columns[1].name, 'resource_id')

    // GIN index on JSONB
    const changesIdx = auditLogs.indexes.find(
        (i) => i.name === 'idx_audit_logs_changes',
    )!
    assert.equal(changesIdx.index_type, 'gin')

    // Verify SET NULL referential actions
    const tenantFk = auditLogs.foreign_keys.find(
        (fk) => fk.name === 'audit_logs_tenant_fk',
    )!
    assert.equal(tenantFk.on_delete, 'SET NULL')

    // Verify views
    assert.equal(fetched.views.length, 2)
    const activeMembers = fetched.views.find(
        (v) => v.name === 'active_tenant_members',
    )!
    assert.ok(activeMembers)
    assert.ok(activeMembers.definition.includes('WHERE'))

    const tenantStats = fetched.views.find(
        (v) => v.name === 'tenant_statistics',
    )!
    assert.ok(tenantStats)
    assert.ok(tenantStats.definition.includes('GROUP BY'))
})

test('fetch schema with all PostgreSQL data types', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    await client.query(`
        CREATE TABLE all_types (
            -- Numeric types
            col_smallint SMALLINT,
            col_integer INTEGER,
            col_bigint BIGINT,
            col_decimal DECIMAL(10, 2),
            col_numeric NUMERIC(8, 4),
            col_real REAL,
            col_double DOUBLE PRECISION,
            col_smallserial SMALLSERIAL,
            col_serial SERIAL,
            col_bigserial BIGSERIAL,

            -- Character types
            col_char CHAR(10),
            col_varchar VARCHAR(255),
            col_text TEXT,

            -- Binary types
            col_bytea BYTEA,

            -- Date/time types
            col_date DATE,
            col_time TIME,
            col_timetz TIME WITH TIME ZONE,
            col_timestamp TIMESTAMP,
            col_timestamptz TIMESTAMP WITH TIME ZONE,
            col_interval INTERVAL,

            -- Boolean
            col_boolean BOOLEAN,

            -- Network types
            col_inet INET,
            col_cidr CIDR,
            col_macaddr MACADDR,

            -- UUID
            col_uuid UUID,

            -- JSON
            col_json JSON,
            col_jsonb JSONB,

            -- Array
            col_int_array INTEGER[],
            col_text_array TEXT[],

            -- Range types
            col_int4range INT4RANGE,
            col_int8range INT8RANGE,
            col_numrange NUMRANGE,
            col_tsrange TSRANGE,
            col_tstzrange TSTZRANGE,
            col_daterange DATERANGE
        )
    `)

    const schema = await fetchSchemaPgLite(client)
    const table = schema.tables[0]

    assert.ok(table)
    assert.ok(table.columns.length > 35)

    // Verify numeric types
    assert.equal(
        table.columns.find((c) => c.name === 'col_smallint')?.data_type,
        'smallint',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_integer')?.data_type,
        'integer',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_bigint')?.data_type,
        'bigint',
    )

    const decimalCol = table.columns.find((c) => c.name === 'col_decimal')!
    assert.equal(decimalCol.data_type, 'numeric')
    assert.equal(decimalCol.numeric_precision, 10)
    assert.equal(decimalCol.numeric_scale, 2)

    // Verify character types
    const charCol = table.columns.find((c) => c.name === 'col_char')!
    assert.equal(charCol.data_type, 'character')
    assert.equal(charCol.max_length, 10)

    const varcharCol = table.columns.find((c) => c.name === 'col_varchar')!
    assert.equal(varcharCol.data_type, 'character varying')
    assert.equal(varcharCol.max_length, 255)

    // Verify binary
    assert.equal(
        table.columns.find((c) => c.name === 'col_bytea')?.data_type,
        'bytea',
    )

    // Verify date/time types
    assert.equal(
        table.columns.find((c) => c.name === 'col_date')?.data_type,
        'date',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_time')?.data_type,
        'time without time zone',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_timetz')?.data_type,
        'time with time zone',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_timestamp')?.data_type,
        'timestamp without time zone',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_timestamptz')?.data_type,
        'timestamp with time zone',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_interval')?.data_type,
        'interval',
    )

    // Verify network types
    assert.equal(
        table.columns.find((c) => c.name === 'col_inet')?.data_type,
        'inet',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_cidr')?.data_type,
        'cidr',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_macaddr')?.data_type,
        'macaddr',
    )

    // Verify UUID
    assert.equal(
        table.columns.find((c) => c.name === 'col_uuid')?.data_type,
        'uuid',
    )

    // Verify JSON
    assert.equal(
        table.columns.find((c) => c.name === 'col_json')?.data_type,
        'json',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_jsonb')?.data_type,
        'jsonb',
    )

    // Verify arrays
    assert.equal(
        table.columns.find((c) => c.name === 'col_int_array')?.data_type,
        'ARRAY',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_text_array')?.data_type,
        'ARRAY',
    )

    // Verify range types
    assert.equal(
        table.columns.find((c) => c.name === 'col_int4range')?.data_type,
        'int4range',
    )
    assert.equal(
        table.columns.find((c) => c.name === 'col_daterange')?.data_type,
        'daterange',
    )
})

test('fetch schema with multiple constraints per table', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    await client.query(`
        CREATE TABLE complex_constraints (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            age INTEGER CHECK (age >= 18),
            price NUMERIC CHECK (price > 0),
            discount NUMERIC,
            status TEXT CHECK (status IN ('active', 'inactive', 'pending')),
            CONSTRAINT discount_check CHECK (discount >= 0 AND discount <= price),
            CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]+$'),
            UNIQUE (email, username)
        )
    `)

    const schema = await fetchSchemaPgLite(client)
    const table = schema.tables[0]

    assert.ok(table)

    // Should have 1 PK + 3 UNIQUE + 5 CHECK constraints
    const pkConstraints = table.constraints.filter(
        (c) => c.type === 'PRIMARY KEY',
    )
    const uniqueConstraints = table.constraints.filter(
        (c) => c.type === 'UNIQUE',
    )
    const checkConstraints = table.constraints.filter((c) => c.type === 'CHECK')

    assert.equal(pkConstraints.length, 1)
    assert.ok(uniqueConstraints.length >= 3)
    assert.ok(checkConstraints.length >= 5)

    // Verify composite unique
    const compositeUnique = uniqueConstraints.find((c) =>
        c.definition.includes('email, username'),
    )
    assert.ok(compositeUnique, 'Composite unique constraint should exist')

    // Verify specific check constraints
    const ageCheck = checkConstraints.find((c) =>
        c.check_predicate?.includes('age'),
    )
    assert.ok(ageCheck)

    const discountCheck = checkConstraints.find((c) =>
        c.name === 'discount_check',
    )
    assert.ok(discountCheck)
    assert.ok(
        discountCheck.check_predicate?.includes('discount') &&
            discountCheck.check_predicate?.includes('price'),
    )
})

test('fetch schema with complex index combinations', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    await client.query(`
        CREATE TABLE products_indexed (
            id INTEGER PRIMARY KEY,
            name TEXT,
            category TEXT,
            price NUMERIC,
            tags TEXT[],
            metadata JSONB,
            created_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ
        )
    `)

    // Create various index types
    await client.query(
        'CREATE INDEX idx_name ON products_indexed (name)',
    )
    await client.query(
        'CREATE INDEX idx_name_lower ON products_indexed (LOWER(name))',
    )
    await client.query(
        'CREATE INDEX idx_category_price ON products_indexed (category, price DESC)',
    )
    await client.query(
        'CREATE INDEX idx_active ON products_indexed (created_at DESC) WHERE deleted_at IS NULL',
    )
    await client.query(
        'CREATE INDEX idx_tags_gin ON products_indexed USING GIN (tags)',
    )
    await client.query(
        'CREATE INDEX idx_metadata_gin ON products_indexed USING GIN (metadata)',
    )
    await client.query(
        'CREATE UNIQUE INDEX idx_name_unique ON products_indexed (name) WHERE deleted_at IS NULL',
    )

    const schema = await fetchSchemaPgLite(client)
    const table = schema.tables[0]

    assert.ok(table)
    // Plus the PK index
    assert.ok(table.indexes.length >= 7)

    // Expression index
    const lowerIdx = table.indexes.find((i) => i.name === 'idx_name_lower')!
    assert.ok(lowerIdx)
    assert.ok(lowerIdx.definition.includes('lower(name)'))
    assert.equal(lowerIdx.columns.length, 0) // Expression indexes have no columns

    // Composite with sort order
    const compositeIdx = table.indexes.find(
        (i) => i.name === 'idx_category_price',
    )!
    assert.ok(compositeIdx)
    assert.equal(compositeIdx.columns.length, 2)
    assert.equal(compositeIdx.columns[1].sort_order, 'DESC')

    // Partial index
    const partialIdx = table.indexes.find((i) => i.name === 'idx_active')!
    assert.ok(partialIdx)
    assert.ok(partialIdx.predicate)
    assert.ok(partialIdx.predicate.includes('deleted_at IS NULL'))

    // GIN indexes
    const tagsGin = table.indexes.find((i) => i.name === 'idx_tags_gin')!
    assert.equal(tagsGin.index_type, 'gin')

    const metadataGin = table.indexes.find(
        (i) => i.name === 'idx_metadata_gin',
    )!
    assert.equal(metadataGin.index_type, 'gin')

    // Unique partial index
    const uniquePartial = table.indexes.find(
        (i) => i.name === 'idx_name_unique',
    )!
    assert.equal(uniquePartial.is_unique, true)
    assert.ok(uniquePartial.predicate)
})

test('fetch schema with all referential actions', async () => {
    const db = await createLocalDatabase({})
    const client = db.$client

    await client.query('CREATE TABLE parent (id INTEGER PRIMARY KEY)')

    // Create child tables with different referential actions
    await client.query(`
        CREATE TABLE child_cascade (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE ON UPDATE CASCADE
        )
    `)

    await client.query(`
        CREATE TABLE child_restrict (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER REFERENCES parent(id) ON DELETE RESTRICT ON UPDATE RESTRICT
        )
    `)

    await client.query(`
        CREATE TABLE child_set_null (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER REFERENCES parent(id) ON DELETE SET NULL ON UPDATE SET NULL
        )
    `)

    await client.query(`
        CREATE TABLE child_set_default (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER DEFAULT 1 REFERENCES parent(id) ON DELETE SET DEFAULT ON UPDATE SET DEFAULT
        )
    `)

    await client.query(`
        CREATE TABLE child_no_action (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER REFERENCES parent(id) ON DELETE NO ACTION ON UPDATE NO ACTION
        )
    `)

    const schema = await fetchSchemaPgLite(client)

    const childCascade = schema.tables.find((t) => t.name === 'child_cascade')!
    assert.equal(childCascade.foreign_keys[0].on_delete, 'CASCADE')
    assert.equal(childCascade.foreign_keys[0].on_update, 'CASCADE')

    const childRestrict = schema.tables.find(
        (t) => t.name === 'child_restrict',
    )!
    assert.equal(childRestrict.foreign_keys[0].on_delete, 'RESTRICT')
    assert.equal(childRestrict.foreign_keys[0].on_update, 'RESTRICT')

    const childSetNull = schema.tables.find((t) => t.name === 'child_set_null')!
    assert.equal(childSetNull.foreign_keys[0].on_delete, 'SET NULL')
    assert.equal(childSetNull.foreign_keys[0].on_update, 'SET NULL')

    const childSetDefault = schema.tables.find(
        (t) => t.name === 'child_set_default',
    )!
    assert.equal(childSetDefault.foreign_keys[0].on_delete, 'SET DEFAULT')
    assert.equal(childSetDefault.foreign_keys[0].on_update, 'SET DEFAULT')

    const childNoAction = schema.tables.find(
        (t) => t.name === 'child_no_action',
    )!
    assert.equal(childNoAction.foreign_keys[0].on_delete, 'NO ACTION')
    assert.equal(childNoAction.foreign_keys[0].on_update, 'NO ACTION')
})
