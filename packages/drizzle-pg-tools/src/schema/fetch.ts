import type { PGlite } from '@electric-sql/pglite'
import type { Sql } from 'postgres'
import { extractSchemaSQLQuery } from './query'
import type { PublicSchema } from './types'

export type QuerySchemaOptions = {
    ignore?: {
        views?: string[]
        tables?: string[]
        indexes?: string[]
        constraints?: string[]
    }
}

export async function fetchSchemaPgLite(
    client: PGlite,
    options: QuerySchemaOptions = {}
): Promise<PublicSchema> {
    return removeIgnoredElements(
        await client
            .query<{ public_schema_json: PublicSchema }>(extractSchemaSQLQuery)
            .then((r) => r.rows[0]!.public_schema_json),
        options
    )
}

export async function fetchSchemaPostgresSQL(
    client: Sql,
    options: QuerySchemaOptions = {}
) {
    return removeIgnoredElements(
        await client
            .unsafe<{ public_schema_json: PublicSchema }[]>(
                extractSchemaSQLQuery
            )
            .then((r) => r[0]!.public_schema_json),
        options
    )
}

function removeIgnoredElements(
    schema: PublicSchema,
    options: QuerySchemaOptions
): PublicSchema {
    if (options.ignore?.views) {
        schema.views = schema.views.filter(
            (v) => !options.ignore!.views!.includes(v.name)
        )
    }

    if (options.ignore?.tables) {
        schema.tables = schema.tables.filter(
            (t) => !options.ignore!.tables!.includes(t.name)
        )
    }

    if (options.ignore?.indexes) {
        schema.tables.forEach((t) => {
            t.indexes = t.indexes.filter(
                (i) => !options.ignore!.indexes!.includes(i.name)
            )
        })
    }

    if (options.ignore?.constraints) {
        schema.tables.forEach((t) => {
            t.constraints = t.constraints.filter(
                (c) => !options.ignore!.constraints!.includes(c.name)
            )
        })
    }

    return schema
}
