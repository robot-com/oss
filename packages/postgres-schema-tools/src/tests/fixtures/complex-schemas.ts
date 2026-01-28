/**
 * Complex test fixtures for schema testing
 * These represent realistic, large database schemas with many relationships
 */

import type { LocalSchema } from '../../schema/local/types'

/**
 * E-commerce platform schema with:
 * - Multiple enums
 * - Complex foreign key relationships
 * - Composite primary keys
 * - Multiple indexes per table
 * - Check constraints
 * - Self-referential relationships
 */
export const ecommerceSchema: LocalSchema = {
    enums: [
        {
            name: 'order_status',
            values: [
                'pending',
                'processing',
                'shipped',
                'delivered',
                'cancelled',
                'refunded',
            ],
            description: 'Status of an order throughout its lifecycle',
        },
        {
            name: 'payment_method',
            values: ['credit_card', 'debit_card', 'paypal', 'bank_transfer'],
            description: 'Available payment methods',
        },
        {
            name: 'user_role',
            values: ['customer', 'vendor', 'admin', 'support'],
        },
        {
            name: 'product_visibility',
            values: ['public', 'private', 'draft', 'archived'],
        },
    ],
    tables: [
        {
            name: 'users',
            description: 'User accounts including customers, vendors, and admins',
            columns: [
                {
                    name: 'id',
                    data_type: 'integer',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'BY DEFAULT',
                    description: 'Primary key',
                },
                {
                    name: 'email',
                    data_type: 'text',
                    is_nullable: false,
                    description: 'User email address (unique)',
                },
                {
                    name: 'username',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'password_hash',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'role',
                    data_type: 'USER-DEFINED',
                    udt_name: 'user_role',
                    is_nullable: false,
                    default: "'customer'",
                },
                {
                    name: 'first_name',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'last_name',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'phone',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'is_active',
                    data_type: 'boolean',
                    is_nullable: false,
                    default: 'TRUE',
                },
                {
                    name: 'email_verified',
                    data_type: 'boolean',
                    is_nullable: false,
                    default: 'FALSE',
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'updated_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'last_login_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'metadata',
                    data_type: 'jsonb',
                    is_nullable: true,
                    default: "'{}'",
                },
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
                    name: 'users_username_unique',
                    type: 'UNIQUE',
                    columns: ['username'],
                },
                {
                    name: 'users_email_check',
                    type: 'CHECK',
                    check_predicate: "email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
                },
            ],
            indexes: [
                {
                    name: 'idx_users_role',
                    is_unique: false,
                    columns: [{ name: 'role' }],
                },
                {
                    name: 'idx_users_created_at',
                    is_unique: false,
                    columns: [{ name: 'created_at', sort_order: 'DESC', nulls_order: 'NULLS LAST' }],
                },
                {
                    name: 'idx_users_metadata_gin',
                    is_unique: false,
                    index_type: 'gin',
                    columns: [{ name: 'metadata' }],
                },
            ],
            foreign_keys: [],
            triggers: [],
        },
        {
            name: 'categories',
            description: 'Product categories with hierarchical structure',
            columns: [
                {
                    name: 'id',
                    data_type: 'integer',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'BY DEFAULT',
                },
                {
                    name: 'parent_id',
                    data_type: 'integer',
                    is_nullable: true,
                    description: 'Self-referential foreign key to parent category',
                },
                {
                    name: 'name',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'slug',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'description',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'image_url',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'display_order',
                    data_type: 'integer',
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'is_active',
                    data_type: 'boolean',
                    is_nullable: false,
                    default: 'TRUE',
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
            ],
            constraints: [
                {
                    name: 'categories_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'categories_slug_unique',
                    type: 'UNIQUE',
                    columns: ['slug'],
                },
                {
                    name: 'categories_unique_name_per_parent',
                    type: 'UNIQUE',
                    columns: ['parent_id', 'name'],
                    nulls_not_distinct: true,
                },
            ],
            indexes: [
                {
                    name: 'idx_categories_parent_id',
                    is_unique: false,
                    columns: [{ name: 'parent_id' }],
                },
                {
                    name: 'idx_categories_display_order',
                    is_unique: false,
                    columns: [{ name: 'display_order' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'categories_parent_fk',
                    columns: ['parent_id'],
                    foreign_table: 'categories',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                    description: 'Self-referential relationship for category hierarchy',
                },
            ],
            triggers: [],
        },
        {
            name: 'products',
            description: 'Products available for purchase',
            columns: [
                {
                    name: 'id',
                    data_type: 'integer',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'BY DEFAULT',
                },
                {
                    name: 'vendor_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'category_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'sku',
                    data_type: 'text',
                    is_nullable: false,
                    description: 'Stock Keeping Unit',
                },
                {
                    name: 'name',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'description',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'price',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                },
                {
                    name: 'compare_at_price',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: true,
                },
                {
                    name: 'cost',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: true,
                },
                {
                    name: 'stock_quantity',
                    data_type: 'integer',
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'weight',
                    data_type: 'numeric',
                    numeric_precision: 8,
                    numeric_scale: 2,
                    is_nullable: true,
                    description: 'Weight in kilograms',
                },
                {
                    name: 'dimensions',
                    data_type: 'jsonb',
                    is_nullable: true,
                    description: 'Product dimensions (length, width, height)',
                },
                {
                    name: 'images',
                    data_type: 'text[]',
                    is_nullable: true,
                    default: "'{}'",
                },
                {
                    name: 'tags',
                    data_type: 'text[]',
                    is_nullable: true,
                    default: "'{}'",
                },
                {
                    name: 'visibility',
                    data_type: 'USER-DEFINED',
                    udt_name: 'product_visibility',
                    is_nullable: false,
                    default: "'draft'",
                },
                {
                    name: 'is_featured',
                    data_type: 'boolean',
                    is_nullable: false,
                    default: 'FALSE',
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'updated_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'published_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
            ],
            constraints: [
                {
                    name: 'products_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'products_sku_unique',
                    type: 'UNIQUE',
                    columns: ['sku'],
                },
                {
                    name: 'products_price_check',
                    type: 'CHECK',
                    check_predicate: 'price > 0',
                },
                {
                    name: 'products_compare_price_check',
                    type: 'CHECK',
                    check_predicate: 'compare_at_price IS NULL OR compare_at_price >= price',
                },
                {
                    name: 'products_stock_check',
                    type: 'CHECK',
                    check_predicate: 'stock_quantity >= 0',
                },
            ],
            indexes: [
                {
                    name: 'idx_products_vendor_id',
                    is_unique: false,
                    columns: [{ name: 'vendor_id' }],
                },
                {
                    name: 'idx_products_category_id',
                    is_unique: false,
                    columns: [{ name: 'category_id' }],
                },
                {
                    name: 'idx_products_visibility',
                    is_unique: false,
                    columns: [{ name: 'visibility' }],
                },
                {
                    name: 'idx_products_price',
                    is_unique: false,
                    columns: [{ name: 'price' }],
                },
                {
                    name: 'idx_products_featured_published',
                    is_unique: false,
                    columns: [
                        { name: 'is_featured' },
                        { name: 'published_at', sort_order: 'DESC', nulls_order: 'NULLS LAST' },
                    ],
                    predicate: "visibility = 'public' AND published_at IS NOT NULL",
                    description: 'Partial index for featured, published products',
                },
                {
                    name: 'idx_products_tags_gin',
                    is_unique: false,
                    index_type: 'gin',
                    columns: [{ name: 'tags' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'products_vendor_fk',
                    columns: ['vendor_id'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'products_category_fk',
                    columns: ['category_id'],
                    foreign_table: 'categories',
                    foreign_columns: ['id'],
                    on_delete: 'RESTRICT',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
        {
            name: 'orders',
            description: 'Customer orders',
            columns: [
                {
                    name: 'id',
                    data_type: 'integer',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'BY DEFAULT',
                },
                {
                    name: 'customer_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'order_number',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'status',
                    data_type: 'USER-DEFINED',
                    udt_name: 'order_status',
                    is_nullable: false,
                    default: "'pending'",
                },
                {
                    name: 'subtotal',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                },
                {
                    name: 'tax_amount',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'shipping_amount',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'discount_amount',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'total',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                },
                {
                    name: 'currency',
                    data_type: 'text',
                    is_nullable: false,
                    default: "'USD'",
                    max_length: 3,
                },
                {
                    name: 'payment_method',
                    data_type: 'USER-DEFINED',
                    udt_name: 'payment_method',
                    is_nullable: true,
                },
                {
                    name: 'shipping_address',
                    data_type: 'jsonb',
                    is_nullable: false,
                },
                {
                    name: 'billing_address',
                    data_type: 'jsonb',
                    is_nullable: false,
                },
                {
                    name: 'notes',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'updated_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'confirmed_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'shipped_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'delivered_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
            ],
            constraints: [
                {
                    name: 'orders_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'orders_order_number_unique',
                    type: 'UNIQUE',
                    columns: ['order_number'],
                },
                {
                    name: 'orders_total_check',
                    type: 'CHECK',
                    check_predicate: 'total >= 0',
                },
                {
                    name: 'orders_amounts_check',
                    type: 'CHECK',
                    check_predicate: 'subtotal >= 0 AND tax_amount >= 0 AND shipping_amount >= 0 AND discount_amount >= 0',
                },
            ],
            indexes: [
                {
                    name: 'idx_orders_customer_id',
                    is_unique: false,
                    columns: [{ name: 'customer_id' }],
                },
                {
                    name: 'idx_orders_status',
                    is_unique: false,
                    columns: [{ name: 'status' }],
                },
                {
                    name: 'idx_orders_created_at',
                    is_unique: false,
                    columns: [{ name: 'created_at', sort_order: 'DESC', nulls_order: 'NULLS LAST' }],
                },
                {
                    name: 'idx_orders_customer_status',
                    is_unique: false,
                    columns: [
                        { name: 'customer_id' },
                        { name: 'status' },
                    ],
                },
            ],
            foreign_keys: [
                {
                    name: 'orders_customer_fk',
                    columns: ['customer_id'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'RESTRICT',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
        {
            name: 'order_items',
            description: 'Individual items within an order',
            columns: [
                {
                    name: 'order_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'product_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'quantity',
                    data_type: 'integer',
                    is_nullable: false,
                    default: '1',
                },
                {
                    name: 'unit_price',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                },
                {
                    name: 'discount_amount',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'total',
                    data_type: 'numeric',
                    numeric_precision: 10,
                    numeric_scale: 2,
                    is_nullable: false,
                },
                {
                    name: 'product_snapshot',
                    data_type: 'jsonb',
                    is_nullable: false,
                    description: 'Snapshot of product details at time of order',
                },
            ],
            constraints: [
                {
                    name: 'order_items_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['order_id', 'product_id'],
                },
                {
                    name: 'order_items_quantity_check',
                    type: 'CHECK',
                    check_predicate: 'quantity > 0',
                },
                {
                    name: 'order_items_unit_price_check',
                    type: 'CHECK',
                    check_predicate: 'unit_price >= 0',
                },
            ],
            indexes: [
                {
                    name: 'idx_order_items_product_id',
                    is_unique: false,
                    columns: [{ name: 'product_id' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'order_items_order_fk',
                    columns: ['order_id'],
                    foreign_table: 'orders',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'order_items_product_fk',
                    columns: ['product_id'],
                    foreign_table: 'products',
                    foreign_columns: ['id'],
                    on_delete: 'RESTRICT',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
        {
            name: 'reviews',
            description: 'Product reviews by customers',
            columns: [
                {
                    name: 'id',
                    data_type: 'integer',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'BY DEFAULT',
                },
                {
                    name: 'product_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'customer_id',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'rating',
                    data_type: 'integer',
                    is_nullable: false,
                },
                {
                    name: 'title',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'content',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'is_verified_purchase',
                    data_type: 'boolean',
                    is_nullable: false,
                    default: 'FALSE',
                },
                {
                    name: 'helpful_count',
                    data_type: 'integer',
                    is_nullable: false,
                    default: '0',
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'updated_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
            ],
            constraints: [
                {
                    name: 'reviews_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'reviews_one_per_customer_product',
                    type: 'UNIQUE',
                    columns: ['product_id', 'customer_id'],
                },
                {
                    name: 'reviews_rating_check',
                    type: 'CHECK',
                    check_predicate: 'rating >= 1 AND rating <= 5',
                },
                {
                    name: 'reviews_helpful_check',
                    type: 'CHECK',
                    check_predicate: 'helpful_count >= 0',
                },
            ],
            indexes: [
                {
                    name: 'idx_reviews_product_id',
                    is_unique: false,
                    columns: [{ name: 'product_id' }],
                },
                {
                    name: 'idx_reviews_customer_id',
                    is_unique: false,
                    columns: [{ name: 'customer_id' }],
                },
                {
                    name: 'idx_reviews_rating',
                    is_unique: false,
                    columns: [{ name: 'rating' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'reviews_product_fk',
                    columns: ['product_id'],
                    foreign_table: 'products',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'reviews_customer_fk',
                    columns: ['customer_id'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
    ],
    views: [
        {
            name: 'active_products',
            definition: "SELECT p.* FROM products p WHERE p.visibility = 'public' AND p.published_at IS NOT NULL",
            description: 'View of all publicly visible and published products',
        },
        {
            name: 'order_summary',
            definition: `
                SELECT
                    o.id,
                    o.order_number,
                    o.customer_id,
                    u.email as customer_email,
                    o.status,
                    o.total,
                    o.created_at,
                    COUNT(oi.product_id) as item_count
                FROM orders o
                JOIN users u ON o.customer_id = u.id
                JOIN order_items oi ON o.id = oi.order_id
                GROUP BY o.id, u.email
            `,
            description: 'Summary view of orders with customer info and item counts',
        },
    ],
}

/**
 * SaaS application schema with:
 * - Multi-tenant structure
 * - Role-based access control
 * - Audit logging
 * - Soft deletes
 * - Full-text search
 */
export const saasSchema: LocalSchema = {
    enums: [
        {
            name: 'subscription_plan',
            values: ['free', 'starter', 'professional', 'enterprise'],
        },
        {
            name: 'subscription_status',
            values: ['trialing', 'active', 'past_due', 'cancelled', 'unpaid'],
        },
        {
            name: 'member_role',
            values: ['owner', 'admin', 'member', 'viewer'],
        },
        {
            name: 'audit_action',
            values: ['create', 'update', 'delete', 'login', 'logout', 'invite', 'remove'],
        },
    ],
    tables: [
        {
            name: 'tenants',
            description: 'Organizations/workspaces in the multi-tenant system',
            columns: [
                {
                    name: 'id',
                    data_type: 'uuid',
                    is_nullable: false,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'name',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'slug',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'plan',
                    data_type: 'USER-DEFINED',
                    udt_name: 'subscription_plan',
                    is_nullable: false,
                    default: "'free'",
                },
                {
                    name: 'subscription_status',
                    data_type: 'USER-DEFINED',
                    udt_name: 'subscription_status',
                    is_nullable: true,
                },
                {
                    name: 'trial_ends_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'settings',
                    data_type: 'jsonb',
                    is_nullable: false,
                    default: "'{}'",
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'deleted_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
            ],
            constraints: [
                {
                    name: 'tenants_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'tenants_slug_unique',
                    type: 'UNIQUE',
                    columns: ['slug'],
                },
            ],
            indexes: [
                {
                    name: 'idx_tenants_slug',
                    is_unique: true,
                    columns: [{ name: 'slug' }],
                    predicate: 'deleted_at IS NULL',
                },
                {
                    name: 'idx_tenants_plan',
                    is_unique: false,
                    columns: [{ name: 'plan' }],
                },
            ],
            foreign_keys: [],
            triggers: [],
        },
        {
            name: 'users',
            description: 'User accounts',
            columns: [
                {
                    name: 'id',
                    data_type: 'uuid',
                    is_nullable: false,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'email',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'name',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'avatar_url',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'email_verified_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'deleted_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
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
            ],
            indexes: [],
            foreign_keys: [],
            triggers: [],
        },
        {
            name: 'tenant_members',
            description: 'Users membership in tenants with roles',
            columns: [
                {
                    name: 'tenant_id',
                    data_type: 'uuid',
                    is_nullable: false,
                },
                {
                    name: 'user_id',
                    data_type: 'uuid',
                    is_nullable: false,
                },
                {
                    name: 'role',
                    data_type: 'USER-DEFINED',
                    udt_name: 'member_role',
                    is_nullable: false,
                    default: "'member'",
                },
                {
                    name: 'invited_by',
                    data_type: 'uuid',
                    is_nullable: true,
                },
                {
                    name: 'joined_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
            ],
            constraints: [
                {
                    name: 'tenant_members_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['tenant_id', 'user_id'],
                },
            ],
            indexes: [
                {
                    name: 'idx_tenant_members_user_id',
                    is_unique: false,
                    columns: [{ name: 'user_id' }],
                },
                {
                    name: 'idx_tenant_members_role',
                    is_unique: false,
                    columns: [{ name: 'tenant_id', name: 'role' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'tenant_members_tenant_fk',
                    columns: ['tenant_id'],
                    foreign_table: 'tenants',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'tenant_members_user_fk',
                    columns: ['user_id'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'tenant_members_invited_by_fk',
                    columns: ['invited_by'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'SET NULL',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
        {
            name: 'projects',
            description: 'Projects within tenants',
            columns: [
                {
                    name: 'id',
                    data_type: 'uuid',
                    is_nullable: false,
                    default: 'gen_random_uuid()',
                },
                {
                    name: 'tenant_id',
                    data_type: 'uuid',
                    is_nullable: false,
                },
                {
                    name: 'name',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'description',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'status',
                    data_type: 'text',
                    is_nullable: false,
                    default: "'active'",
                },
                {
                    name: 'metadata',
                    data_type: 'jsonb',
                    is_nullable: false,
                    default: "'{}'",
                },
                {
                    name: 'search_vector',
                    data_type: 'tsvector',
                    is_nullable: true,
                    description: 'Full-text search vector',
                },
                {
                    name: 'created_by',
                    data_type: 'uuid',
                    is_nullable: false,
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
                {
                    name: 'updated_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
                {
                    name: 'deleted_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: true,
                },
            ],
            constraints: [
                {
                    name: 'projects_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
                {
                    name: 'projects_unique_name_per_tenant',
                    type: 'UNIQUE',
                    columns: ['tenant_id', 'name'],
                    nulls_not_distinct: true,
                },
            ],
            indexes: [
                {
                    name: 'idx_projects_tenant_id',
                    is_unique: false,
                    columns: [{ name: 'tenant_id' }],
                },
                {
                    name: 'idx_projects_created_by',
                    is_unique: false,
                    columns: [{ name: 'created_by' }],
                },
                {
                    name: 'idx_projects_search_vector',
                    is_unique: false,
                    index_type: 'gin',
                    columns: [{ name: 'search_vector' }],
                },
                {
                    name: 'idx_projects_active',
                    is_unique: false,
                    columns: [
                        { name: 'tenant_id' },
                        { name: 'created_at', sort_order: 'DESC', nulls_order: 'NULLS LAST' },
                    ],
                    predicate: "deleted_at IS NULL AND status = 'active'",
                },
            ],
            foreign_keys: [
                {
                    name: 'projects_tenant_fk',
                    columns: ['tenant_id'],
                    foreign_table: 'tenants',
                    foreign_columns: ['id'],
                    on_delete: 'CASCADE',
                    on_update: 'CASCADE',
                },
                {
                    name: 'projects_created_by_fk',
                    columns: ['created_by'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'RESTRICT',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
        {
            name: 'audit_logs',
            description: 'Comprehensive audit trail of all actions',
            columns: [
                {
                    name: 'id',
                    data_type: 'bigint',
                    is_nullable: false,
                    is_identity: true,
                    identity_generation: 'ALWAYS',
                },
                {
                    name: 'tenant_id',
                    data_type: 'uuid',
                    is_nullable: true,
                },
                {
                    name: 'user_id',
                    data_type: 'uuid',
                    is_nullable: true,
                },
                {
                    name: 'action',
                    data_type: 'USER-DEFINED',
                    udt_name: 'audit_action',
                    is_nullable: false,
                },
                {
                    name: 'resource_type',
                    data_type: 'text',
                    is_nullable: false,
                },
                {
                    name: 'resource_id',
                    data_type: 'uuid',
                    is_nullable: true,
                },
                {
                    name: 'changes',
                    data_type: 'jsonb',
                    is_nullable: true,
                    description: 'Before/after snapshot of changes',
                },
                {
                    name: 'ip_address',
                    data_type: 'inet',
                    is_nullable: true,
                },
                {
                    name: 'user_agent',
                    data_type: 'text',
                    is_nullable: true,
                },
                {
                    name: 'created_at',
                    data_type: 'timestamp with time zone',
                    is_nullable: false,
                    default: 'NOW()',
                },
            ],
            constraints: [
                {
                    name: 'audit_logs_pkey',
                    type: 'PRIMARY KEY',
                    columns: ['id'],
                },
            ],
            indexes: [
                {
                    name: 'idx_audit_logs_tenant_id',
                    is_unique: false,
                    columns: [{ name: 'tenant_id' }],
                },
                {
                    name: 'idx_audit_logs_user_id',
                    is_unique: false,
                    columns: [{ name: 'user_id' }],
                },
                {
                    name: 'idx_audit_logs_resource',
                    is_unique: false,
                    columns: [
                        { name: 'resource_type' },
                        { name: 'resource_id' },
                    ],
                },
                {
                    name: 'idx_audit_logs_created_at',
                    is_unique: false,
                    index_type: 'brin',
                    columns: [{ name: 'created_at' }],
                    description: 'BRIN index for time-series data',
                },
                {
                    name: 'idx_audit_logs_changes',
                    is_unique: false,
                    index_type: 'gin',
                    columns: [{ name: 'changes' }],
                },
            ],
            foreign_keys: [
                {
                    name: 'audit_logs_tenant_fk',
                    columns: ['tenant_id'],
                    foreign_table: 'tenants',
                    foreign_columns: ['id'],
                    on_delete: 'SET NULL',
                    on_update: 'CASCADE',
                },
                {
                    name: 'audit_logs_user_fk',
                    columns: ['user_id'],
                    foreign_table: 'users',
                    foreign_columns: ['id'],
                    on_delete: 'SET NULL',
                    on_update: 'CASCADE',
                },
            ],
            triggers: [],
        },
    ],
    views: [
        {
            name: 'active_tenant_members',
            definition: `
                SELECT
                    tm.*,
                    u.email,
                    u.name,
                    t.name as tenant_name
                FROM tenant_members tm
                JOIN users u ON tm.user_id = u.id
                JOIN tenants t ON tm.tenant_id = t.id
                WHERE t.deleted_at IS NULL AND u.deleted_at IS NULL
            `,
        },
        {
            name: 'tenant_statistics',
            definition: `
                SELECT
                    t.id,
                    t.name,
                    t.plan,
                    COUNT(DISTINCT tm.user_id) as member_count,
                    COUNT(DISTINCT p.id) as project_count,
                    COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.id END) as active_project_count
                FROM tenants t
                LEFT JOIN tenant_members tm ON t.id = tm.tenant_id
                LEFT JOIN projects p ON t.id = p.tenant_id
                WHERE t.deleted_at IS NULL
                GROUP BY t.id
            `,
        },
    ],
}
