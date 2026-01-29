import type { RemoteSchema } from '../schema/remote/types'
import type { Difference, JsonReport, TableModification } from './type'

/**
 * Recursively sorts object keys to ensure consistent JSON.stringify output.
 * This makes comparison order-independent - objects with the same values
 * but different property ordering will produce identical strings.
 */
function sortObjectKeys<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys) as T
    }

    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
    }
    return sorted as T
}

/**
 * Compares two objects for deep equality, ignoring property order.
 * Uses JSON.stringify with sorted keys for reliable comparison.
 */
function deepEqual<T>(a: T, b: T): boolean {
    return JSON.stringify(sortObjectKeys(a)) === JSON.stringify(sortObjectKeys(b))
}

/**
 * A generic utility function to compare two arrays of objects that have a 'name' property.
 * It categorizes items into added, removed, and common (present in both arrays).
 * @param listA The "before" list.
 * @param listB The "after" list.
 * @returns An object containing added, removed, and common items.
 */
function diffByName<T extends { name: string }>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    common: { itemA: T; itemB: T }[]
} {
    const mapA = new Map(listA.map((item) => [item.name, item]))
    const mapB = new Map(listB.map((item) => [item.name, item]))

    const added: T[] = []
    const removed: T[] = []
    const common: { itemA: T; itemB: T }[] = []

    for (const [name, itemA] of mapA.entries()) {
        if (mapB.has(name)) {
            common.push({ itemA, itemB: mapB.get(name)! })
        } else {
            removed.push(itemA)
        }
    }

    for (const [name, itemB] of mapB.entries()) {
        if (!mapA.has(name)) {
            added.push(itemB)
        }
    }

    return { added, removed, common }
}

/**
 * A generic diffing function for simple objects (like Views or Enums).
 * It finds added, removed, and modified items between two lists.
 * Modification is determined by a deep comparison of the common items.
 * @param listA The "before" list.
 * @param listB The "after" list.
 * @returns A diff object with added, removed, and modified items.
 */
function diffSimpleItems<T extends { name: string }>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    const { added, removed, common } = diffByName(listA, listB)
    const modified: Difference<T>[] = []

    for (const { itemA, itemB } of common) {
        // Using deepEqual for order-independent comparison
        if (!deepEqual(itemA, itemB)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
}

/**
 * PostgreSQL extension views that should be ignored in comparisons.
 * These are created by extensions and not part of the application schema.
 */
const EXTENSION_VIEW_PREFIXES = ['pg_stat_statements']

/**
 * Checks if a view is from a PostgreSQL extension.
 */
function isExtensionView(viewName: string): boolean {
    return EXTENSION_VIEW_PREFIXES.some((prefix) =>
        viewName.startsWith(prefix),
    )
}

/**
 * Equivalent to diffSimpleItems but for views, it will:
 * - Filter out PostgreSQL extension views
 * - Compare view definitions directly (normalization should happen at fetch time)
 */
function diffSimpleViews<T extends { name: string; definition?: string | null }>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    // Filter out extension views
    const filteredA = listA.filter((v) => !isExtensionView(v.name))
    const filteredB = listB.filter((v) => !isExtensionView(v.name))

    const { added, removed, common } = diffByName(filteredA, filteredB)
    const modified: Difference<T>[] = []

    for (const { itemA, itemB } of common) {
        if (!deepEqual(itemA, itemB)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
}

/**
 * Checks if a column represents a serial/bigserial type.
 * Serial columns can be identified by:
 * - data_type is 'serial' or 'bigserial' (Drizzle extraction)
 * - default is nextval('..._seq'::regclass) (PostgreSQL introspection)
 */
function isSerialColumn(
    dataType?: string,
    defaultValue?: string | null,
): boolean {
    if (dataType === 'serial' || dataType === 'bigserial') {
        return true
    }
    if (defaultValue?.match(/^nextval\('[^']+_seq'::regclass\)$/)) {
        return true
    }
    return false
}

/**
 * Known PostgreSQL type names for cast removal.
 * These are matched case-insensitively.
 */
const POSTGRES_TYPES = [
    'text',
    'integer',
    'int',
    'int4',
    'int8',
    'bigint',
    'smallint',
    'boolean',
    'bool',
    'double precision',
    'real',
    'float4',
    'float8',
    'numeric',
    'decimal',
    'timestamp',
    'timestamp without time zone',
    'timestamp with time zone',
    'timestamptz',
    'date',
    'time',
    'time without time zone',
    'time with time zone',
    'interval',
    'json',
    'jsonb',
    'uuid',
    'bytea',
    'inet',
    'cidr',
    'macaddr',
    'character varying',
    'varchar',
    'char',
    'character',
    'regclass',
]

/**
 * Normalizes a SQL expression for comparison by:
 * - Collapsing whitespace (newlines, multiple spaces -> single space)
 * - Normalizing case of SQL keywords to uppercase
 * - Removing inline type casts like 'value'::text and (expr)::type
 * - Removing redundant parentheses around simple expressions
 * - Normalizing boolean case
 */
function normalizeSqlExpression(sql: string): string {
    let normalized = sql
        // Collapse all whitespace (newlines, tabs, multiple spaces) to single space
        .replace(/\s+/g, ' ')
        .trim()

    // Normalize PostgreSQL operators to SQL standard
    // ~~ is PostgreSQL internal representation of LIKE
    normalized = normalized.replace(/\s*~~\s*/g, ' LIKE ')
    // ~~* is ILIKE
    normalized = normalized.replace(/\s*~~\*\s*/g, ' ILIKE ')
    // !~~ is NOT LIKE
    normalized = normalized.replace(/\s*!~~\s*/g, ' NOT LIKE ')
    // !~~* is NOT ILIKE
    normalized = normalized.replace(/\s*!~~\*\s*/g, ' NOT ILIKE ')

    // Remove table qualifiers from column names: "table"."column" -> column
    // Pattern: "table_name"."column_name" -> column_name
    normalized = normalized.replace(/"[^"]+"\."([^"]+)"/g, '$1')

    // Also handle unquoted table qualifiers: table.column -> column
    normalized = normalized.replace(/\b(\w+)\.(\w+)\b/g, '$2')

    // Normalize PostgreSQL array comparison operators to SQL IN/NOT IN
    // <> ALL (ARRAY['a', 'b', 'c']) → NOT IN ('a', 'b', 'c')
    // = ANY (ARRAY['a', 'b', 'c']) → IN ('a', 'b', 'c')
    // Pattern matches: column <> ALL (ARRAY[values])
    normalized = normalized.replace(
        /(\w+)\s*<>\s*ALL\s*\(\s*ARRAY\s*\[([^\]]+)\]\s*\)/gi,
        (_, col, values) => `${col} NOT IN (${values})`,
    )
    normalized = normalized.replace(
        /(\w+)\s*=\s*ANY\s*\(\s*ARRAY\s*\[([^\]]+)\]\s*\)/gi,
        (_, col, values) => `${col} IN (${values})`,
    )

    // Build regex pattern for known PostgreSQL types
    // Sort by length descending to match longer types first (e.g., "double precision" before "double")
    const typePattern = POSTGRES_TYPES.map((t) => t.replace(/\s+/g, '\\s+'))
        .sort((a, b) => b.length - a.length)
        .join('|')

    // Remove type casts on string literals: 'value'::type -> 'value'
    const stringCastRegex = new RegExp(
        `'([^']*)'\\s*::\\s*(${typePattern})`,
        'gi',
    )
    normalized = normalized.replace(stringCastRegex, "'$1'")

    // Remove type casts on closing parentheses: )::type -> )
    const parenCastRegex = new RegExp(`\\)\\s*::\\s*(${typePattern})`, 'gi')
    normalized = normalized.replace(parenCastRegex, ')')

    // Remove type casts on identifiers/numbers: expr::type -> expr
    // Only match when followed by space, end, comma, or closing paren
    const exprCastRegex = new RegExp(
        `(\\w+)\\s*::\\s*(${typePattern})(?=\\s|$|,|\\))`,
        'gi',
    )
    normalized = normalized.replace(exprCastRegex, '$1')

    // Remove redundant parentheses around IS NULL expressions
    // (column_name IS NOT NULL) -> column_name IS NOT NULL
    normalized = normalized.replace(
        /\((\w+\s+IS\s+(?:NOT\s+)?NULL)\)/gi,
        '$1',
    )

    // Normalize boolean values
    normalized = normalized.replace(/\bTRUE\b/gi, 'true')
    normalized = normalized.replace(/\bFALSE\b/gi, 'false')

    // Normalize SQL keywords to uppercase for consistent comparison
    const keywords = [
        'CASE',
        'WHEN',
        'THEN',
        'ELSE',
        'END',
        'AND',
        'OR',
        'NOT',
        'IS',
        'NULL',
        'IN',
        'LIKE',
        'BETWEEN',
    ]
    for (const kw of keywords) {
        normalized = normalized.replace(new RegExp(`\\b${kw}\\b`, 'gi'), kw)
    }

    // Normalize common function names to lowercase
    const functions = [
        'floor',
        'random',
        'lpad',
        'now',
        'current_timestamp',
        'gen_random_uuid',
        'coalesce',
        'nullif',
        'greatest',
        'least',
        'concat',
        'substring',
        'length',
        'lower',
        'upper',
        'trim',
    ]
    for (const fn of functions) {
        normalized = normalized.replace(
            new RegExp(`\\b${fn}\\b`, 'gi'),
            fn.toLowerCase(),
        )
    }

    // Remove redundant grouping parentheses while preserving function call parens
    // Strategy: mark function calls, remove all other parens, restore markers
    // This handles cases like: (floor((random() * (10000)))) vs floor(random() * 10000)
    const FUNC_MARKER = '<<<FUNC>>>'
    normalized = normalized.replace(/(\w+)\(/g, `$1${FUNC_MARKER}(`) // Mark function open parens
    normalized = normalized.replace(/[()]/g, '') // Remove all remaining parens
    normalized = normalized.replace(new RegExp(FUNC_MARKER, 'g'), '') // Restore function parens

    // Clean up any double spaces created by removals
    normalized = normalized.replace(/\s+/g, ' ').trim()

    return normalized
}

/**
 * Normalizes a JSON value by parsing and re-stringifying to remove whitespace differences.
 * Returns the original string if parsing fails.
 */
function normalizeJsonValue(value: string): string {
    // Check if it looks like a JSON value (starts with ' and contains [ or {)
    const jsonMatch = value.match(/^'(\[.*\]|\{.*\})'/)
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1])
            return `'${JSON.stringify(parsed)}'`
        } catch {
            return value
        }
    }
    return value
}

/**
 * Normalizes a default value for comparison:
 * - Strips trailing type casts: "'{}'::json" -> "'{}'"
 * - Normalizes boolean case: "TRUE" -> "true", "FALSE" -> "false"
 * - Normalizes serial sequence defaults: "nextval('..._seq'::regclass)" -> "<serial>"
 * - Normalizes JSON whitespace: "'[0, 1, 2]'" -> "'[0,1,2]'"
 * - Normalizes SQL function case: "LPAD" -> "lpad"
 */
function normalizeDefault(
    defaultValue: string | null,
    dataType?: string,
): string | null {
    // For serial/bigserial columns, normalize all default representations to '<serial>'
    if (isSerialColumn(dataType, defaultValue)) {
        return '<serial>'
    }

    if (defaultValue === null) {
        return null
    }

    // Remove trailing type casts like ::json, ::text, ::bigint, etc.
    let normalized = defaultValue.replace(/::[a-zA-Z0-9_\s[\]]+$/i, '')

    // Normalize JSON values (remove whitespace differences)
    normalized = normalizeJsonValue(normalized)

    // Normalize SQL expressions (function case, whitespace)
    normalized = normalizeSqlExpression(normalized)

    return normalized
}

/**
 * Normalizes a generated column expression for comparison.
 */
function normalizeGenerationExpression(expr: string | null): string | null {
    if (expr === null) {
        return null
    }
    return normalizeSqlExpression(expr)
}

/**
 * Normalizes a data type for comparison.
 * - PostgreSQL returns "ARRAY" for array columns, but Drizzle uses "text[]" notation
 * - PostgreSQL returns "USER-DEFINED" for custom types (enums), but Drizzle uses the enum name
 * - serial/bigserial are pseudo-types that become integer/bigint in the database
 */
function normalizeDataType(
    dataType: string,
    udtName: string | undefined,
): string {
    // Normalize serial/bigserial to their underlying types
    // These are pseudo-types that PostgreSQL converts to integer/bigint + sequence
    if (dataType === 'serial') {
        return 'integer'
    }
    if (dataType === 'bigserial') {
        return 'bigint'
    }

    // If data_type is "ARRAY", use the udt_name to get the actual type
    // udt_name for arrays is like "_text", "_int4", etc.
    if (dataType === 'ARRAY' && udtName?.startsWith('_')) {
        const baseType = udtName.slice(1) // Remove leading underscore
        return `${baseType}[]`
    }
    // If data_type is "USER-DEFINED" (enum), use the udt_name
    if (dataType === 'USER-DEFINED' && udtName) {
        return udtName
    }
    return dataType
}

/**
 * Equivalent to diffSimpleItems but for columns, it will ignore:
 * - position: column order doesn't affect schema behavior
 * - numeric_precision/numeric_scale: metadata not available from all sources (e.g., Drizzle)
 * - default value type casts: normalize '{}' vs '{}'::json
 * - array type notation: normalize "ARRAY" vs "text[]"
 * - serial/bigserial pseudo-types: normalize to integer/bigint
 * - generation_expression: normalize SQL formatting differences
 */
function diffSimpleColumns<
    T extends {
        name: string
        default?: string | null
        data_type?: string
        udt_name?: string
        generation_expression?: string | null
    },
>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    const { added, removed, common } = diffByName(listA, listB)
    const modified: Difference<T>[] = []

    for (const { itemA, itemB } of common) {
        // Pass original data_type to normalizeDefault to detect serial columns
        const itemANormalized = {
            ...itemA,
            position: undefined,
            numeric_precision: undefined,
            numeric_scale: undefined,
            default: normalizeDefault(itemA.default ?? null, itemA.data_type),
            data_type: normalizeDataType(itemA.data_type ?? '', itemA.udt_name),
            generation_expression: normalizeGenerationExpression(
                itemA.generation_expression ?? null,
            ),
        }
        const itemBNormalized = {
            ...itemB,
            position: undefined,
            numeric_precision: undefined,
            numeric_scale: undefined,
            default: normalizeDefault(itemB.default ?? null, itemB.data_type),
            data_type: normalizeDataType(itemB.data_type ?? '', itemB.udt_name),
            generation_expression: normalizeGenerationExpression(
                itemB.generation_expression ?? null,
            ),
        }

        // Using deepEqual for order-independent comparison
        if (!deepEqual(itemANormalized, itemBNormalized)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
}

/**
 * Creates a semantic key for a constraint based on its type and columns.
 */
function getConstraintSemanticKey(constraint: {
    type?: string
    columns?: string[]
    check_predicate?: string | null
}): string {
    const type = constraint.type ?? ''
    const cols = constraint.columns?.sort().join(',') ?? ''
    // For CHECK constraints, include normalized predicate
    const pred =
        type === 'CHECK' && constraint.check_predicate
            ? normalizeSqlExpression(constraint.check_predicate)
            : ''
    return `${type}:${cols}:${pred}`
}

/**
 * Equivalent to diffSimpleItems but for constraints, with special handling:
 * - Matches constraints by semantic properties (type, columns, predicate)
 * - Ignores: definition, description
 * - Normalizes: nulls_not_distinct default, check_predicate expressions
 */
function diffSimpleConstraints<
    T extends {
        name: string
        description?: string | null
        nulls_not_distinct?: boolean
        type?: string
        columns?: string[]
        check_predicate?: string | null
    },
>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    const mapA = new Map(listA.map((item) => [item.name, item]))
    const mapB = new Map(listB.map((item) => [item.name, item]))

    const added: T[] = []
    const removed: T[] = []
    const modified: Difference<T>[] = []
    const matchedA = new Set<string>()
    const matchedB = new Set<string>()

    // Match by name first
    for (const [name, itemA] of mapA.entries()) {
        if (mapB.has(name)) {
            matchedA.add(name)
            matchedB.add(name)
            const itemB = mapB.get(name)!
            if (!areConstraintsEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // For unmatched items, try to match by semantic key
    const unmatchedA = listA.filter((i) => !matchedA.has(i.name))
    const unmatchedB = listB.filter((i) => !matchedB.has(i.name))

    const semanticMapB = new Map<string, T>()
    for (const item of unmatchedB) {
        semanticMapB.set(getConstraintSemanticKey(item), item)
    }

    for (const itemA of unmatchedA) {
        const key = getConstraintSemanticKey(itemA)
        if (semanticMapB.has(key)) {
            const itemB = semanticMapB.get(key)!
            semanticMapB.delete(key)
            matchedA.add(itemA.name)
            matchedB.add(itemB.name)
            if (!areConstraintsEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // Remaining unmatched items are added/removed
    for (const item of listA) {
        if (!matchedA.has(item.name)) {
            removed.push(item)
        }
    }
    for (const item of listB) {
        if (!matchedB.has(item.name)) {
            added.push(item)
        }
    }

    return { added, removed, modified }
}

/**
 * Compares two constraints for equality, ignoring name and definition.
 */
function areConstraintsEqual<
    T extends {
        description?: string | null
        nulls_not_distinct?: boolean
        check_predicate?: string | null
        type?: string
        columns?: string[]
    },
>(itemA: T, itemB: T): boolean {
    // For CHECK constraints, columns array may differ (empty from Drizzle, populated from DB)
    // So we only compare columns for non-CHECK constraints
    const isCheck = itemA.type === 'CHECK' || itemB.type === 'CHECK'

    const itemANormalized = {
        ...itemA,
        name: undefined,
        definition: undefined,
        description: undefined,
        // Ignore columns for CHECK constraints (Drizzle doesn't populate them)
        columns: isCheck ? undefined : itemA.columns,
        nulls_not_distinct: itemA.nulls_not_distinct ?? false,
        check_predicate: itemA.check_predicate
            ? normalizeSqlExpression(itemA.check_predicate)
            : null,
    }
    const itemBNormalized = {
        ...itemB,
        name: undefined,
        definition: undefined,
        description: undefined,
        // Ignore columns for CHECK constraints
        columns: isCheck ? undefined : itemB.columns,
        nulls_not_distinct: itemB.nulls_not_distinct ?? false,
        check_predicate: itemB.check_predicate
            ? normalizeSqlExpression(itemB.check_predicate)
            : null,
    }
    return deepEqual(itemANormalized, itemBNormalized)
}

/**
 * Creates a semantic key for an index based on its columns, uniqueness, and type.
 * This allows matching indexes that have different names but are semantically identical.
 */
function getIndexSemanticKey(index: {
    columns?: Array<{ name: string }>
    is_unique?: boolean
    index_type?: string
}): string {
    const cols = index.columns?.map((c) => c.name).sort().join(',') ?? ''
    const unique = index.is_unique ? 'U' : 'N'
    const type = index.index_type ?? 'btree'
    return `${cols}:${unique}:${type}`
}

/**
 * Equivalent to diffSimpleItems but for indexes, with special handling:
 * - Matches indexes by semantic properties (columns, uniqueness, type) instead of just name
 * - Ignores: definition, description
 * - Normalizes: nulls_not_distinct default, predicate SQL expressions
 */
function diffSimpleIndexes<
    T extends {
        name: string
        definition?: string
        description?: string | null
        nulls_not_distinct?: boolean | null
        predicate?: string | null
        columns?: Array<{ name: string }>
        is_unique?: boolean
        index_type?: string
    },
>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    // First try to match by name
    const mapA = new Map(listA.map((item) => [item.name, item]))
    const mapB = new Map(listB.map((item) => [item.name, item]))

    const added: T[] = []
    const removed: T[] = []
    const modified: Difference<T>[] = []
    const matchedA = new Set<string>()
    const matchedB = new Set<string>()

    // Match by name first
    for (const [name, itemA] of mapA.entries()) {
        if (mapB.has(name)) {
            matchedA.add(name)
            matchedB.add(name)
            // Compare the matched items
            const itemB = mapB.get(name)!
            if (!areIndexesEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // For unmatched items, try to match by semantic key (columns + uniqueness + type)
    const unmatchedA = listA.filter((i) => !matchedA.has(i.name))
    const unmatchedB = listB.filter((i) => !matchedB.has(i.name))

    const semanticMapB = new Map<string, T>()
    for (const item of unmatchedB) {
        semanticMapB.set(getIndexSemanticKey(item), item)
    }

    for (const itemA of unmatchedA) {
        const key = getIndexSemanticKey(itemA)
        if (semanticMapB.has(key)) {
            const itemB = semanticMapB.get(key)!
            semanticMapB.delete(key)
            matchedA.add(itemA.name)
            matchedB.add(itemB.name)
            // Compare semantically matched items
            if (!areIndexesEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // Remaining unmatched items are added/removed
    for (const item of listA) {
        if (!matchedA.has(item.name)) {
            removed.push(item)
        }
    }
    for (const item of listB) {
        if (!matchedB.has(item.name)) {
            added.push(item)
        }
    }

    return { added, removed, modified }
}

/**
 * Compares two indexes for equality, ignoring name, definition, and description.
 */
function areIndexesEqual<
    T extends {
        definition?: string
        description?: string | null
        nulls_not_distinct?: boolean | null
        predicate?: string | null
    },
>(itemA: T, itemB: T): boolean {
    const itemANormalized = {
        ...itemA,
        name: undefined,
        definition: undefined,
        description: undefined,
        nulls_not_distinct: itemA.nulls_not_distinct ?? false,
        predicate: itemA.predicate
            ? normalizeSqlExpression(itemA.predicate)
            : null,
    }
    const itemBNormalized = {
        ...itemB,
        name: undefined,
        definition: undefined,
        description: undefined,
        nulls_not_distinct: itemB.nulls_not_distinct ?? false,
        predicate: itemB.predicate
            ? normalizeSqlExpression(itemB.predicate)
            : null,
    }
    return deepEqual(itemANormalized, itemBNormalized)
}

/**
 * Creates a semantic key for a foreign key based on its columns, references, and actions.
 * This ensures FKs are only matched if they're functionally identical (except for name).
 */
function getForeignKeySemanticKey(fk: {
    columns?: string[]
    foreign_table?: string
    foreign_columns?: string[]
    on_delete?: string
    on_update?: string
}): string {
    const cols = fk.columns?.sort().join(',') ?? ''
    const fTable = fk.foreign_table ?? ''
    const fCols = fk.foreign_columns?.sort().join(',') ?? ''
    const onDel = fk.on_delete ?? 'NO ACTION'
    const onUpd = fk.on_update ?? 'NO ACTION'
    return `${cols}->${fTable}(${fCols}):${onDel}:${onUpd}`
}

/**
 * Equivalent to diffSimpleItems but for foreign keys, with special handling:
 * - Matches FKs by semantic properties (columns, foreign_table, foreign_columns)
 * - Ignores: description, name differences when semantically identical
 */
function diffSimpleForeignKeys<
    T extends {
        name: string
        description?: string | null
        columns?: string[]
        foreign_table?: string
        foreign_columns?: string[]
    },
>(
    listA: T[],
    listB: T[],
): {
    added: T[]
    removed: T[]
    modified: Difference<T>[]
} {
    const mapA = new Map(listA.map((item) => [item.name, item]))
    const mapB = new Map(listB.map((item) => [item.name, item]))

    const added: T[] = []
    const removed: T[] = []
    const modified: Difference<T>[] = []
    const matchedA = new Set<string>()
    const matchedB = new Set<string>()

    // Match by name first
    for (const [name, itemA] of mapA.entries()) {
        if (mapB.has(name)) {
            matchedA.add(name)
            matchedB.add(name)
            const itemB = mapB.get(name)!
            if (!areForeignKeysEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // For unmatched items, try to match by semantic key
    const unmatchedA = listA.filter((i) => !matchedA.has(i.name))
    const unmatchedB = listB.filter((i) => !matchedB.has(i.name))

    const semanticMapB = new Map<string, T>()
    for (const item of unmatchedB) {
        semanticMapB.set(getForeignKeySemanticKey(item), item)
    }

    for (const itemA of unmatchedA) {
        const key = getForeignKeySemanticKey(itemA)
        if (semanticMapB.has(key)) {
            const itemB = semanticMapB.get(key)!
            semanticMapB.delete(key)
            matchedA.add(itemA.name)
            matchedB.add(itemB.name)
            if (!areForeignKeysEqual(itemA, itemB)) {
                modified.push({ from: itemA, to: itemB })
            }
        }
    }

    // Remaining unmatched items are added/removed
    for (const item of listA) {
        if (!matchedA.has(item.name)) {
            removed.push(item)
        }
    }
    for (const item of listB) {
        if (!matchedB.has(item.name)) {
            added.push(item)
        }
    }

    return { added, removed, modified }
}

/**
 * Compares two foreign keys for equality, ignoring name and description.
 */
function areForeignKeysEqual<
    T extends {
        description?: string | null
    },
>(itemA: T, itemB: T): boolean {
    const itemANormalized = {
        ...itemA,
        name: undefined,
        description: undefined,
    }
    const itemBNormalized = {
        ...itemB,
        name: undefined,
        description: undefined,
    }
    return deepEqual(itemANormalized, itemBNormalized)
}

/**
 * Generates a detailed report of all changes between two database schemas.
 *
 * @param schemaA The original ("before") schema definition.
 * @param schemaB The new ("after") schema definition.
 * @returns A JsonReport object detailing all detected changes.
 */
export function createJsonDiffReport(
    schemaA: RemoteSchema,
    schemaB: RemoteSchema,
): JsonReport {
    const tablesDiff = diffByName(schemaA.tables, schemaB.tables)
    const modifiedTables: TableModification[] = []

    for (const { itemA: tableA, itemB: tableB } of tablesDiff.common) {
        let hasChanges = false

        // Filter out constraint indexes
        const filteredIndexesA = tableA.indexes.filter(
            (idx) => !idx.is_constraint_index,
        )
        const filteredIndexesB = tableB.indexes.filter(
            (idx) => !idx.is_constraint_index,
        )

        const modification: TableModification = {
            name: tableA.name,
            columns: diffSimpleColumns(tableA.columns, tableB.columns),
            constraints: diffSimpleConstraints(
                tableA.constraints,
                tableB.constraints,
            ),
            indexes: diffSimpleIndexes(filteredIndexesA, filteredIndexesB),
            foreign_keys: diffSimpleForeignKeys(
                tableA.foreign_keys,
                tableB.foreign_keys,
            ),
            triggers: diffSimpleItems(tableA.triggers, tableB.triggers),
        }

        if (tableA.description !== tableB.description) {
            modification.description = {
                from: tableA.description,
                to: tableB.description,
            }
            hasChanges = true
        }

        // Check if any of the nested diffs contain changes
        const subChanges =
            modification.columns.added.length > 0 ||
            modification.columns.removed.length > 0 ||
            modification.columns.modified.length > 0 ||
            modification.constraints.added.length > 0 ||
            modification.constraints.removed.length > 0 ||
            modification.constraints.modified.length > 0 ||
            modification.indexes.added.length > 0 ||
            modification.indexes.removed.length > 0 ||
            modification.indexes.modified.length > 0 ||
            modification.foreign_keys.added.length > 0 ||
            modification.foreign_keys.removed.length > 0 ||
            modification.foreign_keys.modified.length > 0 ||
            modification.triggers.added.length > 0 ||
            modification.triggers.removed.length > 0 ||
            modification.triggers.modified.length > 0

        if (hasChanges || subChanges) {
            modifiedTables.push(modification)
        }
    }

    const enumsDiff = diffSimpleItems(schemaA.enums, schemaB.enums)
    const viewsDiff = diffSimpleViews(schemaA.views, schemaB.views)

    const hasChanges =
        modifiedTables.length > 0 ||
        tablesDiff.added.length > 0 ||
        tablesDiff.removed.length > 0 ||
        enumsDiff.added.length > 0 ||
        enumsDiff.removed.length > 0 ||
        enumsDiff.modified.length > 0 ||
        viewsDiff.added.length > 0 ||
        viewsDiff.removed.length > 0 ||
        viewsDiff.modified.length > 0

    const report: JsonReport = {
        has_changes: hasChanges,
        schemas: {
            from: schemaA.schema,
            to: schemaB.schema,
        },
        generated_at: new Date().toISOString(),
        enums: enumsDiff,
        views: viewsDiff,
        tables: {
            added: tablesDiff.added,
            removed: tablesDiff.removed,
            modified: modifiedTables,
        },
    }

    return report
}
