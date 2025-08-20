# Drizzle Postgres Tools

Tools for inspecting, diffing, and generating SQL for Postgres schemas — designed to work well with Drizzle ORM and local PGlite.

**Warning**: This package it is still in active development. Shouldn't be used in production yet.

## Features

- Schema fetchers
  - Fetch a full, structured JSON description of a Postgres schema
  - Works with both `postgres` (remote DB) and `@electric-sql/pglite` (embedded local DB)
- Schema diffs and reports
  - Produce a detailed JSON diff of two schemas
  - Render a human‑readable Markdown report
- SQL generators
  - Generate SQL to create a new schema from a LocalSchema definition
  - Generate ordered SQL batches to migrate from an old schema to a new one
- Handy test/local DB helper
  - Spin up a PGlite instance with `pg_trgm` enabled for fast local testing

## Installation

```bash
npm install @robot.com/postgres-schema-tools
# or
pnpm add @robot.com/postgres-schema-tools
# or
yarn add @robot.com/postgres-schema-tools
# or
bun add @robot.com/postgres-schema-tools
```

This package provides both a programmatic API and a CLI (`postgres-schema-tools`).

## CLI

Compare two databases and generate a report:

```bash
postgres-schema-tools diff-report \
  "postgres://user:pass@host:5432/db_one" \
  "postgres://user:pass@host:5432/db_two" \
  --out-dir ./schema-report \
  --fail-on-changes
```

- Arguments
  - <dbA> First Postgres URL to compare
  - <dbB> Second Postgres URL to compare
- Options
  - --out-dir <dir> Write `schema1.json`, `schema2.json`, `report.json`, and `report.md`
  - --fail-on-changes Exit non‑zero if any differences are detected

Without `--out-dir`, the Markdown report is printed to stdout.

## Programmatic API

Import from the package root for the most common APIs:

```ts
import {
  // Fetchers
  fetchSchemaPostgresSQL,
  fetchSchemaPgLite,
  // SQL generators
  generatePushNewSchema,
  generatePushDiffSchema,
  // Local testing helper
  createLocalDatabase,
  // Types
  type RemoteSchema,
  type LocalSchema,
} from "@robot.com/postgres-schema-tools";
```

### 1) Fetch schemas

Using a live Postgres instance (via `postgres`):

```ts
import postgres from "postgres";
import { fetchSchemaPostgresSQL } from "@robot.com/postgres-schema-tools";

const sql = postgres(process.env.DATABASE_URL!);
const schema = await fetchSchemaPostgresSQL(sql, {
  ignore: {
    views: ["some_materialized_view"],
    tables: ["_drizzle_migrations"],
    indexes: ["idx_large_temp"],
    constraints: ["old_check_constraint"],
  },
});
sql.end();
```

Using an embedded local DB for tests/dev (PGlite):

```ts
import {
  createLocalDatabase,
  fetchSchemaPgLite,
} from "@robot.com/postgres-schema-tools";

const db = await createLocalDatabase({});
const schema = await fetchSchemaPgLite(db.$client);
```

### 2) Diff and report

```ts
import {
  generatePushDiffSchema,
  type RemoteSchema,
} from "@robot.com/postgres-schema-tools";

function getMigrationBatches(a: RemoteSchema, b: RemoteSchema) {
  // Returns ordered SQL batches (string[][])
  // You can execute each inner array in a single transaction if desired.
  return generatePushDiffSchema(a, b);
}

// For a human‑readable summary, prefer the CLI:
// postgres-schema-tools diff-report "<dbA>" "<dbB>" [--out-dir ./report]
```

Note: The CLI renders a Markdown diff using the same underlying comparison algorithm. Programmatic access focuses on generating SQL via `generatePushDiffSchema`.

### 3) Generate SQL for a brand new schema

```ts
import {
  generatePushNewSchema,
  type LocalSchema,
} from "@robot.com/postgres-schema-tools";

const local: LocalSchema = {
  enums: [{ name: "status", values: ["active", "inactive"] }],
  tables: [
    {
      name: "users",
      columns: [
        {
          name: "id",
          data_type: "uuid",
          is_nullable: false,
          default: "gen_random_uuid()",
        },
        { name: "email", data_type: "text", is_nullable: false },
        {
          name: "status",
          data_type: "status",
          is_nullable: false,
          default: "'active'",
        },
      ],
      constraints: [
        { name: "users_pkey", type: "PRIMARY KEY", columns: ["id"] },
        { name: "users_email_key", type: "UNIQUE", columns: ["email"] },
      ],
      indexes: [{ name: "users_email_idx", columns: [{ name: "email" }] }],
    },
  ],
  views: [],
};

const statements: string[] = generatePushNewSchema(local);
// Execute these statements to create the schema
```

## Types

- Remote schema snapshot (from a live DB): `RemoteSchema`
- Local authoring model (what you want the DB to look like): `LocalSchema`

Both include rich details for enums, views, tables, columns, constraints, indexes, foreign keys, and triggers.

## Testing

Run the package tests:

```bash
pnpm --filter @robot.com/postgres-schema-tools test
```

The tests use PGlite under the hood and do not require a running Postgres server.

## Notes

- The SQL extraction targets the `public` schema and uses Postgres catalog queries tailored for modern PostgreSQL versions.
- `createLocalDatabase` wires up a PGlite instance with the `pg_trgm` extension enabled for convenience when testing full‑text or trigram indices.
- This package is still in active development. Shouldn't be used in production yet.

## License

MIT
