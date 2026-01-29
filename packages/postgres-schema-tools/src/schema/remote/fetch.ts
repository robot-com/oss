import { PGlite } from '@electric-sql/pglite'
import type { Sql } from 'postgres'
import { extractSchemaSQLQuery } from './query'
import type { RemoteSchema } from './types'

export type QuerySchemaOptions = {
    ignore?: {
        views?: string[]
        tables?: string[]
        indexes?: string[]
        constraints?: string[]
    }
    /**
     * Normalize view definitions using PGLite.
     * This ensures consistent view formatting across different PostgreSQL versions.
     */
    normalizeViews?: boolean
}

export async function fetchSchemaPgLite(
    client: PGlite,
    options: QuerySchemaOptions = {},
): Promise<RemoteSchema> {
    let schema = removeIgnoredElements(
        await client
            .query<{ public_schema_json: RemoteSchema }>(extractSchemaSQLQuery)
            .then((r) => r.rows[0]!.public_schema_json),
        options,
    )

    if (options.normalizeViews) {
        schema = await normalizeSchemaViews(schema)
    }

    return schema
}

export async function fetchSchemaPostgresSQL(
    client: Sql,
    options: QuerySchemaOptions = {},
): Promise<RemoteSchema> {
    let schema = removeIgnoredElements(
        await client
            .unsafe<{ public_schema_json: RemoteSchema }[]>(
                extractSchemaSQLQuery,
            )
            .then((r) => r[0]!.public_schema_json),
        options,
    )

    if (options.normalizeViews) {
        schema = await normalizeSchemaViews(schema)
    }

    return schema
}

function removeIgnoredElements(
    schema: RemoteSchema,
    options: QuerySchemaOptions,
): RemoteSchema {
    if (options.ignore?.views) {
        schema.views = schema.views.filter(
            (v) => !options.ignore!.views!.includes(v.name),
        )
    }

    if (options.ignore?.tables) {
        schema.tables = schema.tables.filter(
            (t) => !options.ignore!.tables!.includes(t.name),
        )
    }

    if (options.ignore?.indexes) {
        schema.tables.forEach((t) => {
            t.indexes = t.indexes.filter(
                (i) => !options.ignore!.indexes!.includes(i.name),
            )
        })
    }

    if (options.ignore?.constraints) {
        schema.tables.forEach((t) => {
            t.constraints = t.constraints.filter(
                (c) => !options.ignore!.constraints!.includes(c.name),
            )
        })
    }

    return schema
}

/**
 * Normalizes view definitions in a schema using PGLite.
 * This creates stub tables and re-processes view definitions through
 * PostgreSQL's pg_get_viewdef() to ensure consistent formatting.
 */
export async function normalizeSchemaViews(
    schema: RemoteSchema,
): Promise<RemoteSchema> {
    if (!schema.views || schema.views.length === 0) {
        return schema
    }

    const pglite = new PGlite()
    try {
        // Create stub tables for all tables in the schema
        for (const table of schema.tables) {
            const columns = table.columns.map((c) => `"${c.name}" text`).join(', ')
            await pglite
                .query(`CREATE TABLE "${table.name}" (${columns || 'id text'})`)
                .catch(() => {})
        }

        // Normalize each view definition
        for (const view of schema.views) {
            if (view.definition) {
                const tempViewName = `_temp_${view.name}_${Date.now()}`
                try {
                    await pglite.query(
                        `CREATE VIEW ${tempViewName} AS ${view.definition}`,
                    )
                    const result = await pglite.query<{ def: string }>(
                        `SELECT pg_get_viewdef('${tempViewName}'::regclass, true) as def`,
                    )
                    view.definition = result.rows[0]?.def ?? view.definition
                } catch {
                    // Keep original definition if normalization fails
                } finally {
                    await pglite
                        .query(`DROP VIEW IF EXISTS ${tempViewName}`)
                        .catch(() => {})
                }
            }
        }
    } finally {
        await pglite.close()
    }

    return schema
}
