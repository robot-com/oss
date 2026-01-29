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
 * Normalizes a default value for comparison:
 * - Strips trailing type casts: "'{}'::json" -> "'{}'"
 * - Normalizes boolean case: "TRUE" -> "true", "FALSE" -> "false"
 */
function normalizeDefault(defaultValue: string | null): string | null {
    if (defaultValue === null) return null
    // Remove trailing type casts like ::json, ::text, ::bigint, etc.
    const normalized = defaultValue.replace(/::[a-zA-Z0-9_\s[\]]+$/i, '')
    // Normalize boolean values to lowercase
    if (normalized.toUpperCase() === 'TRUE') return 'true'
    if (normalized.toUpperCase() === 'FALSE') return 'false'
    return normalized
}

/**
 * Normalizes a data type for comparison.
 * - PostgreSQL returns "ARRAY" for array columns, but Drizzle uses "text[]" notation
 * - PostgreSQL returns "USER-DEFINED" for custom types (enums), but Drizzle uses the enum name
 */
function normalizeDataType(
    dataType: string,
    udtName: string | undefined,
): string {
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
 */
function diffSimpleColumns<
    T extends { name: string; default?: string | null; data_type?: string; udt_name?: string },
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
        const itemANormalized = {
            ...itemA,
            position: undefined,
            numeric_precision: undefined,
            numeric_scale: undefined,
            default: normalizeDefault(itemA.default ?? null),
            data_type: normalizeDataType(itemA.data_type ?? '', itemA.udt_name),
        }
        const itemBNormalized = {
            ...itemB,
            position: undefined,
            numeric_precision: undefined,
            numeric_scale: undefined,
            default: normalizeDefault(itemB.default ?? null),
            data_type: normalizeDataType(itemB.data_type ?? '', itemB.udt_name),
        }

        // Using deepEqual for order-independent comparison
        if (!deepEqual(itemANormalized, itemBNormalized)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
}

/**
 * Equivalent to diffSimpleItems but for constraints, it will ignore:
 * - definition: SQL definition string not available from all sources
 * - nulls_not_distinct: default is false, treat undefined as false
 */
function diffSimpleConstraints<
    T extends { name: string; nulls_not_distinct?: boolean },
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
        const itemANormalized = {
            ...itemA,
            definition: undefined,
            nulls_not_distinct: itemA.nulls_not_distinct ?? false,
        }
        const itemBNormalized = {
            ...itemB,
            definition: undefined,
            nulls_not_distinct: itemB.nulls_not_distinct ?? false,
        }

        // Using deepEqual for order-independent comparison
        if (!deepEqual(itemANormalized, itemBNormalized)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
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
            indexes: diffSimpleItems(filteredIndexesA, filteredIndexesB),
            foreign_keys: diffSimpleItems(
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
    const viewsDiff = diffSimpleItems(schemaA.views, schemaB.views)

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
