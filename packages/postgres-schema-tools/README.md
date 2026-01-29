# Postgres Schema Tools

> Comprehensive PostgreSQL schema introspection, comparison, and migration toolkit for TypeScript

[![npm version](https://img.shields.io/npm/v/@robot.com/postgres-schema-tools.svg)](https://www.npmjs.com/package/@robot.com/postgres-schema-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Status**: Active development. Version 0.0.7 is functional but not recommended for production use yet.

---

## Overview

Postgres Schema Tools is a TypeScript library that provides powerful capabilities for working with PostgreSQL database schemas. It bridges the gap between code-defined schemas (like Drizzle ORM) and live databases, enabling comprehensive schema introspection, intelligent comparison, and automated migration generation.

### What It Does

**Schema Introspection**
- Extract complete schema information from any PostgreSQL database
- Capture tables, columns, indexes, constraints, foreign keys, triggers, views, and enums
- Works with PostgreSQL, PGlite (embedded), and Drizzle ORM schemas
- Single optimized query fetches entire schema (no N+1 problems)

**Schema Comparison**
- Intelligent diff engine detects all differences between schemas
- Smart filtering ignores irrelevant changes (like column position)
- Generates detailed JSON reports and human-readable Markdown
- Handles complex scenarios (self-referential FKs, composite keys, partial indexes)

**Migration Generation**
- Automatically generates SQL to migrate from one schema to another
- Dependency-aware ordering prevents referential integrity violations
- Handles views, enums, constraints, and all PostgreSQL features
- Batched output for transactional execution

**Developer Experience**
- Full TypeScript support with detailed types
- CLI tool for CI/CD integration
- PGlite support for fast local testing (no Docker required)
- Comprehensive test coverage (108/108 tests passing)

---

## Quick Start

### Installation

```bash
npm install @robot.com/postgres-schema-tools
# or
pnpm add @robot.com/postgres-schema-tools
# or
yarn add @robot.com/postgres-schema-tools
```

### 30-Second Example

```typescript
import { fetchSchemaPostgresSQL, generatePushDiffSchema } from '@robot.com/postgres-schema-tools'
import postgres from 'postgres'

// Connect to two databases
const prod = postgres(PROD_URL)
const staging = postgres(STAGING_URL)

// Fetch schemas
const prodSchema = await fetchSchemaPostgresSQL(prod)
const stagingSchema = await fetchSchemaPostgresSQL(staging)

// Generate migration SQL
const migrationBatches = generatePushDiffSchema(prodSchema, stagingSchema)

// Execute migrations
for (const batch of migrationBatches) {
  await prod.begin(async (tx) => {
    for (const sql of batch) {
      await tx.unsafe(sql)
    }
  })
}

await prod.end()
await staging.end()
```

---

## Capabilities

### Schema Sources

**PostgreSQL** - Connect to any PostgreSQL database
```typescript
import postgres from 'postgres'
import { fetchSchemaPostgresSQL } from '@robot.com/postgres-schema-tools'

const sql = postgres(process.env.DATABASE_URL!)
const schema = await fetchSchemaPostgresSQL(sql)
```

**PGlite** - Embedded PostgreSQL for testing (no Docker)
```typescript
import { createLocalDatabase, fetchSchemaPgLite } from '@robot.com/postgres-schema-tools'

const db = await createLocalDatabase()
const schema = await fetchSchemaPgLite(db.$client)
```

**Drizzle ORM** - Extract schema from Drizzle table definitions
```typescript
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'
import * as schema from './db/schema'

const localSchema = fetchSchemaDrizzleORM(schema)
```

### Comprehensive Coverage

**Database Objects Supported:**
- ✅ Tables (with descriptions/comments)
- ✅ Columns (all types, nullability, defaults, identity, generated)
- ✅ Primary Keys
- ✅ Unique Constraints (including NULLS NOT DISTINCT)
- ✅ Check Constraints
- ✅ Foreign Keys (all referential actions)
- ✅ Indexes (btree, gin, gist, brin, hash, partial, composite, ordered)
- ✅ Triggers (before, after, instead of)
- ✅ Views (regular views)
- ✅ Enums (custom types)

**Column Types Supported:**
- Numeric: `smallint`, `integer`, `bigint`, `numeric(p,s)`, `real`, `double precision`
- Serial: `serial`, `bigserial` (auto-increment sequences)
- Text: `text`, `varchar(n)`, `char(n)`
- Binary: `bytea`
- Date/Time: `date`, `time`, `timestamp`, `timestamptz`, `interval`
- Boolean: `boolean`
- UUID: `uuid`
- JSON: `json`, `jsonb`
- Network: `inet`, `cidr`, `macaddr`
- Arrays: All base types with `[]` notation
- Custom: User-defined enum types

### Intelligent Diffing

**Smart Change Detection:**
- Detects added, removed, and modified objects
- Ignores harmless changes (column position reordering)
- Filters constraint indexes (auto-managed by constraints)
- Compares semantic equivalence, not just string matching

**Detailed Reports:**
- JSON format for programmatic processing
- Markdown format for human review
- Shows before/after for all changes
- Quick `has_changes` flag for CI/CD gates

### Safe Migration Generation

**Dependency-Aware Ordering:**
1. Drop views (depend on tables)
2. Drop modified views early (recreate later)
3. Manage enums (create/update/delete)
4. Drop foreign keys (block column changes)
5. Drop constraints and indexes
6. Modify columns (drop/add/alter)
7. Re-add constraints and foreign keys
8. Drop obsolete tables
9. Recreate views

**Handles Complex Scenarios:**
- Self-referential foreign keys
- Composite foreign keys and primary keys
- Partial indexes with WHERE clauses
- GIN/GIST indexes (no column ordering)
- Cascading delete/update actions
- Check constraints with complex predicates

---

## CLI Usage

The `postgres-schema-tools` CLI provides comprehensive commands for schema operations.

```
postgres-schema-tools
├── schema
│   ├── fetch    # Extract schema from source
│   ├── diff     # Compare two schemas
│   └── push     # Apply schema to database
├── migrate
│   └── generate # Generate migration SQL
└── diff-report  # [DEPRECATED] Legacy command
```

### Installation

```bash
# Run directly with npx
npx @robot.com/postgres-schema-tools schema fetch ./schema.ts

# Or install globally
npm install -g @robot.com/postgres-schema-tools
```

---

### Command: `schema fetch`

Fetch schema from a database, Drizzle TypeScript file, or JSON file.

```bash
postgres-schema-tools schema fetch <source> [options]
```

**Arguments:**
- `<source>` - Database URL, TypeScript file path, or JSON file path

**Options:**
- `--type <type>` - Source type: `auto` | `postgres` | `drizzle` | `json` (default: `auto`)
- `--output <path>` - Output file path (default: stdout)
- `--format <format>` - Output format: `json` | `yaml` (default: `json`)

**Examples:**

```bash
# Fetch from Drizzle TypeScript schema
postgres-schema-tools schema fetch ./src/db/schema.ts

# Fetch from PostgreSQL database
postgres-schema-tools schema fetch "postgres://user:pass@localhost/mydb"

# Save to file
postgres-schema-tools schema fetch ./schema.ts --output schema.json

# Explicit type (useful if auto-detection fails)
postgres-schema-tools schema fetch ./schema.ts --type drizzle
```

---

### Command: `schema diff`

Compare two schemas and generate a diff report.

```bash
postgres-schema-tools schema diff <sourceA> <sourceB> [options]
```

**Arguments:**
- `<sourceA>` - First schema source (database URL or file path)
- `<sourceB>` - Second schema source (database URL or file path)

**Options:**
- `--type-a <type>` - Type of sourceA: `auto` | `postgres` | `drizzle` | `json` (default: `auto`)
- `--type-b <type>` - Type of sourceB: `auto` | `postgres` | `drizzle` | `json` (default: `auto`)
- `--output <path>` - Output file path (default: stdout)
- `--format <format>` - Output format: `json` | `markdown` (default: `markdown`)
- `--fail-on-changes` - Exit with code 1 if differences detected (for CI)

**Examples:**

```bash
# Compare Drizzle schema with database
postgres-schema-tools schema diff ./src/schema.ts "$DATABASE_URL"

# Compare two databases
postgres-schema-tools schema diff "$PROD_URL" "$STAGING_URL"

# Output JSON report to file
postgres-schema-tools schema diff ./schema.ts "$DATABASE_URL" \
  --format json --output diff-report.json

# CI mode - fail if schemas differ
postgres-schema-tools schema diff ./schema.ts "$DATABASE_URL" --fail-on-changes
```

---

### Command: `schema push`

Push schema changes to a target database.

```bash
postgres-schema-tools schema push <source> <target> [options]
```

**Arguments:**
- `<source>` - Source schema (file path or database URL)
- `<target>` - Target database URL

**Options:**
- `--type <type>` - Source type: `auto` | `postgres` | `drizzle` | `json` (default: `auto`)
- `--mode <mode>` - Push mode: `new` | `diff` (default: `diff`)
- `--dry-run` - Generate SQL without executing
- `--output <path>` - Save generated SQL to file
- `--yes` - Skip confirmation prompts

**Examples:**

```bash
# Preview migration (dry-run)
postgres-schema-tools schema push ./schema.ts "$DATABASE_URL" --dry-run

# Generate and save migration SQL
postgres-schema-tools schema push ./schema.ts "$DATABASE_URL" \
  --dry-run --output migration.sql

# Execute migration (with confirmation)
postgres-schema-tools schema push ./schema.ts "$DATABASE_URL"

# Execute migration (skip confirmation)
postgres-schema-tools schema push ./schema.ts "$DATABASE_URL" --yes

# Create new schema (no diff, fresh database)
postgres-schema-tools schema push ./schema.ts "$DATABASE_URL" --mode new --yes
```

---

### Command: `migrate generate`

Generate migration SQL between two schemas without executing.

```bash
postgres-schema-tools migrate generate <from> <to> [options]
```

**Arguments:**
- `<from>` - Current/source schema (database URL or file path)
- `<to>` - Target schema (database URL or file path)

**Options:**
- `--type-from <type>` - Type of from source (default: `auto`)
- `--type-to <type>` - Type of to source (default: `auto`)
- `--output <path>` - Output SQL file (default: stdout)
- `--format <format>` - Output format: `sql` | `batched` (default: `sql`)

**Examples:**

```bash
# Generate migration from production to Drizzle schema
postgres-schema-tools migrate generate "$PROD_URL" ./schema.ts

# Save migration to file
postgres-schema-tools migrate generate "$PROD_URL" ./schema.ts --output migration.sql

# Output as JSON batches (for programmatic use)
postgres-schema-tools migrate generate "$PROD_URL" ./schema.ts --format batched
```

---

### Command: `diff-report` (Deprecated)

> **Deprecated**: Use `schema diff` instead.

Compare two databases and generate a comprehensive report:

```bash
postgres-schema-tools diff-report <dbA> <dbB> [options]
```

**Arguments:**
- `<dbA>` - First database connection URL
- `<dbB>` - Second database connection URL

**Options:**
- `--out-dir <directory>` - Output directory for reports
- `--fail-on-changes` - Exit with code 1 if differences are detected (for CI)

**Example:**

```bash
postgres-schema-tools diff-report "$PROD_URL" "$STAGING_URL" --out-dir ./report
```

This creates:
- `report/schema1.json` - Full schema A
- `report/schema2.json` - Full schema B
- `report/report.json` - Detailed diff report
- `report/report.md` - Human-readable Markdown report

---

### Exit Codes

- `0` - Success (or no changes when using `--fail-on-changes`)
- `1` - Error occurred or changes detected (with `--fail-on-changes`)

### CI/CD Example (GitHub Actions)

```yaml
name: Schema Validation
on: [pull_request]

jobs:
  validate-schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install

      - name: Compare Drizzle schema with production
        run: |
          npx @robot.com/postgres-schema-tools schema diff \
            ./src/db/schema.ts \
            "${{ secrets.DATABASE_URL }}" \
            --format markdown \
            --output ./schema-diff.md \
            --fail-on-changes

      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: schema-diff
          path: ./schema-diff.md
```

**Alternative: Compare two databases**

```yaml
      - name: Compare staging with production
        run: |
          npx @robot.com/postgres-schema-tools schema diff \
            "${{ secrets.PROD_DATABASE_URL }}" \
            "${{ secrets.STAGING_DATABASE_URL }}" \
            --fail-on-changes
```

---

## Programmatic API

### Core Functions

```typescript
import {
  // Schema fetching
  fetchSchemaPostgresSQL,
  fetchSchemaPgLite,
  fetchSchemaDrizzleORM,

  // Migration generation
  generatePushNewSchema,
  generatePushDiffSchema,

  // Reporting
  createJsonDiffReport,
  createMarkdownReport,

  // Testing utilities
  createLocalDatabase,

  // Types
  type RemoteSchema,
  type LocalSchema,
  type JsonReport,
  type TableDefinition,
  type ColumnDefinition,
} from '@robot.com/postgres-schema-tools'
```

### Schema Fetching

#### Fetch from PostgreSQL

```typescript
import postgres from 'postgres'
import { fetchSchemaPostgresSQL } from '@robot.com/postgres-schema-tools'

const sql = postgres(process.env.DATABASE_URL!)

const schema = await fetchSchemaPostgresSQL(sql, {
  ignore: {
    tables: ['_drizzle_migrations', '_internal_audit'],
    views: ['pg_stat_statements'],
    indexes: ['idx_temporary'],
    constraints: ['old_check'],
  }
})

await sql.end()
```

**Options:**
- `ignore.tables` - Array of table names to exclude
- `ignore.views` - Array of view names to exclude
- `ignore.indexes` - Array of index names to exclude
- `ignore.constraints` - Array of constraint names to exclude

#### Fetch from PGlite

```typescript
import { createLocalDatabase, fetchSchemaPgLite } from '@robot.com/postgres-schema-tools'

// Create local database
const db = await createLocalDatabase({
  extensions: ['pg_trgm', 'uuid-ossp']
})

// Create schema
await db.$client.exec(`
  CREATE TABLE users (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    created_at timestamp DEFAULT NOW()
  )
`)

// Fetch schema
const schema = await fetchSchemaPgLite(db.$client)

// Clean up
await db.close()
```

#### Fetch from Drizzle ORM

```typescript
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow()
})

const localSchema = fetchSchemaDrizzleORM({ users })
```

### Migration Generation

#### Generate SQL for New Schema

```typescript
import { generatePushNewSchema } from '@robot.com/postgres-schema-tools'
import type { LocalSchema } from '@robot.com/postgres-schema-tools'

const schema: LocalSchema = {
  enums: [
    { name: 'user_role', values: ['admin', 'user', 'guest'] }
  ],
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', data_type: 'serial', is_nullable: false },
        { name: 'email', data_type: 'text', is_nullable: false },
        { name: 'role', data_type: 'USER-DEFINED', udt_name: 'user_role', default: "'user'" }
      ],
      constraints: [
        { name: 'users_pkey', type: 'PRIMARY KEY', columns: ['id'] },
        { name: 'users_email_unique', type: 'UNIQUE', columns: ['email'] }
      ],
      indexes: [
        { name: 'idx_users_email', columns: [{ name: 'email' }] }
      ]
    }
  ]
}

const statements = generatePushNewSchema(schema)

// Execute statements
for (const sql of statements) {
  await db.execute(sql)
}
```

#### Generate Migration Between Schemas

```typescript
import { generatePushDiffSchema } from '@robot.com/postgres-schema-tools'

const oldSchema = await fetchSchemaPostgresSQL(prodDb)
const newSchema = await fetchSchemaPostgresSQL(stagingDb)

// Returns string[][] - array of batches
const batches = generatePushDiffSchema(oldSchema, newSchema)

// Execute each batch as a transaction
for (const batch of batches) {
  await prodDb.begin(async (tx) => {
    for (const sql of batch) {
      await tx.unsafe(sql)
    }
  })
}
```

### Diff Reporting

#### Generate JSON Report

```typescript
import { createJsonDiffReport } from '@robot.com/postgres-schema-tools'

const schema1 = await fetchSchemaPostgresSQL(db1)
const schema2 = await fetchSchemaPostgresSQL(db2)

const report = createJsonDiffReport(schema1, schema2)

console.log('Has changes:', report.has_changes)
console.log('Tables added:', report.tables.added.length)
console.log('Tables modified:', report.tables.modified.length)
console.log('Enums changed:', report.enums.modified.length)

// Access detailed changes
report.tables.modified.forEach(table => {
  console.log(`Table ${table.name}:`)
  console.log(`  - Columns added: ${table.columns.added.length}`)
  console.log(`  - Indexes added: ${table.indexes.added.length}`)
})
```

#### Generate Markdown Report

```typescript
import { createMarkdownReport } from '@robot.com/postgres-schema-tools'
import { writeFile } from 'node:fs/promises'

const jsonReport = createJsonDiffReport(schema1, schema2)

// Basic markdown
const markdown = createMarkdownReport(jsonReport, 'Production', 'Staging')

// With migration SQL included
const markdownWithSQL = createMarkdownReport(
  jsonReport,
  'Production',
  'Staging',
  { includeMigrationCode: true }
)

await writeFile('schema-changes.md', markdown)
```

---

## Use Cases

### 1. Schema Validation in CI

Ensure staging matches production before deployment:

```typescript
// scripts/validate-schema.ts
import { fetchSchemaPostgresSQL, createJsonDiffReport } from '@robot.com/postgres-schema-tools'
import postgres from 'postgres'

const prod = postgres(process.env.PROD_DATABASE_URL!)
const staging = postgres(process.env.STAGING_DATABASE_URL!)

const prodSchema = await fetchSchemaPostgresSQL(prod, {
  ignore: { tables: ['_drizzle_migrations'] }
})

const stagingSchema = await fetchSchemaPostgresSQL(staging, {
  ignore: { tables: ['_drizzle_migrations'] }
})

const report = createJsonDiffReport(prodSchema, stagingSchema)

if (report.has_changes) {
  console.error('❌ Schema mismatch detected!')
  console.error(`Tables added: ${report.tables.added.length}`)
  console.error(`Tables removed: ${report.tables.removed.length}`)
  console.error(`Tables modified: ${report.tables.modified.length}`)
  process.exit(1)
}

console.log('✅ Schemas match!')

await prod.end()
await staging.end()
```

### 2. Drizzle to Database Migration

Apply Drizzle schema changes to production:

```typescript
// scripts/migrate-from-drizzle.ts
import {
  fetchSchemaPostgresSQL,
  fetchSchemaDrizzleORM,
  generatePushDiffSchema
} from '@robot.com/postgres-schema-tools'
import { localSchemaToRemoteSchema } from '@robot.com/postgres-schema-tools/schema/local'
import postgres from 'postgres'
import * as schema from './db/schema'

const db = postgres(process.env.DATABASE_URL!)

// Get current database schema
const currentSchema = await fetchSchemaPostgresSQL(db)

// Get desired schema from Drizzle
const localSchema = fetchSchemaDrizzleORM(schema)
const desiredSchema = localSchemaToRemoteSchema(localSchema)

// Generate migration
const batches = generatePushDiffSchema(currentSchema, desiredSchema)

console.log('Migration preview:')
batches.forEach((batch, i) => {
  console.log(`\n--- Batch ${i + 1} ---`)
  batch.forEach(sql => console.log(sql))
})

// Execute with confirmation
const answer = prompt('Execute migration? (yes/no): ')
if (answer === 'yes') {
  for (const batch of batches) {
    await db.begin(async tx => {
      for (const sql of batch) {
        await tx.unsafe(sql)
      }
    })
  }
  console.log('✅ Migration complete!')
}

await db.end()
```

### 3. Local Testing with PGlite

Test schema migrations without Docker:

```typescript
// tests/schema-migrations.test.ts
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  createLocalDatabase,
  fetchSchemaPgLite,
  generatePushDiffSchema
} from '@robot.com/postgres-schema-tools'

test('adding column generates correct SQL', async () => {
  const db = await createLocalDatabase()

  // Initial schema
  await db.$client.exec(`
    CREATE TABLE users (
      id serial PRIMARY KEY,
      name text NOT NULL
    )
  `)

  const v1 = await fetchSchemaPgLite(db.$client)

  // Add column
  await db.$client.exec(`
    ALTER TABLE users ADD COLUMN email text
  `)

  const v2 = await fetchSchemaPgLite(db.$client)

  // Generate migration
  const batches = generatePushDiffSchema(v1, v2)

  // Verify
  assert.equal(batches.length, 1)
  assert(batches[0][0].includes('ADD COLUMN "email"'))

  await db.close()
})
```

### 4. Documentation Generation

Generate schema change documentation for PRs:

```typescript
// scripts/document-schema-changes.ts
import {
  fetchSchemaPostgresSQL,
  createJsonDiffReport,
  createMarkdownReport
} from '@robot.com/postgres-schema-tools'
import { writeFile } from 'node:fs/promises'
import postgres from 'postgres'

const main = postgres(process.env.MAIN_BRANCH_DB!)
const branch = postgres(process.env.FEATURE_BRANCH_DB!)

const mainSchema = await fetchSchemaPostgresSQL(main)
const branchSchema = await fetchSchemaPostgresSQL(branch)

const jsonReport = createJsonDiffReport(mainSchema, branchSchema)
const markdown = createMarkdownReport(jsonReport, 'Main', 'Feature Branch', {
  includeMigrationCode: true
})

await writeFile('./schema-changes.md', markdown)

console.log('📝 Schema changes documented in schema-changes.md')

await main.end()
await branch.end()
```

---

## Type System

### RemoteSchema

Complete database state as fetched from PostgreSQL:

```typescript
interface RemoteSchema {
  schema: string                    // Always "public"
  generated_at: string              // ISO 8601 timestamp
  enums: EnumDefinition[]
  views: ViewDefinition[]
  tables: TableDefinition[]
}

interface TableDefinition {
  name: string
  description: string | null
  columns: ColumnDefinition[]
  constraints: ConstraintDefinition[]
  indexes: IndexDefinition[]
  foreign_keys: ForeignKeyDefinition[]
  triggers: TriggerDefinition[]
}

interface ColumnDefinition {
  name: string
  description: string | null
  position: number
  data_type: string                 // "integer", "text", "numeric", etc.
  is_nullable: boolean
  default: string | null            // SQL expression
  is_generated: boolean
  generation_expression: string | null
  is_identity: boolean
  identity_generation: 'ALWAYS' | 'BY DEFAULT' | null
  max_length: number | null         // For varchar(N)
  numeric_precision: number | null  // For numeric(P,S)
  numeric_scale: number | null
  udt_name: string                  // Underlying type: "int4", "varchar"
}
```

### LocalSchema

Simplified format for defining schemas in code:

```typescript
interface LocalSchema {
  enums?: LocalEnumDefinition[]
  views?: LocalViewDefinition[]
  tables?: LocalTableDefinition[]
}

interface LocalTableDefinition {
  name: string
  description?: string | null
  columns: LocalColumnDefinition[]
  constraints?: LocalConstraintDefinition[]
  indexes?: LocalIndexDefinition[]
  foreign_keys?: LocalForeignKeyDefinition[]
  triggers?: LocalTriggerDefinition[]
}

interface LocalColumnDefinition {
  name: string
  data_type: string                 // Required
  description?: string | null
  is_nullable?: boolean             // Optional, defaults
  default?: string | null
  // ... other optional fields
}
```

### JsonReport

Detailed diff result:

```typescript
interface JsonReport {
  has_changes: boolean
  schemas: { from: string; to: string }
  generated_at: string
  enums: {
    added: EnumDefinition[]
    removed: EnumDefinition[]
    modified: Difference<EnumDefinition>[]
  }
  views: {
    added: ViewDefinition[]
    removed: ViewDefinition[]
    modified: Difference<ViewDefinition>[]
  }
  tables: {
    added: TableDefinition[]
    removed: TableDefinition[]
    modified: TableModification[]
  }
}

interface TableModification {
  name: string
  description?: { from: string | null; to: string | null }
  columns: {
    added: ColumnDefinition[]
    removed: ColumnDefinition[]
    modified: Difference<ColumnDefinition>[]
  }
  constraints: { added, removed, modified }
  indexes: { added, removed, modified }
  foreign_keys: { added, removed, modified }
  triggers: { added, removed, modified }
}
```

---

## Advanced Features

### Drizzle ORM Integration

Full support for Drizzle ORM schema definitions:

```typescript
import { pgTable, pgEnum, serial, text, integer, index, foreignKey, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'

// Define enums
const userRole = pgEnum('user_role', ['admin', 'user', 'guest'])

// Define tables
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  role: userRole('role').default('user')
}, (t) => [
  index('idx_users_email').on(t.email),
  check('email_format', sql`${t.email} LIKE '%@%'`)
])

const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull()
})

// Extract schema
const localSchema = fetchSchemaDrizzleORM({ userRole, users, posts })
```

**Supported Drizzle Features:**
- ✅ All column types (serial, text, integer, numeric, uuid, jsonb, arrays, etc.)
- ✅ Primary keys (single and composite)
- ✅ Foreign keys with referential actions
- ✅ Unique constraints
- ✅ Check constraints with SQL expressions
- ✅ Indexes (standard, unique, partial)
- ✅ Default values (literals and SQL functions)
- ✅ Enums

### Serial Column Handling

Automatic sequence generation for serial columns:

```typescript
const users = pgTable('users', {
  id: serial('id').primaryKey(),  // Automatically creates sequence
  bigId: bigserial('big_id')      // Automatically creates bigint sequence
})

const schema = fetchSchemaDrizzleORM({ users })
// Generates: data_type: 'serial' (not 'integer' with default)
```

### Numeric Precision/Scale

Preserves precision and scale for numeric types:

```typescript
const products = pgTable('products', {
  price: numeric('price', { precision: 10, scale: 2 }),  // numeric(10, 2)
  weight: numeric('weight', { precision: 8 })            // numeric(8)
})

// Generates SQL: price numeric(10, 2), weight numeric(8)
```

### Array Columns

Full support for PostgreSQL array types:

```typescript
const posts = pgTable('posts', {
  tags: text('tags').array().default(sql`'{}'::text[]`),
  scores: integer('scores').array()
})

// Generates SQL: tags text[] DEFAULT '{}'::text[], scores integer[]
```

### Complex Indexes

Support for all index types and features:

```typescript
const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  content: text('content'),
  search_vector: text('search_vector'),  // tsvector
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at')
}, (t) => [
  // GIN index (full-text search)
  index('idx_search').on(t.search_vector).using('gin'),

  // Composite index with ordering
  index('idx_date_id').on(t.created_at.desc(), t.id.asc()),

  // Partial index
  index('idx_recent').on(t.created_at).where(sql`created_at > NOW() - INTERVAL '30 days'`),

  // JSONB GIN index
  index('idx_metadata').on(t.metadata).using('gin')
])
```

**Important:** GIN, GIST, BRIN, and hash indexes don't support column ordering (ASC/DESC/NULLS). The library automatically omits ordering for these index types.

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm --filter @robot.com/postgres-schema-tools test

# Run specific test file
pnpm test -- src/tests/fetch.test.ts

# Run with Node.js environment variables
node --env-file .env --import tsx --test './src/**/*.test.ts'
```

### Test Coverage

All 108 tests passing (100% pass rate):

**Core Functionality:**
- ✅ Schema fetching (PostgreSQL, PGlite, Drizzle)
- ✅ Diff engine (all change types)
- ✅ SQL generation (DDL statements)
- ✅ Migration ordering (dependency resolution)

**Database Features:**
- ✅ All column types (including numeric precision, varchar length)
- ✅ Serial/bigserial auto-increment
- ✅ Primary keys (single and composite)
- ✅ Foreign keys (all referential actions)
- ✅ Unique constraints (including NULLS NOT DISTINCT on PG 15+)
- ✅ Check constraints
- ✅ Indexes (btree, gin, gist, brin, hash, partial, composite)
- ✅ Triggers
- ✅ Views
- ✅ Enums

**Edge Cases:**
- ✅ Self-referential foreign keys
- ✅ Composite foreign keys
- ✅ Column position changes (correctly ignored)
- ✅ Constraint indexes (filtered out)
- ✅ Array columns with defaults
- ✅ Complex default expressions

### Testing with PGlite

No Docker required! All tests use PGlite for fast, isolated testing:

```typescript
import { test } from 'node:test'
import { createLocalDatabase, fetchSchemaPgLite } from '@robot.com/postgres-schema-tools'

test('create and fetch schema', async () => {
  const db = await createLocalDatabase()

  await db.$client.exec(`
    CREATE TABLE users (id serial PRIMARY KEY, name text)
  `)

  const schema = await fetchSchemaPgLite(db.$client)

  assert.equal(schema.tables.length, 1)
  assert.equal(schema.tables[0].name, 'users')

  await db.close()
})
```

---

## Limitations & Considerations

### Current Limitations

1. **Public Schema Only** - Only inspects the `public` schema. Other schemas are ignored.

2. **Enum Value Removal** - Cannot remove values from existing enums (PostgreSQL limitation). Requires manual type recreation.

3. **No Rollback Generation** - Only generates forward migrations. For rollbacks, generate diff in reverse or write manually.

4. **Column Reordering Not Supported** - Cannot change column order (PostgreSQL limitation). Would require table recreation.

5. **Materialized Views** - Treated like regular views. Refresh strategies not captured.

6. **No Partitioned Tables** - Partition information not captured or managed.

7. **NULLS NOT DISTINCT** - PostgreSQL 15+ feature. Code prepared but commented out for PGlite (PG 14) compatibility.

### Best Practices

**Schema Fetching:**
- Use `ignore` options to exclude migration tables and system views
- Cache schema fetches when comparing multiple times
- Single query fetches everything - very fast even for large schemas

**Migration Generation:**
- Always review generated SQL before executing
- Use transactions for batches to ensure atomicity
- Test migrations on staging before production
- Keep migrations in version control

**Testing:**
- Use PGlite for unit tests (fast, isolated)
- Use real PostgreSQL for integration tests
- Test both forward and backward migrations
- Verify referential integrity after migrations

**CI/CD:**
- Run `diff-report --fail-on-changes` to gate deployments
- Upload diff reports as build artifacts
- Require schema approval for production changes
- Automate staging → production schema validation

---

## Performance

### Schema Fetching

**Single Query Approach:**
- Entire schema fetched in one database round-trip
- Uses PostgreSQL CTEs (Common Table Expressions)
- Typically <500ms for schemas with 100+ tables
- Optimized for modern PostgreSQL (12+)

**Query Structure:**
```sql
WITH
  enums AS (...),
  views AS (...),
  table_columns AS (...),
  table_constraints AS (...),
  indexes AS (...),
  foreign_keys AS (...),
  triggers AS (...)
SELECT jsonb_build_object(
  'schema', 'public',
  'enums', (SELECT jsonb_agg(...) FROM enums),
  'tables', (SELECT jsonb_agg(...) FROM tables)
) AS public_schema_json
```

**426 lines of optimized SQL** - See [src/schema/remote/query.ts](src/schema/remote/query.ts)

### Diff Algorithm

**Efficient Comparison:**
- Name-based matching using Map lookups (O(n))
- JSON.stringify for deep equality (pragmatic)
- Position-agnostic column comparison
- Constraint index filtering

**Typical Performance:**
- Small schemas (<10 tables): <10ms
- Medium schemas (10-100 tables): <100ms
- Large schemas (100+ tables): <500ms

---

## Troubleshooting

### Common Issues

**TypeScript errors with Drizzle:**
```typescript
// ❌ Wrong - missing type imports
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'

// ✅ Correct - import all schema objects
import * as schema from './db/schema'
const localSchema = fetchSchemaDrizzleORM(schema)
```

**Serial columns not auto-incrementing:**
```typescript
// ❌ Wrong - using integer with default
const users = pgTable('users', {
  id: integer('id').default(sql`nextval('users_id_seq')`)
})

// ✅ Correct - use serial()
const users = pgTable('users', {
  id: serial('id').primaryKey()
})
```

**Failed INSERT increments sequence:**
```typescript
// Be aware: failed INSERTs still consume sequence values
await client.query("INSERT INTO users (email) VALUES ('invalid')")  // Fails
await client.query("INSERT INTO users (email) VALUES ('valid@email.com') RETURNING id")
// Returns id=2, not id=1 (sequence was incremented by failed attempt)

// Always use RETURNING to get actual IDs in tests
const result = await client.query("INSERT INTO users (...) VALUES (...) RETURNING id")
const userId = result.rows[0].id
```

**GIN index syntax errors:**
```typescript
// ❌ Wrong - GIN doesn't support ordering
CREATE INDEX idx_search USING gin (search_vector ASC NULLS LAST)

// ✅ Correct - no ordering for GIN
CREATE INDEX idx_search USING gin (search_vector)

// Library handles this automatically!
```

---

## Contributing

Contributions are welcome! This package is in active development.

### Development Setup

```bash
# Clone repository
git clone https://github.com/robot-com/oss.git
cd oss/packages/postgres-schema-tools

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm tsc --noEmit

# Run specific test
pnpm test -- src/tests/fetch.test.ts
```

### Project Structure

```
src/
├── schema/              # Schema definitions & fetching
│   ├── common/         # Shared types (ConstraintType, etc.)
│   ├── remote/         # Live database schemas
│   │   ├── types.ts   # RemoteSchema types
│   │   ├── query.ts   # 426-line SQL query
│   │   └── fetch.ts   # fetchSchemaPostgresSQL/PgLite
│   ├── local/          # Code-defined schemas
│   │   ├── types.ts   # LocalSchema types
│   │   └── to-remote.ts
│   ├── drizzle/        # Drizzle ORM integration
│   │   └── fetch.ts   # fetchSchemaDrizzleORM
│   └── push/           # Migration generation
│       ├── diff.ts    # generatePushDiffSchema
│       ├── new.ts     # generatePushNewSchema
│       └── generators.ts  # SQL statement builders
├── report/             # Diff reporting
│   ├── json.ts        # createJsonDiffReport
│   └── markdown.ts    # createMarkdownReport
├── db/                 # Database utilities
│   └── index.ts       # createLocalDatabase (PGlite)
├── bin/                # CLI
│   ├── main.ts        # CLI entry point
│   ├── commands/      # CLI commands
│   │   ├── schema-fetch.ts
│   │   ├── schema-diff.ts
│   │   ├── schema-push.ts
│   │   └── migrate-generate.ts
│   └── utils/         # CLI utilities
│       ├── drizzle-loader.ts  # Dynamic TS loading with jiti
│       └── source-loader.ts   # Unified schema loading
└── tests/              # Test suite (108 tests)
```

### Running the Knowledge Base

See [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md) for comprehensive documentation including:
- Architecture overview
- Implementation details
- Type system reference
- Migration ordering logic
- SQL query breakdown

---

## License

MIT © [Robot OSS](https://github.com/robot-com/oss)

---

## Links

- [GitHub Repository](https://github.com/robot-com/oss)
- [Issue Tracker](https://github.com/robot-com/oss/issues)
- [npm Package](https://www.npmjs.com/package/@robot.com/postgres-schema-tools)
- [Knowledge Base](KNOWLEDGE_BASE.md)

---

**Made with ❤️ for the PostgreSQL and TypeScript communities**
