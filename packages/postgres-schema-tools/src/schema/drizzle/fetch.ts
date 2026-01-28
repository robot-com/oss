// drizzle/fetch.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: OK */

import { getTableColumns, getTableName, is, SQL } from 'drizzle-orm'
import {
    getTableConfig,
    isPgEnum,
    type PgColumn,
    PgDialect,
    PgTable,
} from 'drizzle-orm/pg-core'
import type { ReferentialAction } from '../common'
import type { LocalSchema, LocalTableDefinition } from '../local/types'

export type DrizzleColumnType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | 'json'
    | 'date'
    | 'bigint'
    | 'custom'
    | 'buffer'
    | 'dateDuration'
    | 'duration'
    | 'relDuration'
    | 'localTime'
    | 'localDate'
    | 'localDateTime'

/**
 * Maps Drizzle internal column type names (like 'PgNumeric', 'PgUUID') to PostgreSQL SQL types
 */
export function mapDrizzleColumnTypeToPostgres(columnType: string): string {
    // Handle array types first
    if (columnType.startsWith('PgArray')) {
        // Extract the element type from PgArray<PgInteger> format
        const match = columnType.match(/PgArray<(.+)>/)
        if (match) {
            const elementType = mapDrizzleColumnTypeToPostgres(match[1])
            return `${elementType}[]`
        }
        return 'text[]'
    }

    const typeMap: Record<string, string> = {
        // Text types
        PgText: 'text',
        PgVarchar: 'character varying',
        PgChar: 'character',

        // Numeric types
        PgSmallInt: 'smallint',
        PgInteger: 'integer',
        PgBigInt53: 'bigint',
        PgBigInt64: 'bigint',
        PgSerial: 'integer',
        PgBigSerial53: 'bigint',
        PgBigSerial64: 'bigint',
        PgReal: 'real',
        PgDoublePrecision: 'double precision',
        PgNumeric: 'numeric',
        PgDecimal: 'numeric',

        // Boolean
        PgBoolean: 'boolean',

        // Date/Time types
        PgTimestamp: 'timestamp without time zone',
        PgTimestampString: 'timestamp without time zone',
        PgDate: 'date',
        PgTime: 'time without time zone',
        PgInterval: 'interval',

        // UUID
        PgUUID: 'uuid',

        // JSON types
        PgJson: 'json',
        PgJsonb: 'jsonb',

        // Binary
        PgBytea: 'bytea',

        // Other types
        PgInet: 'inet',
        PgCidr: 'cidr',
        PgMacaddr: 'macaddr',
        PgMacaddr8: 'macaddr8',
    }

    return typeMap[columnType] || 'text'
}

export function mapDrizzleTypeToPostgres(type: DrizzleColumnType): string {
    switch (type) {
        case 'string':
            return 'text'
        case 'number':
            return 'integer'
        case 'boolean':
            return 'boolean'
        case 'array':
            return 'text[]'
        case 'json':
            return 'jsonb'
        case 'date':
            return 'timestamp'
        case 'bigint':
            return 'bigint'
        case 'custom':
            return 'unknown'
        case 'buffer':
            return 'bytea'
        case 'dateDuration':
        case 'duration':
        case 'relDuration':
            return 'interval'
        case 'localTime':
            return 'time'
        case 'localDate':
            return 'date'
        case 'localDateTime':
            return 'timestamp'
        default:
            throw new Error(`Unknown drizzle type: ${type}`)
    }
}

// Instantiate the Postgres Dialect to officially compile SQL objects
const pgDialect = new PgDialect()

/**
 * Uses the official PgDialect to compile a Drizzle SQL object into a string.
 */
function unwrapSql(value: unknown): string {
    if (is(value, SQL)) {
        // This compiles the SQL object into { sql: string, params: any[] }
        const compiled = pgDialect.sqlToQuery(value)

        let sqlString = compiled.sql

        // Simple parameter replacement for inspection purposes.
        // Drizzle outputs params as $1, $2, etc.
        // We replace them with the actual values for readability in schema dumps.
        // Note: This is a simplistic replacement strategy for display/diffing.
        compiled.params.forEach((param, index) => {
            const placeholder = `$${index + 1}`
            let paramValue = String(param)

            // Quote strings if needed
            if (typeof param === 'string') {
                paramValue = `'${param}'`
            }
            if (param instanceof Date) {
                paramValue = `'${param.toISOString()}'`
            }

            // Replace first occurrence of placeholder
            // (Standard replace works sequentially for indexed params)
            sqlString = sqlString.replace(placeholder, paramValue)
        })

        return sqlString
    }

    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (value instanceof Date) return `'${value.toISOString()}'`

    // Handle Arrays
    if (Array.isArray(value)) {
        const content = value
            .map((v) => {
                // strip quotes if unwrapSql added them, because we are wrapping in specific array format
                // This is a bit of a heuristic for this specific case
                const s = unwrapSql(v)
                if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1)
                return s
            })
            .join(',')
        return `'{${content}}'`
    }

    return String(value)
}

export function mapDefaultValueToSql(defaultValue: any): string {
    if (defaultValue === null || defaultValue === undefined) {
        return 'NULL'
    }

    if (is(defaultValue, SQL)) {
        return unwrapSql(defaultValue)
    }

    if (typeof defaultValue === 'string') {
        return `'${defaultValue.replace(/'/g, "''")}'`
    }

    if (typeof defaultValue === 'number') {
        return defaultValue.toString()
    }

    if (typeof defaultValue === 'boolean') {
        return defaultValue ? 'TRUE' : 'FALSE'
    }

    if (defaultValue instanceof Date) {
        return `'${defaultValue.toISOString()}'`
    }

    if (Array.isArray(defaultValue)) {
        const arrayContent = defaultValue
            .map((item) => {
                if (typeof item === 'string') {
                    return `"${item.replace(/"/g, '\\"')}"`
                }
                return String(item)
            })
            .join(',')
        return `'{${arrayContent}}'`
    }

    if (typeof defaultValue === 'object') {
        return `'${JSON.stringify(defaultValue)}'`
    }

    return String(defaultValue)
}

export function fetchSchemaDrizzleORM(
    schema: Record<string, unknown>,
): LocalSchema {
    const localSchema: LocalSchema = {
        enums: [],
        tables: [],
        views: [],
    }

    const entries = Object.entries(schema)

    for (const [_key, value] of entries) {
        // Handle Enums
        if (isPgEnum(value)) {
            localSchema.enums?.push({
                name: value.enumName,
                values: value.enumValues,
            })
            continue
        }

        // Handle Tables
        if (is(value, PgTable)) {
            const tableName = getTableName(value)
            const tableConfig = getTableConfig(value)

            const table: LocalTableDefinition = {
                columns: [],
                name: tableName,
                constraints: [],
                indexes: [],
                triggers: [],
                foreign_keys: [],
            }

            // 1. Map Columns
            const columns = getTableColumns(value) as Record<string, PgColumn>
            for (const column of Object.values(columns)) {
                // Get the actual SQL type from Drizzle column
                let sqlType: string
                let defaultValue: string | undefined

                // Check if this is an array column
                if (column.dataType === 'array' && (column as any).baseColumn) {
                    const baseColumn = (column as any).baseColumn
                    const baseType = baseColumn.columnType
                        ? mapDrizzleColumnTypeToPostgres(baseColumn.columnType)
                        : mapDrizzleTypeToPostgres(baseColumn.dataType)
                    sqlType = `${baseType}[]`
                    defaultValue =
                        column.default !== undefined
                            ? mapDefaultValueToSql(column.default)
                            : undefined
                } else if (column.columnType) {
                    // Handle SERIAL and BIGSERIAL types
                    // These have hasDefault=true but no explicit default value
                    if (
                        (column.columnType === 'PgSerial' ||
                            column.columnType === 'PgBigSerial53' ||
                            column.columnType === 'PgBigSerial64') &&
                        (column as any).hasDefault
                    ) {
                        // Use SERIAL/BIGSERIAL pseudo-types which automatically create sequences
                        sqlType =
                            column.columnType === 'PgSerial'
                                ? 'serial'
                                : 'bigserial'
                        // Don't set a default - SERIAL handles this
                        defaultValue = undefined
                    } else {
                        // Try to get more specific type info from the column object
                        // Access columnType which contains the actual SQL type definition (e.g., 'PgNumeric', 'PgUUID')
                        sqlType = mapDrizzleColumnTypeToPostgres(column.columnType)
                        defaultValue =
                            column.default !== undefined
                                ? mapDefaultValueToSql(column.default)
                                : undefined
                    }
                } else {
                    // Fallback to generic type mapping
                    sqlType = mapDrizzleTypeToPostgres(column.dataType)
                    defaultValue =
                        column.default !== undefined
                            ? mapDefaultValueToSql(column.default)
                            : undefined
                }

                table.columns.push({
                    name: column.name,
                    data_type: sqlType,
                    default: defaultValue,
                    is_nullable: !column.notNull && !column.primary,
                    // Note: is_identity should be set for GENERATED ... AS IDENTITY columns
                    // Drizzle doesn't currently expose this information, so we leave it undefined
                    is_identity: undefined,
                })
            }

            // 2. Map Primary Keys -> Constraints
            // First check for single-column primary keys (columns with .primaryKey())
            const primaryColumns = Object.values(columns).filter((c) => c.primary)
            if (primaryColumns.length > 0 && tableConfig.primaryKeys.length === 0) {
                // Single column primary key
                table.constraints?.push({
                    name: `${tableName}_pkey`,
                    type: 'PRIMARY KEY',
                    columns: primaryColumns.map((c) => c.name),
                })
            }

            // Then handle composite primary keys defined via primaryKey()
            for (const pk of tableConfig.primaryKeys) {
                table.constraints?.push({
                    name: pk.getName(),
                    type: 'PRIMARY KEY',
                    columns: pk.columns.map((c) => c.name),
                })
            }

            // 3. Map Unique Constraints -> Constraints
            for (const uq of tableConfig.uniqueConstraints) {
                table.constraints?.push({
                    name: uq.name ?? `${tableName}_unique_idx`,
                    type: 'UNIQUE',
                    columns: uq.columns.map((c) => c.name),
                    nulls_not_distinct: uq.nullsNotDistinct,
                })
            }

            // 4. Map Checks -> Constraints
            for (const check of tableConfig.checks) {
                table.constraints?.push({
                    name: check.name,
                    type: 'CHECK',
                    check_predicate: mapDefaultValueToSql(check.value),
                })
            }

            // 5. Map Indexes
            for (const idx of tableConfig.indexes) {
                table.indexes?.push({
                    name: idx.config.name ?? `${tableName}_idx`,
                    is_unique: idx.config.unique,
                    index_type: idx.config.method,
                    columns: idx.config.columns.map((c) => {
                        const colName = is(c, PgTable)
                            ? getTableName(c)
                            : (c as PgColumn).name
                        return { name: colName }
                    }),
                })
            }

            // 6. Map Foreign Keys
            for (const fk of tableConfig.foreignKeys) {
                const reference = fk.reference()
                table.foreign_keys?.push({
                    name: fk.getName(),
                    columns: reference.columns.map((c) => c.name),
                    foreign_table: getTableName(reference.foreignTable),
                    foreign_columns: reference.foreignColumns.map(
                        (c) => c.name,
                    ),
                    on_delete: fk.onDelete?.toUpperCase() as ReferentialAction,
                    on_update: fk.onUpdate?.toUpperCase() as ReferentialAction,
                })
            }

            localSchema.tables?.push(table)
        }
    }

    return localSchema
}
