# Postgres Schema Tools - Complete Knowledge Base

**Package:** @robot.com/postgres-schema-tools
**Version:** 0.0.5
**Status:** Active development, not production-ready yet
**Generated:** 2026-01-28

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Core Types & Data Structures](#core-types--data-structures)
4. [Schema Fetching System](#schema-fetching-system)
5. [Diff Engine](#diff-engine)
6. [SQL Generation](#sql-generation)
7. [CLI Tool](#cli-tool)
8. [API Reference](#api-reference)
9. [Implementation Details](#implementation-details)
10. [Testing Strategy](#testing-strategy)
11. [Use Cases & Patterns](#use-cases--patterns)
12. [Limitations & Future Work](#limitations--future-work)

---

## Executive Summary

### Purpose

Postgres Schema Tools is a comprehensive TypeScript package for inspecting, comparing, and migrating PostgreSQL database schemas. It bridges the gap between code-defined schemas (Drizzle ORM) and live databases, enabling:

- **Schema Introspection**: Extract complete schema information from any Postgres database
- **Schema Comparison**: Detect all differences between two schemas
- **Migration Generation**: Automatically create SQL to migrate from one schema to another
- **CI/CD Integration**: Validate schema changes in continuous integration
- **Local Development**: Use PGlite for fast, local testing without Docker

### Key Features

- ✅ **Multiple Schema Sources**: PostgreSQL, PGlite, Drizzle ORM
- ✅ **Comprehensive Coverage**: Tables, columns, indexes, constraints, foreign keys, triggers, views, enums
- ✅ **Smart Diffing**: Ignores irrelevant changes (like column position)
- ✅ **Safe Migrations**: Ordered SQL batches that respect dependencies
- ✅ **CLI & Programmatic**: Use from command line or Node.js code
- ✅ **Type-Safe**: Full TypeScript support with detailed types
- ✅ **Test-Friendly**: Built-in PGlite support for unit tests

### Quick Example

```typescript
import { fetchSchemaPostgresSQL, generatePushDiffSchema } from '@robot.com/postgres-schema-tools'
import postgres from 'postgres'

// Fetch schemas from two databases
const prod = await fetchSchemaPostgresSQL(postgres(PROD_URL))
const staging = await fetchSchemaPostgresSQL(postgres(STAGING_URL))

// Generate migration SQL
const migrationBatches = generatePushDiffSchema(prod, staging)

// Execute migrations
for (const batch of migrationBatches) {
  await db.begin(async (tx) => {
    for (const sql of batch) {
      await tx.execute(sql)
    }
  })
}
```

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────┐
│ Schema Sources  │
├─────────────────┤
│ • PostgreSQL    │
│ • PGlite        │
│ • Drizzle ORM   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RemoteSchema   │  ← Canonical JSON representation
│   (JSON Type)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Diff Engine    │
│  (json.ts)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   JsonReport    │  ← Detailed change report
└────────┬────────┘
         │
         ├─→ Markdown Report (human-readable)
         │
         └─→ SQL Generation (executable migrations)
```

### Directory Structure

```
packages/postgres-schema-tools/
├── src/
│   ├── schema/                      # Schema definitions & fetching
│   │   ├── common/
│   │   │   ├── types.ts            # Shared enums (ConstraintType, etc.)
│   │   │   └── index.ts
│   │   ├── remote/                  # Live database schemas
│   │   │   ├── types.ts            # RemoteSchema types (detailed)
│   │   │   ├── query.ts            # 426-line SQL query
│   │   │   ├── fetch.ts            # fetchSchemaPostgresSQL/PgLite
│   │   │   └── index.ts
│   │   ├── local/                   # Code-defined schemas
│   │   │   ├── types.ts            # LocalSchema types (simplified)
│   │   │   ├── to-remote.ts        # Convert Local → Remote
│   │   │   └── index.ts
│   │   ├── drizzle/                 # Drizzle ORM integration
│   │   │   ├── fetch.ts            # fetchSchemaDrizzleORM
│   │   │   └── index.ts
│   │   ├── push/                    # Migration generation
│   │   │   ├── diff.ts             # generatePushDiffSchema
│   │   │   ├── new.ts              # generatePushNewSchema
│   │   │   ├── generators.ts       # SQL statement generators
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── report/                      # Diff reporting
│   │   ├── type.ts                 # JsonReport, Difference types
│   │   ├── json.ts                 # createJsonDiffReport
│   │   ├── markdown.ts             # createMarkdownReport
│   │   └── index.ts
│   ├── db/                          # Database utilities
│   │   └── index.ts                # createLocalDatabase (PGlite)
│   ├── bin/                         # CLI
│   │   └── main.ts                 # postgres-schema-tools command
│   ├── tests/                       # Test suite
│   │   ├── fetch.test.ts
│   │   ├── drizzle.test.ts
│   │   ├── drizzle-vs-db-fetch.test.ts
│   │   ├── push-new.test.ts
│   │   └── push-diff.test.ts
│   └── index.ts                     # Main exports
├── package.json
├── tsconfig.json
└── README.md
```

### Key Design Decisions

1. **RemoteSchema as Central Format**: All schema sources convert to RemoteSchema for consistency
2. **JSON-Based Comparison**: Uses JSON.stringify for pragmatic deep equality checks
3. **Batched SQL Output**: Returns `string[][]` where inner arrays can be transactional
4. **PGlite for Tests**: No Docker required, fast local testing
5. **Ignore Lists**: Allow excluding tables/views/indexes from comparison
6. **Position-Agnostic Column Diff**: Column reordering doesn't trigger migrations

---

## Core Types & Data Structures

### RemoteSchema (Complete Database State)

**Purpose**: Represents the actual state of a live database as fetched from PostgreSQL catalogs.

```typescript
interface RemoteSchema {
  schema: string                    // Always "public"
  generated_at: string              // ISO 8601 timestamp
  enums: EnumDefinition[]
  views: ViewDefinition[]
  tables: TableDefinition[]
}
```

### TableDefinition (Complete Table)

```typescript
interface TableDefinition {
  name: string
  description: string | null
  columns: ColumnDefinition[]
  constraints: ConstraintDefinition[]
  indexes: IndexDefinition[]
  foreign_keys: ForeignKeyDefinition[]
  triggers: TriggerDefinition[]
}
```

### ColumnDefinition (Complete Column)

```typescript
interface ColumnDefinition {
  name: string
  description: string | null
  position: number                   // 1-based ordinal
  data_type: string                  // "integer", "character varying"
  is_nullable: boolean
  default: string | null             // SQL expression
  is_generated: boolean              // Computed column?
  generation_expression: string | null
  is_identity: boolean               // IDENTITY column?
  identity_generation: 'ALWAYS' | 'BY DEFAULT' | null
  max_length: number | null          // For varchar(N)
  numeric_precision: number | null   // For numeric(P,S)
  numeric_scale: number | null
  udt_name: string                   // Underlying type: "int4", "varchar"
}
```

### ConstraintDefinition

```typescript
interface ConstraintDefinition {
  name: string
  description: string | null
  type: ConstraintType               // 'PRIMARY KEY' | 'UNIQUE' | 'CHECK'
  definition: string                 // Full SQL: "PRIMARY KEY (id)"
  columns: string[]                  // Affected columns
  check_predicate: string | null     // For CHECK: "(age > 18)"
  nulls_not_distinct: boolean        // UNIQUE constraint behavior
}
```

### IndexDefinition

```typescript
interface IndexDefinition {
  name: string
  description: string | null
  definition: string                 // Full CREATE INDEX statement
  is_constraint_index: boolean       // Created by PK/UNIQUE constraint?
  is_unique: boolean
  nulls_not_distinct: boolean | null
  is_valid: boolean                  // Currently usable?
  index_type: string                 // "btree", "gist", "gin", "hash"
  columns: IndexColumn[]
  predicate: string | null           // Partial index WHERE clause
}

interface IndexColumn {
  name: string
  sort_order: 'ASC' | 'DESC'
  nulls_order: 'NULLS FIRST' | 'NULLS LAST'
}
```

### ForeignKeyDefinition

```typescript
interface ForeignKeyDefinition {
  name: string
  description: string | null
  columns: string[]                  // Local columns
  foreign_table: string              // Referenced table
  foreign_columns: string[]          // Referenced columns
  on_update: ReferentialAction       // 'CASCADE' | 'RESTRICT' | etc.
  on_delete: ReferentialAction
  match_option: MatchOption          // 'FULL' | 'PARTIAL' | 'SIMPLE'
}
```

### LocalSchema (Simplified Authoring Format)

**Purpose**: Simplified format for defining schemas in code. Optional fields reduce verbosity.

```typescript
interface LocalSchema {
  enums?: LocalEnumDefinition[]
  views?: LocalViewDefinition[]
  tables?: LocalTableDefinition[]
}

interface LocalColumnDefinition {
  name: string
  data_type: string                  // Required
  is_nullable?: boolean              // Defaults
  default?: string | null
  // ... other optional fields
}
```

**Key Difference**: LocalSchema uses optional fields extensively for easier authoring.

### JsonReport (Diff Result)

```typescript
interface JsonReport {
  has_changes: boolean               // Quick check
  schemas: {
    from: string
    to: string
  }
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

interface Difference<T> {
  from: T
  to: T
}

interface TableModification {
  name: string
  description?: { from: string | null; to: string | null }
  columns: {
    added: ColumnDefinition[]
    removed: ColumnDefinition[]
    modified: Difference<ColumnDefinition>[]
  }
  constraints: { added: ..., removed: ..., modified: ... }
  indexes: { added: ..., removed: ..., modified: ... }
  foreign_keys: { added: ..., removed: ..., modified: ... }
  triggers: { added: ..., removed: ..., modified: ... }
}
```

---

## Schema Fetching System

### 1. PostgreSQL Fetching (Remote)

**File**: `src/schema/remote/fetch.ts`

```typescript
export async function fetchSchemaPostgresSQL(
  client: Sql,                       // postgres driver
  options: QuerySchemaOptions = {}
): Promise<RemoteSchema>

interface QuerySchemaOptions {
  ignore?: {
    views?: string[]
    tables?: string[]
    indexes?: string[]
    constraints?: string[]
  }
}
```

**How it Works**:

1. Executes a 426-line SQL query (see `query.ts`)
2. Query uses PostgreSQL catalog tables:
   - `pg_type`, `pg_enum` for enums
   - `information_schema.views` for views
   - `information_schema.columns`, `pg_class`, `pg_attribute` for columns
   - `pg_constraint` for constraints and foreign keys
   - `pg_index`, `pg_class` for indexes
   - `pg_trigger`, `pg_proc` for triggers
3. Returns a single JSON object with all schema information
4. Applies ignore filters to exclude specified elements

**The SQL Query** (`src/schema/remote/query.ts`):

- **Complexity**: 426 lines of optimized SQL
- **Structure**: Uses CTEs (Common Table Expressions) for modularity
- **Output**: Single row with `public_schema_json` column containing full RemoteSchema

**CTE Breakdown**:
1. `enums` - Gather all user-defined enum types
2. `views` - Gather all views and definitions
3. `table_columns` - Detailed column information with descriptions
4. `table_constraints` - PRIMARY KEY, UNIQUE, CHECK constraints
5. `index_columns` - Pre-aggregate index column details
6. `detailed_indexes` - Index definitions with metadata
7. `foreign_keys` - FK relationships
8. `table_triggers` - Trigger definitions
9. `tables_json` - Assemble all table data
10. Final SELECT - Combine everything into one JSON object

**Why This Approach?**:
- ✅ Single round-trip to database
- ✅ Consistent JSON structure
- ✅ All metadata in one query
- ✅ Works with any Postgres version 12+

### 2. PGlite Fetching (Embedded)

**File**: `src/schema/remote/fetch.ts`

```typescript
export async function fetchSchemaPgLite(
  client: PGlite,
  options: QuerySchemaOptions = {}
): Promise<RemoteSchema>
```

**Purpose**: Fetch schema from embedded PGlite database (used in tests).

**Difference from PostgreSQL**:
- Uses `client.query()` instead of `client.unsafe()`
- Otherwise identical - same SQL query

### 3. Drizzle ORM Fetching (Code)

**File**: `src/schema/drizzle/fetch.ts`

```typescript
export function fetchSchemaDrizzleORM(
  schema: Record<string, unknown>
): LocalSchema
```

**Purpose**: Extract schema from Drizzle ORM table definitions.

**How it Works**:

1. Iterates through schema object entries
2. Identifies Drizzle tables with `is(value, PgTable)`
3. Identifies enums with `isPgEnum(value)`
4. For each table:
   - Extracts columns via `getTableColumns()`
   - Extracts primary keys from `tableConfig.primaryKeys`
   - Extracts unique constraints from `tableConfig.uniqueConstraints`
   - Extracts checks from `tableConfig.checks`
   - Extracts indexes from `tableConfig.indexes`
   - Extracts foreign keys from `tableConfig.foreignKeys`
5. Converts Drizzle types to Postgres types
6. Handles SQL objects with `PgDialect.sqlToQuery()`

**Type Mapping** (`mapDrizzleTypeToPostgres`):

| Drizzle Type | Postgres Type |
|-------------|---------------|
| string | text |
| number | integer |
| boolean | boolean |
| array | text[] |
| json | jsonb |
| date | timestamp |
| bigint | bigint |
| buffer | bytea |
| duration | interval |
| localTime | time |
| localDate | date |
| localDateTime | timestamp |

**Handling Drizzle SQL Objects**:

```typescript
// Drizzle uses SQL<string> for defaults
const pgDialect = new PgDialect()

function unwrapSql(value: unknown): string {
  if (is(value, SQL)) {
    const compiled = pgDialect.sqlToQuery(value)
    // Replace $1, $2, ... with actual values
    let sqlString = compiled.sql
    compiled.params.forEach((param, index) => {
      sqlString = sqlString.replace(`$${index + 1}`, formatParam(param))
    })
    return sqlString
  }
  // ... handle other types
}
```

**Example**:

```typescript
import { pgTable, text, integer } from 'drizzle-orm/pg-core'
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'

const users = pgTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique()
})

const schema = { users }
const localSchema = fetchSchemaDrizzleORM(schema)
// Returns LocalSchema with 'users' table definition
```

### 4. Helper: createLocalDatabase

**File**: `src/db/index.ts`

```typescript
export async function createLocalDatabase(config?: {
  extensions?: string[]
}): Promise<{
  $client: PGlite
  close: () => Promise<void>
}>
```

**Purpose**: Create a temporary PGlite instance for testing.

**Features**:
- In-memory Postgres (no disk, no Docker)
- pg_trgm extension enabled by default
- Returns client and close function

**Usage**:

```typescript
import { createLocalDatabase, fetchSchemaPgLite } from '@robot.com/postgres-schema-tools'

const db = await createLocalDatabase()

// Create tables
await db.$client.exec(`
  CREATE TABLE users (id serial primary key, name text);
`)

// Fetch schema
const schema = await fetchSchemaPgLite(db.$client)

// Clean up
await db.close()
```

---

## Diff Engine

### Overview

**File**: `src/report/json.ts`

The diff engine compares two `RemoteSchema` objects and produces a detailed `JsonReport` of all changes.

### Main Function

```typescript
export function createJsonDiffReport(
  schemaA: RemoteSchema,   // "before"
  schemaB: RemoteSchema    // "after"
): JsonReport
```

### Algorithm

**1. Top-Level Comparison**:
```typescript
// Compare enums
const enumsDiff = diffSimpleItems(schemaA.enums, schemaB.enums)

// Compare views
const viewsDiff = diffSimpleItems(schemaA.views, schemaB.views)

// Compare tables (complex)
const tablesDiff = diffByName(schemaA.tables, schemaB.tables)
```

**2. Table-Level Comparison** (for each common table):
```typescript
for (const { itemA: tableA, itemB: tableB } of tablesDiff.common) {
  // Compare columns (ignore position changes)
  const columnsDiff = diffSimpleColumns(tableA.columns, tableB.columns)

  // Compare constraints
  const constraintsDiff = diffSimpleItems(tableA.constraints, tableB.constraints)

  // Compare indexes (filter out constraint indexes)
  const indexesDiff = diffSimpleItems(
    tableA.indexes.filter(idx => !idx.is_constraint_index),
    tableB.indexes.filter(idx => !idx.is_constraint_index)
  )

  // Compare foreign keys
  const fkDiff = diffSimpleItems(tableA.foreign_keys, tableB.foreign_keys)

  // Compare triggers
  const triggersDiff = diffSimpleItems(tableA.triggers, tableB.triggers)
}
```

### Helper Functions

**`diffByName<T>`** - Generic name-based diffing:

```typescript
function diffByName<T extends { name: string }>(
  listA: T[],
  listB: T[]
): {
  added: T[]       // In B but not in A
  removed: T[]     // In A but not in B
  common: { itemA: T; itemB: T }[]  // In both
}
```

**Implementation**:
1. Create Map<name, item> for both lists
2. Iterate A: if in B, add to common; else add to removed
3. Iterate B: if not in A, add to added

**`diffSimpleItems<T>`** - Deep comparison for simple objects:

```typescript
function diffSimpleItems<T extends { name: string }>(
  listA: T[],
  listB: T[]
): {
  added: T[]
  removed: T[]
  modified: Difference<T>[]
}
```

**Implementation**:
1. Use `diffByName()` to find added/removed/common
2. For common items, compare with `JSON.stringify()`
3. If different, add to modified with `{ from: itemA, to: itemB }`

**`diffSimpleColumns<T>`** - Column comparison (ignore position):

```typescript
function diffSimpleColumns<T extends { name: string }>(
  listA: T[],
  listB: T[]
): { added, removed, modified }
```

**Implementation**:
1. Same as `diffSimpleItems()`
2. BUT: Remove `position` field before JSON comparison
3. This ignores harmless column reordering

### Special Handling

**Constraint Indexes**:
```typescript
// Filter out indexes created by constraints
const filteredIndexes = table.indexes.filter(
  idx => !idx.is_constraint_index
)
```

**Why?** Constraint indexes are automatically created/dropped with their constraints. Including them would cause duplicate migration statements.

**Column Positions**:
```typescript
const itemANoPos = { ...itemA, position: undefined }
const itemBNoPos = { ...itemB, position: undefined }
if (JSON.stringify(itemANoPos) !== JSON.stringify(itemBNoPos)) {
  modified.push({ from: itemA, to: itemB })
}
```

**Why?** Column position changes don't affect queries. Postgres ALTER TABLE ADD COLUMN always adds to the end anyway.

### Output Structure

```typescript
{
  has_changes: boolean,  // Quick check: any changes detected?
  schemas: { from: "public", to: "public" },
  generated_at: "2026-01-28T10:00:00.000Z",

  enums: {
    added: [{ name: "user_role", values: ["admin", "user"] }],
    removed: [],
    modified: []
  },

  views: { added: [], removed: [], modified: [] },

  tables: {
    added: [{ name: "orders", columns: [...], ... }],
    removed: [],
    modified: [{
      name: "users",
      columns: {
        added: [{ name: "age", data_type: "integer", ... }],
        removed: [],
        modified: []
      },
      constraints: { added: [], removed: [], modified: [] },
      indexes: { added: [], removed: [], modified: [] },
      foreign_keys: { added: [], removed: [], modified: [] },
      triggers: { added: [], removed: [], modified: [] }
    }]
  }
}
```

---

## SQL Generation

### Overview

SQL generation converts diff reports or local schemas into executable SQL statements.

**Files**:
- `src/schema/push/diff.ts` - Migration from old → new
- `src/schema/push/new.ts` - Create new schema from scratch
- `src/schema/push/generators.ts` - Individual SQL statement builders

### 1. Migration Generation (Diff)

**File**: `src/schema/push/diff.ts`

```typescript
export function generatePushDiffSchema(
  oldSchema: RemoteSchema,
  newSchema: RemoteSchema
): string[][]
```

**Returns**: Array of batches, where each batch is an array of SQL statements that can be executed in a single transaction.

**Migration Order** (Critical for referential integrity):

```typescript
function generateMigrationSQL(report: JsonReport): string[][] {
  const statements: string[][] = []

  // 1. Drop removed views (depend on tables)
  report.views.removed.forEach(v => {
    statements.push(deleteView(v.name))
  })

  // 2. Create new enums
  report.enums.added.forEach(e => {
    statements.push(createEnum(e))
  })

  // 3. Update modified enums
  report.enums.modified.forEach(e => {
    statements.push(updateEnum(e.from, e.to))
  })

  // 4. Drop removed enums
  report.enums.removed.forEach(e => {
    statements.push(deleteEnum(e.name))
  })

  // 5. Create new tables
  report.tables.added.forEach(t => {
    statements.push(createTable(t))
  })

  // 6. Modify existing tables
  report.tables.modified.forEach(t => {
    // a. Drop foreign keys (block column/table changes)
    t.foreign_keys.removed.forEach(fk => {
      statements.push(deleteForeignKey(t.name, fk.name))
    })
    t.foreign_keys.modified?.forEach(fk => {
      statements.push(deleteForeignKey(t.name, fk.from.name))
    })

    // b. Drop constraints
    t.constraints.removed.forEach(c => {
      statements.push(deleteConstraint(t.name, c.name))
    })
    t.constraints.modified.forEach(c => {
      statements.push(deleteConstraint(t.name, c.from.name))
    })

    // c. Drop indexes
    t.indexes.removed.forEach(i => {
      statements.push(deleteIndex(i.name))
    })
    t.indexes.modified.forEach(i => {
      statements.push(deleteIndex(i.from.name))
    })

    // d. Drop triggers
    t.triggers.removed.forEach(tr => {
      statements.push(deleteTrigger(t.name, tr.name))
    })
    t.triggers.modified.forEach(tr => {
      statements.push(deleteTrigger(t.name, tr.from.name))
    })

    // e. Drop removed columns
    t.columns.removed.forEach(c => {
      statements.push(deleteColumn(t.name, c.name))
    })

    // f. Add new columns
    t.columns.added.forEach(c => {
      statements.push(createColumn(t.name, c))
    })

    // g. Alter existing columns
    t.columns.modified.forEach(c => {
      statements.push(updateColumn(t.name, c.from, c.to))
    })

    // h. Re-add changed constraints
    t.constraints.modified.forEach(c => {
      statements.push(createConstraint(t.name, c.to))
    })

    // i. Add new constraints
    t.constraints.added.forEach(c => {
      statements.push(createConstraint(t.name, c))
    })

    // j. Re-add indexes
    t.indexes.modified.forEach(i => {
      statements.push(createIndex(t.name, i.to))
    })
    t.indexes.added.forEach(i => {
      statements.push(createIndex(t.name, i))
    })

    // k. Re-add foreign keys
    t.foreign_keys.modified?.forEach(fk => {
      statements.push(createForeignKey(t.name, fk.to))
    })
    t.foreign_keys.added.forEach(fk => {
      statements.push(createForeignKey(t.name, fk))
    })

    // l. Re-add triggers
    t.triggers.modified.forEach(tr => {
      statements.push(createTrigger(t.name, tr.to))
    })
    t.triggers.added.forEach(tr => {
      statements.push(createTrigger(t.name, tr))
    })
  })

  // 7. Drop removed tables
  report.tables.removed.forEach(t => {
    statements.push(deleteTable(t.name))
  })

  // 8. Update views
  report.views.modified.forEach(v => {
    statements.push(updateView(v.to))
  })

  // 9. Create new views
  report.views.added.forEach(v => {
    statements.push(createView(v))
  })

  return statements
}
```

**Why This Order?**:

1. **Views first (drop)**: Views depend on tables, must drop first
2. **Enums next**: Tables may use enum types
3. **Tables**: Create new tables
4. **FK/Constraints drop before column changes**: Can't modify columns with active FKs
5. **Column operations**: Drop, then add, then alter
6. **Constraints/FKs re-add after columns**: Need columns to exist
7. **Tables last (drop)**: Drop unused tables
8. **Views last (create)**: Recreate views after table changes

### 2. New Schema Generation

**File**: `src/schema/push/new.ts`

```typescript
export function generatePushNewSchema(schema: LocalSchema): string[]
```

**Purpose**: Generate SQL to create a schema from scratch.

**Algorithm**:

```typescript
export function generatePushNewSchema(schema: LocalSchema): string[] {
  const statements: string[] = []

  // 1. Create enums
  schema.enums?.forEach(e => {
    statements.push(...createEnum(e))
  })

  // 2. Create tables
  schema.tables?.forEach(t => {
    statements.push(...createTable(t))
  })

  // 3. Create views
  schema.views?.forEach(v => {
    statements.push(...createView(v))
  })

  return statements
}
```

**Simpler than diff**: No need to worry about order within tables since there's no existing data.

### 3. SQL Generators

**File**: `src/schema/push/generators.ts`

Contains individual functions for generating each type of SQL statement.

**Table Operations**:

```typescript
export function createTable(table: TableDefinition): string[] {
  const statements: string[] = []

  // CREATE TABLE with columns
  let sql = `CREATE TABLE "${table.name}" (\n`
  const columnDefs = table.columns.map(c => {
    let def = `  "${c.name}" ${c.data_type}`
    if (!c.is_nullable) def += ' NOT NULL'
    if (c.default) def += ` DEFAULT ${c.default}`
    // ... handle identity, generated columns
    return def
  })
  sql += columnDefs.join(',\n')
  sql += '\n);'
  statements.push(sql)

  // Add constraints
  table.constraints?.forEach(c => {
    statements.push(...createConstraint(table.name, c))
  })

  // Add indexes
  table.indexes?.forEach(i => {
    statements.push(...createIndex(table.name, i))
  })

  // Add foreign keys
  table.foreign_keys?.forEach(fk => {
    statements.push(...createForeignKey(table.name, fk))
  })

  return statements
}

export function deleteTable(name: string): string[] {
  return [`DROP TABLE IF EXISTS "${name}";`]
}
```

**Column Operations**:

```typescript
export function createColumn(
  tableName: string,
  column: ColumnDefinition
): string[] {
  let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${column.data_type}`
  if (!column.is_nullable) sql += ' NOT NULL'
  if (column.default) sql += ` DEFAULT ${column.default}`
  return [sql + ';']
}

export function deleteColumn(tableName: string, columnName: string): string[] {
  return [`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`]
}

export function updateColumn(
  tableName: string,
  from: ColumnDefinition,
  to: ColumnDefinition
): string[] {
  const statements: string[] = []

  // Type change
  if (from.data_type !== to.data_type) {
    statements.push(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${to.name}" TYPE ${to.data_type};`
    )
  }

  // Nullable change
  if (from.is_nullable !== to.is_nullable) {
    const action = to.is_nullable ? 'DROP NOT NULL' : 'SET NOT NULL'
    statements.push(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${to.name}" ${action};`
    )
  }

  // Default change
  if (from.default !== to.default) {
    if (to.default === null) {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${to.name}" DROP DEFAULT;`
      )
    } else {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${to.name}" SET DEFAULT ${to.default};`
      )
    }
  }

  return statements
}
```

**Constraint Operations**:

```typescript
export function createConstraint(
  tableName: string,
  constraint: ConstraintDefinition
): string[] {
  return [`ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraint.name}" ${constraint.definition};`]
}

export function deleteConstraint(
  tableName: string,
  constraintName: string
): string[] {
  return [`ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`]
}
```

**Index Operations**:

```typescript
export function createIndex(
  tableName: string,
  index: IndexDefinition
): string[] {
  // Use the full definition from the database
  return [index.definition + ';']
}

export function deleteIndex(indexName: string): string[] {
  return [`DROP INDEX IF EXISTS "${indexName}";`]
}
```

**Enum Operations**:

```typescript
export function createEnum(e: EnumDefinition): string[] {
  const values = e.values.map(v => `'${v}'`).join(', ')
  return [`CREATE TYPE "${e.name}" AS ENUM (${values});`]
}

export function deleteEnum(name: string): string[] {
  return [`DROP TYPE IF EXISTS "${name}";`]
}

export function updateEnum(
  from: EnumDefinition,
  to: EnumDefinition
): string[] {
  const statements: string[] = []

  // Add new values
  const newValues = to.values.filter(v => !from.values.includes(v))
  newValues.forEach(v => {
    statements.push(
      `ALTER TYPE "${to.name}" ADD VALUE '${v}';`
    )
  })

  // Note: Can't remove enum values in Postgres
  // Need to recreate type (complex, not implemented)

  return statements
}
```

---

## CLI Tool

**File**: `src/bin/main.ts`

### Command: diff-report

```bash
postgres-schema-tools diff-report <dbA> <dbB> [options]
```

**Arguments**:
- `<dbA>` - First database connection URL
- `<dbB>` - Second database connection URL

**Options**:
- `--out-dir <dir>` - Output directory for reports (optional)
- `--fail-on-changes` - Exit with code 1 if differences found (for CI)

**Behavior**:

1. **With `--out-dir`**:
   ```bash
   postgres-schema-tools diff-report \
     "postgres://localhost/prod" \
     "postgres://localhost/staging" \
     --out-dir ./schema-report
   ```

   Creates:
   - `schema-report/schema1.json` - Full schema A (formatted)
   - `schema-report/schema2.json` - Full schema B (formatted)
   - `schema-report/report.json` - JsonReport (formatted)
   - `schema-report/report.md` - Markdown report (human-readable)

2. **Without `--out-dir`**:
   ```bash
   postgres-schema-tools diff-report \
     "postgres://localhost/prod" \
     "postgres://localhost/staging"
   ```

   Prints markdown report to stdout.

3. **With `--fail-on-changes`** (CI mode):
   ```bash
   postgres-schema-tools diff-report \
     "$PROD_URL" "$STAGING_URL" \
     --out-dir ./report \
     --fail-on-changes
   ```

   Exit codes:
   - `0` - No changes detected
   - `1` - Changes detected (or error occurred)

**Implementation**:

```typescript
program
  .command('diff-report')
  .argument('<dbA>', 'The first url to compare.')
  .argument('<dbB>', 'The second url schema to compare.')
  .option('--out-dir <dir>', 'The output directory for the report.')
  .option('--fail-on-changes', 'Exit with non-zero if changes.', false)
  .action(async (db1Url, db2Url, opts) => {
    const db1 = postgres(db1Url)
    const db2 = postgres(db2Url)

    try {
      const schema1 = await fetchSchemaPostgresSQL(db1)
      const schema2 = await fetchSchemaPostgresSQL(db2)
      const jsonReport = createJsonDiffReport(schema1, schema2)

      if (opts.outDir) {
        await mkdir(opts.outDir, { recursive: true })
        await writeFile(`${opts.outDir}/schema1.json`, JSON.stringify(schema1, null, 2))
        await writeFile(`${opts.outDir}/schema2.json`, JSON.stringify(schema2, null, 2))
        await writeFile(`${opts.outDir}/report.json`, JSON.stringify(jsonReport, null, 2))
        await writeFile(`${opts.outDir}/report.md`, createMarkdownReport(jsonReport))
      } else {
        console.log(createMarkdownReport(jsonReport))
      }

      if (jsonReport.has_changes && opts.failOnChanges) {
        process.exit(1)
      }
    } finally {
      await db1.end()
      await db2.end()
    }
  })
```

**CI Integration Example**:

```yaml
# .github/workflows/schema-check.yaml
name: Schema Check
on: [pull_request]

jobs:
  check-schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install

      - name: Compare schemas
        run: |
          pnpm postgres-schema-tools diff-report \
            "${{ secrets.PROD_DATABASE_URL }}" \
            "${{ secrets.STAGING_DATABASE_URL }}" \
            --out-dir ./schema-diff \
            --fail-on-changes

      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: schema-diff
          path: ./schema-diff/
```

---

## API Reference

### Exports

**Main exports** (`src/index.ts`):

```typescript
// Schema fetching
export { fetchSchemaPostgresSQL, fetchSchemaPgLite } from './schema/remote'
export { fetchSchemaDrizzleORM } from './schema/drizzle'

// SQL generation
export { generatePushNewSchema } from './schema/push/new'
export { generatePushDiffSchema } from './schema/push/diff'

// Reporting
export { createJsonDiffReport } from './report/json'
export { createMarkdownReport } from './report/markdown'

// Database utilities
export { createLocalDatabase } from './db'

// Types
export type { RemoteSchema, TableDefinition, ColumnDefinition } from './schema/remote'
export type { LocalSchema } from './schema/local'
export type { JsonReport, Difference, TableModification } from './report'
```

### fetchSchemaPostgresSQL

```typescript
function fetchSchemaPostgresSQL(
  client: Sql,                      // from 'postgres' package
  options?: QuerySchemaOptions
): Promise<RemoteSchema>
```

**Options**:
```typescript
interface QuerySchemaOptions {
  ignore?: {
    views?: string[]         // View names to exclude
    tables?: string[]        // Table names to exclude
    indexes?: string[]       // Index names to exclude
    constraints?: string[]   // Constraint names to exclude
  }
}
```

**Example**:
```typescript
import postgres from 'postgres'
import { fetchSchemaPostgresSQL } from '@robot.com/postgres-schema-tools'

const sql = postgres(process.env.DATABASE_URL!)

const schema = await fetchSchemaPostgresSQL(sql, {
  ignore: {
    tables: ['_drizzle_migrations'],
    views: ['pg_stat_statements']
  }
})

await sql.end()
```

### fetchSchemaPgLite

```typescript
function fetchSchemaPgLite(
  client: PGlite,                   // from '@electric-sql/pglite'
  options?: QuerySchemaOptions
): Promise<RemoteSchema>
```

**Example**:
```typescript
import { PGlite } from '@electric-sql/pglite'
import { fetchSchemaPgLite } from '@robot.com/postgres-schema-tools'

const client = new PGlite()
await client.exec(`CREATE TABLE users (id serial, name text);`)

const schema = await fetchSchemaPgLite(client)
await client.close()
```

### fetchSchemaDrizzleORM

```typescript
function fetchSchemaDrizzleORM(
  schema: Record<string, unknown>
): LocalSchema
```

**Example**:
```typescript
import { pgTable, serial, text } from 'drizzle-orm/pg-core'
import { fetchSchemaDrizzleORM } from '@robot.com/postgres-schema-tools'

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull()
})

const localSchema = fetchSchemaDrizzleORM({ users })
```

### generatePushNewSchema

```typescript
function generatePushNewSchema(
  schema: LocalSchema
): string[]
```

**Returns**: Array of SQL statements.

**Example**:
```typescript
import { generatePushNewSchema } from '@robot.com/postgres-schema-tools'

const localSchema: LocalSchema = {
  enums: [{ name: 'status', values: ['active', 'inactive'] }],
  tables: [{
    name: 'users',
    columns: [
      { name: 'id', data_type: 'serial' },
      { name: 'status', data_type: 'status', default: "'active'" }
    ],
    constraints: [
      { name: 'users_pkey', type: 'PRIMARY KEY', columns: ['id'] }
    ]
  }]
}

const statements = generatePushNewSchema(localSchema)
// Execute statements in order
for (const sql of statements) {
  await db.execute(sql)
}
```

### generatePushDiffSchema

```typescript
function generatePushDiffSchema(
  oldSchema: RemoteSchema,
  newSchema: RemoteSchema
): string[][]
```

**Returns**: Array of batches (each batch is `string[]`).

**Example**:
```typescript
import { generatePushDiffSchema } from '@robot.com/postgres-schema-tools'

const oldSchema = await fetchSchemaPostgresSQL(prodDb)
const newSchema = await fetchSchemaPostgresSQL(stagingDb)

const batches = generatePushDiffSchema(oldSchema, newSchema)

// Execute each batch as a transaction
for (const batch of batches) {
  await db.begin(async (tx) => {
    for (const sql of batch) {
      await tx.execute(sql)
    }
  })
}
```

### createJsonDiffReport

```typescript
function createJsonDiffReport(
  schemaA: RemoteSchema,
  schemaB: RemoteSchema
): JsonReport
```

**Example**:
```typescript
import { createJsonDiffReport } from '@robot.com/postgres-schema-tools'

const schema1 = await fetchSchemaPostgresSQL(db1)
const schema2 = await fetchSchemaPostgresSQL(db2)

const report = createJsonDiffReport(schema1, schema2)

console.log('Has changes:', report.has_changes)
console.log('Tables added:', report.tables.added.length)
console.log('Tables modified:', report.tables.modified.length)
```

### createMarkdownReport

```typescript
function createMarkdownReport(
  report: JsonReport
): string
```

**Example**:
```typescript
import { createMarkdownReport } from '@robot.com/postgres-schema-tools'

const jsonReport = createJsonDiffReport(schema1, schema2)
const markdown = createMarkdownReport(jsonReport)

console.log(markdown)
// Or write to file
await writeFile('schema-changes.md', markdown)
```

### createLocalDatabase

```typescript
function createLocalDatabase(config?: {
  extensions?: string[]
}): Promise<{
  $client: PGlite
  close: () => Promise<void>
}>
```

**Example**:
```typescript
import { createLocalDatabase } from '@robot.com/postgres-schema-tools'

const db = await createLocalDatabase({
  extensions: ['pg_trgm', 'uuid-ossp']
})

// Use the database
await db.$client.exec('CREATE TABLE test (id serial);')

// Clean up
await db.close()
```

---

## Implementation Details

### The 426-Line SQL Query

**Location**: `src/schema/remote/query.ts`

**Purpose**: Single query that extracts the entire public schema as JSON.

**Structure**:

```sql
WITH
  -- CTE 1: Enums
  enums AS (
    SELECT
      t.typname AS enum_name,
      obj_description(t.oid, 'pg_type') AS description,
      jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS "values"
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE typnamespace = 'public'::regnamespace
    GROUP BY t.typname, t.oid
  ),

  -- CTE 2: Views
  views AS (
    SELECT
      v.table_name AS view_name,
      v.view_definition AS definition,
      obj_description(c.oid, 'pg_class') AS description
    FROM information_schema.views v
    JOIN pg_catalog.pg_class c ON c.relname = v.table_name
    WHERE v.table_schema = 'public'
  ),

  -- CTE 3: Table columns with full details
  table_columns AS (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'description', d.description,
          'position', c.ordinal_position,
          'data_type', c.data_type,
          -- ... 10+ more fields
        ) ORDER BY c.ordinal_position
      ) AS columns
    FROM information_schema.columns c
    LEFT JOIN pg_catalog.pg_description d ON ...
    WHERE c.table_schema = 'public'
    GROUP BY c.table_name
  ),

  -- CTE 4: Constraints
  table_constraints AS (
    SELECT
      rel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name', con.conname,
          'type', CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
          END,
          'definition', pg_get_constraintdef(con.oid),
          'columns', [...]
        )
      ) AS constraints
    FROM pg_catalog.pg_constraint con
    WHERE con.contype IN ('p', 'u', 'c')
    GROUP BY rel.relname
  ),

  -- CTE 5: Index columns (pre-aggregate)
  index_columns AS (
    SELECT
      i.indexrelid AS index_oid,
      jsonb_agg(
        jsonb_build_object(
          'name', a.attname,
          'sort_order', CASE WHEN (ix.option & 1) <> 0 THEN 'DESC' ELSE 'ASC' END,
          'nulls_order', ...
        ) ORDER BY ix.ord
      ) AS columns
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey, i.indoption) WITH ORDINALITY AS ix
    GROUP BY i.indexrelid
  ),

  -- CTE 6: Indexes
  detailed_indexes AS (
    SELECT
      tc.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name', ic.relname,
          'definition', pg_get_indexdef(ic.oid),
          'is_unique', i.indisunique,
          'index_type', am.amname,
          'columns', idx_cols.columns,
          -- ...
        )
      ) AS indexes
    FROM pg_class tc
    JOIN pg_index i ON tc.oid = i.indrelid
    LEFT JOIN index_columns idx_cols ON idx_cols.index_oid = ic.oid
    GROUP BY tc.relname
  ),

  -- CTE 7: Foreign keys
  foreign_keys AS (
    SELECT
      conrel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name', con.conname,
          'columns', [...],
          'foreign_table', confrel.relname,
          'foreign_columns', [...],
          'on_update', ...,
          'on_delete', ...
        )
      ) AS foreign_keys
    FROM pg_constraint con
    WHERE con.contype = 'f'
    GROUP BY conrel.relname
  ),

  -- CTE 8: Triggers
  table_triggers AS (
    SELECT
      rel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name', tg.tgname,
          'timing', CASE ... END,
          'event', ...,
          'definition', pg_get_triggerdef(tg.oid)
        )
      ) AS triggers
    FROM pg_trigger tg
    WHERE NOT tg.tgisinternal
    GROUP BY rel.relname
  ),

  -- CTE 9: Assemble tables
  tables_json AS (
    SELECT
      t.table_name,
      jsonb_build_object(
        'name', t.table_name,
        'description', d.description,
        'columns', COALESCE(tc.columns, '[]'::jsonb),
        'constraints', COALESCE(tcon.constraints, '[]'::jsonb),
        'indexes', COALESCE(ti.indexes, '[]'::jsonb),
        'foreign_keys', COALESCE(fk.foreign_keys, '[]'::jsonb),
        'triggers', COALESCE(tr.triggers, '[]'::jsonb)
      ) AS table_data
    FROM information_schema.tables t
    LEFT JOIN table_columns tc ON ...
    LEFT JOIN table_constraints tcon ON ...
    LEFT JOIN detailed_indexes ti ON ...
    LEFT JOIN foreign_keys fk ON ...
    LEFT JOIN table_triggers tr ON ...
    WHERE t.table_type = 'BASE TABLE'
  )

-- Final assembly
SELECT
  jsonb_build_object(
    'schema', 'public',
    'generated_at', NOW(),
    'enums', COALESCE((SELECT jsonb_agg(...) FROM enums), '[]'::jsonb),
    'views', COALESCE((SELECT jsonb_agg(...) FROM views), '[]'::jsonb),
    'tables', COALESCE((SELECT jsonb_agg(tj.table_data) FROM tables_json tj), '[]'::jsonb)
  ) AS public_schema_json;
```

**Performance**:
- Single query = one database round-trip
- Uses CTEs for clarity and Postgres query optimization
- Typically executes in <500ms for schemas with 100+ tables

**Key Functions Used**:
- `obj_description()` - Get comments/descriptions
- `pg_get_constraintdef()` - Get constraint definition SQL
- `pg_get_indexdef()` - Get index definition SQL
- `pg_get_triggerdef()` - Get trigger definition SQL
- `pg_get_expr()` - Decompile internal expressions
- `jsonb_agg()` - Aggregate rows into JSON arrays
- `jsonb_build_object()` - Build JSON objects

### Handling Drizzle SQL Objects

Drizzle ORM uses `SQL<string>` objects for complex expressions like defaults. To extract actual SQL:

```typescript
import { PgDialect } from 'drizzle-orm/pg-core'

const pgDialect = new PgDialect()

function unwrapSql(value: unknown): string {
  if (is(value, SQL)) {
    // Compile to { sql: string, params: any[] }
    const compiled = pgDialect.sqlToQuery(value)

    // Replace $1, $2, ... with actual values
    let sqlString = compiled.sql
    compiled.params.forEach((param, index) => {
      const placeholder = `$${index + 1}`
      let paramValue = formatParam(param)
      sqlString = sqlString.replace(placeholder, paramValue)
    })

    return sqlString
  }

  // Fallback for primitives
  return String(value)
}
```

**Why needed?**
- Drizzle represents SQL as AST (Abstract Syntax Tree)
- `sql\`now()\`` is not a string, it's an SQL object
- Need official compiler to convert to actual SQL string

### Column Diff Ignoring Position

```typescript
function diffSimpleColumns<T extends { name: string }>(
  listA: T[],
  listB: T[]
): { added, removed, modified } {
  const { added, removed, common } = diffByName(listA, listB)
  const modified: Difference<T>[] = []

  for (const { itemA, itemB } of common) {
    // Remove position before comparison
    const itemANoPos = { ...itemA, position: undefined }
    const itemBNoPos = { ...itemB, position: undefined }

    if (JSON.stringify(itemANoPos) !== JSON.stringify(itemBNoPos)) {
      modified.push({ from: itemA, to: itemB })
    }
  }

  return { added, removed, modified }
}
```

**Why?**
- Column order doesn't affect queries in Postgres
- `ALTER TABLE ADD COLUMN` always adds to end anyway
- Avoid unnecessary migrations for column reordering

### Constraint Index Filtering

```typescript
// Filter out indexes created by constraints
const filteredIndexes = table.indexes.filter(
  idx => !idx.is_constraint_index
)
```

**Why?**
- PRIMARY KEY and UNIQUE constraints auto-create indexes
- These indexes are managed by their constraints
- Including them would cause:
  ```sql
  ALTER TABLE users DROP CONSTRAINT users_pkey;  -- Drops index too
  DROP INDEX users_pkey;                          -- Error: doesn't exist
  ```

---

## Testing Strategy

### Test Files

1. **`fetch.test.ts`** - Schema fetching
2. **`drizzle.test.ts`** - Drizzle ORM integration
3. **`drizzle-vs-db-fetch.test.ts`** - Consistency checks
4. **`push-new.test.ts`** - New schema SQL generation
5. **`push-diff.test.ts`** - Migration SQL generation

### Test Infrastructure

**All tests use PGlite** (no Docker, no external Postgres):

```typescript
import { test } from 'node:test'
import { createLocalDatabase, fetchSchemaPgLite } from '../index'

test('fetch basic schema', async () => {
  const db = await createLocalDatabase()

  await db.$client.exec(`
    CREATE TABLE users (
      id serial PRIMARY KEY,
      name text NOT NULL
    );
  `)

  const schema = await fetchSchemaPgLite(db.$client)

  assert.strictEqual(schema.tables.length, 1)
  assert.strictEqual(schema.tables[0].name, 'users')

  await db.close()
})
```

### Running Tests

```bash
# Run all tests
pnpm --filter @robot.com/postgres-schema-tools test

# With environment variables
node --env-file .env --import tsx --test ./src/**/*.test.ts
```

### Test Coverage

**Schema Fetching**:
- ✅ Tables with columns
- ✅ Primary keys
- ✅ Foreign keys
- ✅ Unique constraints
- ✅ Check constraints
- ✅ Indexes (btree, unique, partial)
- ✅ Triggers
- ✅ Views
- ✅ Enums
- ✅ Comments/descriptions

**Drizzle Integration**:
- ✅ Basic table definitions
- ✅ Primary keys
- ✅ Foreign keys
- ✅ Unique constraints
- ✅ Indexes
- ✅ Enums
- ✅ Default values (SQL objects)

**SQL Generation**:
- ✅ CREATE TABLE statements
- ✅ ALTER TABLE ADD COLUMN
- ✅ ALTER TABLE DROP COLUMN
- ✅ ALTER TABLE ALTER COLUMN
- ✅ Constraint management
- ✅ Index management
- ✅ Foreign key management
- ✅ View management
- ✅ Enum management

**Diff Engine**:
- ✅ Detect added/removed tables
- ✅ Detect added/removed columns
- ✅ Detect column type changes
- ✅ Detect constraint changes
- ✅ Detect index changes
- ✅ Ignore column position changes
- ✅ Filter constraint indexes

---

## Use Cases & Patterns

### Use Case 1: Schema Validation in CI

**Goal**: Ensure staging and production schemas match.

```typescript
// scripts/validate-schema.ts
import { fetchSchemaPostgresSQL, createJsonDiffReport } from '@robot.com/postgres-schema-tools'
import postgres from 'postgres'

const prod = postgres(process.env.PROD_DATABASE_URL!)
const staging = postgres(process.env.STAGING_DATABASE_URL!)

const prodSchema = await fetchSchemaPostgresSQL(prod, {
  ignore: {
    tables: ['_drizzle_migrations', '_internal_stats']
  }
})

const stagingSchema = await fetchSchemaPostgresSQL(staging)

const report = createJsonDiffReport(prodSchema, stagingSchema)

if (report.has_changes) {
  console.error('Schema mismatch detected!')
  console.error(`Tables added: ${report.tables.added.length}`)
  console.error(`Tables removed: ${report.tables.removed.length}`)
  console.error(`Tables modified: ${report.tables.modified.length}`)
  process.exit(1)
}

console.log('✅ Schemas match!')

await prod.end()
await staging.end()
```

**CI Integration**:

```yaml
# .github/workflows/schema-validation.yaml
- name: Validate schemas
  run: tsx scripts/validate-schema.ts
  env:
    PROD_DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
    STAGING_DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

### Use Case 2: Generate Migration from Drizzle

**Goal**: Update production database to match Drizzle schema.

```typescript
// scripts/migrate-from-drizzle.ts
import {
  fetchSchemaPostgresSQL,
  fetchSchemaDrizzleORM,
  generatePushDiffSchema
} from '@robot.com/postgres-schema-tools'
import { localToRemoteSchema } from '@robot.com/postgres-schema-tools/schema/local'
import postgres from 'postgres'
import * as schema from './db/schema'

const db = postgres(process.env.DATABASE_URL!)

// Get current database schema
const currentSchema = await fetchSchemaPostgresSQL(db)

// Get desired schema from Drizzle
const localSchema = fetchSchemaDrizzleORM(schema)
const desiredSchema = localToRemoteSchema(localSchema)

// Generate migration
const batches = generatePushDiffSchema(currentSchema, desiredSchema)

console.log('Migration plan:')
batches.forEach((batch, i) => {
  console.log(`\nBatch ${i + 1}:`)
  batch.forEach(sql => console.log(sql))
})

// Confirm before executing
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
} else {
  console.log('Migration cancelled.')
}

await db.end()
```

### Use Case 3: Local Development with PGlite

**Goal**: Test schema changes locally without Docker.

```typescript
// tests/schema-migrations.test.ts
import { test } from 'node:test'
import {
  createLocalDatabase,
  fetchSchemaPgLite,
  generatePushDiffSchema
} from '@robot.com/postgres-schema-tools'

test('add column migration', async () => {
  const db = await createLocalDatabase()

  // Initial schema
  await db.$client.exec(`
    CREATE TABLE users (
      id serial PRIMARY KEY,
      name text NOT NULL
    );
  `)

  const v1 = await fetchSchemaPgLite(db.$client)

  // Add column
  await db.$client.exec(`
    ALTER TABLE users ADD COLUMN email text;
  `)

  const v2 = await fetchSchemaPgLite(db.$client)

  // Generate migration
  const batches = generatePushDiffSchema(v1, v2)

  // Verify migration SQL
  assert.strictEqual(batches.length, 1)
  assert(batches[0][0].includes('ADD COLUMN "email"'))

  await db.close()
})
```

### Use Case 4: Document Schema Changes

**Goal**: Generate human-readable documentation of schema changes for PRs.

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
const markdown = createMarkdownReport(jsonReport)

await writeFile('./schema-changes.md', markdown)

console.log('Schema changes documented in schema-changes.md')

await main.end()
await branch.end()
```

**GitHub Action to post to PR**:

```yaml
- name: Generate schema report
  run: tsx scripts/document-schema-changes.ts

- name: Comment on PR
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require('fs')
      const report = fs.readFileSync('./schema-changes.md', 'utf8')
      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: `## Database Schema Changes\n\n${report}`
      })
```

### Use Case 5: Automated Backfill After Migration

**Goal**: Run data migrations after schema changes.

```typescript
// scripts/migrate-with-backfill.ts
import {
  fetchSchemaPostgresSQL,
  generatePushDiffSchema
} from '@robot.com/postgres-schema-tools'
import postgres from 'postgres'

const db = postgres(process.env.DATABASE_URL!)

const oldSchema = await fetchSchemaPostgresSQL(db)

// Apply schema changes from code
// (e.g., run Drizzle migrations)
await applyDrizzleMigrations()

const newSchema = await fetchSchemaPostgresSQL(db)
const batches = generatePushDiffSchema(oldSchema, newSchema)

// Check if specific column was added
const report = createJsonDiffReport(oldSchema, newSchema)
const usersTable = report.tables.modified.find(t => t.name === 'users')
const emailAdded = usersTable?.columns.added.find(c => c.name === 'email')

if (emailAdded) {
  console.log('Email column added, running backfill...')

  // Backfill data
  await db`
    UPDATE users
    SET email = name || '@example.com'
    WHERE email IS NULL
  `

  console.log('Backfill complete!')
}

await db.end()
```

---

## Limitations & Future Work

### Current Limitations

1. **No Rollback Generation**
   - Only generates forward migrations (old → new)
   - No automatic rollback SQL generation
   - **Workaround**: Generate diff in reverse (new → old)

2. **Enum Value Removal**
   - Cannot remove values from existing enums
   - Postgres limitation: requires type recreation
   - **Workaround**: Manual migration with type replacement

3. **No Data Migrations**
   - Only generates DDL (schema changes)
   - No data transformations or backfills
   - **Workaround**: Detect changes and write custom scripts

4. **Column Reordering Not Supported**
   - Cannot change column order
   - Postgres limitation: would require table recreation
   - **Behavior**: Ignores position changes entirely

5. **Materialized Views Not Fully Supported**
   - Treated like regular views
   - Refresh strategy not captured
   - **Future**: Add materialized view handling

6. **No Partitioned Tables**
   - Partition info not captured
   - **Future**: Add partition introspection

7. **No Table Inheritance**
   - Postgres table inheritance not supported
   - **Future**: Add inheritance tracking

8. **Limited Drizzle Support**
   - Some Drizzle features not mapped
   - Custom types may not convert correctly
   - **Future**: Improve Drizzle mapping

9. **No Schema Versioning**
   - No built-in version tracking
   - No migration history table
   - **Future**: Add migration tracking

10. **Public Schema Only**
    - Only inspects `public` schema
    - Other schemas ignored
    - **Future**: Add multi-schema support

### Planned Features

**Near-Term (v0.1.0 - Production Ready)**:
- [ ] Mark package as production-ready
- [ ] Comprehensive documentation
- [ ] More test coverage
- [ ] Better error messages
- [ ] Migration validation (dry-run)

**Medium-Term (v0.2.0)**:
- [ ] Rollback SQL generation
- [ ] Materialized view support
- [ ] Partitioned table support
- [ ] Migration history tracking
- [ ] Multi-schema support
- [ ] Improved Drizzle mapping

**Long-Term (v1.0.0)**:
- [ ] Data migration framework
- [ ] Visual schema diffing (web UI)
- [ ] Schema versioning system
- [ ] Migration testing framework
- [ ] Performance optimization for large schemas
- [ ] Support for other ORMs (Prisma, TypeORM)

### Known Issues

1. **Large Schema Performance**
   - 426-line query can be slow on very large databases (1000+ tables)
   - **Mitigation**: Use ignore lists to reduce scope

2. **JSON Comparison Limitations**
   - Uses `JSON.stringify()` for deep equality
   - Doesn't handle object key ordering differences
   - **Impact**: Minimal in practice for schema objects

3. **Complex Enum Changes**
   - Cannot handle enum value reordering
   - Cannot handle enum value renaming
   - **Mitigation**: Recreate enum (manual migration)

4. **Trigger Definition Parsing**
   - Stores full `CREATE TRIGGER` statement
   - Hard to compare semantic equivalence
   - **Impact**: Any trigger change requires drop/recreate

---

## Appendix A: Type Definitions Reference

### Complete Type Hierarchy

```
RemoteSchema
├── schema: string
├── generated_at: string
├── enums: EnumDefinition[]
│   ├── name: string
│   ├── description: string | null
│   └── values: string[]
├── views: ViewDefinition[]
│   ├── name: string
│   ├── description: string | null
│   └── definition: string
└── tables: TableDefinition[]
    ├── name: string
    ├── description: string | null
    ├── columns: ColumnDefinition[]
    │   ├── name: string
    │   ├── description: string | null
    │   ├── position: number
    │   ├── data_type: string
    │   ├── is_nullable: boolean
    │   ├── default: string | null
    │   ├── is_generated: boolean
    │   ├── generation_expression: string | null
    │   ├── is_identity: boolean
    │   ├── identity_generation: 'ALWAYS' | 'BY DEFAULT' | null
    │   ├── max_length: number | null
    │   ├── numeric_precision: number | null
    │   ├── numeric_scale: number | null
    │   └── udt_name: string
    ├── constraints: ConstraintDefinition[]
    │   ├── name: string
    │   ├── description: string | null
    │   ├── type: 'PRIMARY KEY' | 'UNIQUE' | 'CHECK'
    │   ├── definition: string
    │   ├── columns: string[]
    │   ├── check_predicate: string | null
    │   └── nulls_not_distinct: boolean
    ├── indexes: IndexDefinition[]
    │   ├── name: string
    │   ├── description: string | null
    │   ├── definition: string
    │   ├── is_constraint_index: boolean
    │   ├── is_unique: boolean
    │   ├── nulls_not_distinct: boolean | null
    │   ├── is_valid: boolean
    │   ├── index_type: string
    │   ├── columns: IndexColumn[]
    │   │   ├── name: string
    │   │   ├── sort_order: 'ASC' | 'DESC'
    │   │   └── nulls_order: 'NULLS FIRST' | 'NULLS LAST'
    │   └── predicate: string | null
    ├── foreign_keys: ForeignKeyDefinition[]
    │   ├── name: string
    │   ├── description: string | null
    │   ├── columns: string[]
    │   ├── foreign_table: string
    │   ├── foreign_columns: string[]
    │   ├── on_update: ReferentialAction
    │   ├── on_delete: ReferentialAction
    │   └── match_option: MatchOption
    └── triggers: TriggerDefinition[]
        ├── name: string
        ├── description: string | null
        ├── timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF'
        ├── event: string
        ├── level: 'ROW' | 'STATEMENT'
        ├── function_schema: string
        ├── function_name: string
        └── definition: string
```

### Common Enums

```typescript
type ConstraintType = 'PRIMARY KEY' | 'UNIQUE' | 'CHECK'

type ReferentialAction =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT'

type MatchOption = 'FULL' | 'PARTIAL' | 'SIMPLE'

type SortOrder = 'ASC' | 'DESC'

type NullsOrder = 'NULLS FIRST' | 'NULLS LAST'

type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF'

type TriggerLevel = 'ROW' | 'STATEMENT'
```

---

## Appendix B: Example Outputs

### Example RemoteSchema JSON

```json
{
  "schema": "public",
  "generated_at": "2026-01-28T10:00:00.000Z",
  "enums": [
    {
      "name": "user_role",
      "description": "User role enum",
      "values": ["admin", "user", "guest"]
    }
  ],
  "views": [
    {
      "name": "active_users",
      "description": "View of active users",
      "definition": "SELECT * FROM users WHERE active = true;"
    }
  ],
  "tables": [
    {
      "name": "users",
      "description": "User accounts table",
      "columns": [
        {
          "name": "id",
          "description": null,
          "position": 1,
          "data_type": "integer",
          "is_nullable": false,
          "default": "nextval('users_id_seq'::regclass)",
          "is_generated": false,
          "generation_expression": null,
          "is_identity": false,
          "identity_generation": null,
          "max_length": null,
          "numeric_precision": 32,
          "numeric_scale": 0,
          "udt_name": "int4"
        },
        {
          "name": "email",
          "description": "User email address",
          "position": 2,
          "data_type": "character varying",
          "is_nullable": false,
          "default": null,
          "is_generated": false,
          "generation_expression": null,
          "is_identity": false,
          "identity_generation": null,
          "max_length": 255,
          "numeric_precision": null,
          "numeric_scale": null,
          "udt_name": "varchar"
        },
        {
          "name": "role",
          "description": null,
          "position": 3,
          "data_type": "user_role",
          "is_nullable": false,
          "default": "'user'::user_role",
          "is_generated": false,
          "generation_expression": null,
          "is_identity": false,
          "identity_generation": null,
          "max_length": null,
          "numeric_precision": null,
          "numeric_scale": null,
          "udt_name": "user_role"
        }
      ],
      "constraints": [
        {
          "name": "users_pkey",
          "description": null,
          "type": "PRIMARY KEY",
          "definition": "PRIMARY KEY (id)",
          "columns": ["id"],
          "check_predicate": null,
          "nulls_not_distinct": false
        },
        {
          "name": "users_email_key",
          "description": null,
          "type": "UNIQUE",
          "definition": "UNIQUE (email)",
          "columns": ["email"],
          "check_predicate": null,
          "nulls_not_distinct": false
        }
      ],
      "indexes": [
        {
          "name": "users_email_idx",
          "description": null,
          "definition": "CREATE INDEX users_email_idx ON users USING btree (email)",
          "is_constraint_index": false,
          "is_unique": false,
          "nulls_not_distinct": null,
          "is_valid": true,
          "index_type": "btree",
          "columns": [
            {
              "name": "email",
              "sort_order": "ASC",
              "nulls_order": "NULLS LAST"
            }
          ],
          "predicate": null
        }
      ],
      "foreign_keys": [],
      "triggers": []
    }
  ]
}
```

### Example JsonReport

```json
{
  "has_changes": true,
  "schemas": {
    "from": "public",
    "to": "public"
  },
  "generated_at": "2026-01-28T10:05:00.000Z",
  "enums": {
    "added": [],
    "removed": [],
    "modified": []
  },
  "views": {
    "added": [],
    "removed": [],
    "modified": []
  },
  "tables": {
    "added": [],
    "removed": [],
    "modified": [
      {
        "name": "users",
        "columns": {
          "added": [
            {
              "name": "phone",
              "data_type": "character varying",
              "is_nullable": true,
              "default": null,
              "max_length": 20
            }
          ],
          "removed": [],
          "modified": []
        },
        "constraints": {
          "added": [],
          "removed": [],
          "modified": []
        },
        "indexes": {
          "added": [
            {
              "name": "users_phone_idx",
              "is_unique": false,
              "index_type": "btree",
              "columns": [{"name": "phone", "sort_order": "ASC"}]
            }
          ],
          "removed": [],
          "modified": []
        },
        "foreign_keys": {
          "added": [],
          "removed": [],
          "modified": []
        },
        "triggers": {
          "added": [],
          "removed": [],
          "modified": []
        }
      }
    ]
  }
}
```

### Example Markdown Report

```markdown
# Database Schema Diff Report

**Generated:** 2026-01-28T10:05:00.000Z
**Schemas:** public → public
**Has Changes:** ✅ Yes

---

## Summary

- **Enums:** 0 added, 0 removed, 0 modified
- **Views:** 0 added, 0 removed, 0 modified
- **Tables:** 0 added, 0 removed, 1 modified

---

## Modified Tables

### Table: `users`

#### Added Columns

- **phone**
  - Type: `character varying(20)`
  - Nullable: Yes
  - Default: None

#### Added Indexes

- **users_phone_idx**
  - Type: btree
  - Unique: No
  - Columns: phone (ASC)
  - Predicate: None

---

**End of Report**
```

---

**END OF KNOWLEDGE BASE**

*This document represents a complete understanding of the postgres-schema-tools package as of 2026-01-28. Update as the codebase evolves.*
