import type { RemoteSchema } from '../schema/remote/types'
import type { Difference, JsonReport, TableModification } from './type'

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
        // Using JSON.stringify for a pragmatic deep comparison.
        // This is generally safe for structured data from a database schema.
        if (JSON.stringify(itemA) !== JSON.stringify(itemB)) {
            modified.push({ from: itemA, to: itemB })
        }
    }

    return { added, removed, modified }
}

/**
 * Equivalent to diffSimpleItems but for columns, it will ignore position changes.
 */
function diffSimpleColumns<T extends { name: string }>(
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
        const itemANoPos = { ...itemA, position: undefined }
        const itemBNoPos = { ...itemB, position: undefined }

        // Using JSON.stringify for a pragmatic deep comparison.
        // This is generally safe for structured data from a database schema.
        if (JSON.stringify(itemANoPos) !== JSON.stringify(itemBNoPos)) {
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
            constraints: diffSimpleItems(
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

    const hasChanges =
        modifiedTables.length > 0 ||
        tablesDiff.added.length > 0 ||
        tablesDiff.removed.length > 0 ||
        schemaA.enums.length !== schemaB.enums.length ||
        schemaA.views.length !== schemaB.views.length

    const report: JsonReport = {
        has_changes: hasChanges,
        schemas: {
            from: schemaA.schema,
            to: schemaB.schema,
        },
        generated_at: new Date().toISOString(),
        enums: diffSimpleItems(schemaA.enums, schemaB.enums),
        views: diffSimpleItems(schemaA.views, schemaB.views),
        tables: {
            added: tablesDiff.added,
            removed: tablesDiff.removed,
            modified: modifiedTables,
        },
    }

    return report
}
