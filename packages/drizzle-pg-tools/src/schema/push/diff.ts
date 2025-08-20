import type {
    LocalConstraintDefinition,
    LocalForeignKeyDefinition,
    LocalIndexDefinition,
    LocalSchema,
    LocalTableDefinition,
    LocalTriggerDefinition,
} from '../local/types'
import {
    addColumn,
    addConstraint,
    addForeignKey,
    createEnum,
    createIndex,
    createTable,
    createTrigger,
    createView,
    deleteColumn,
    deleteConstraint,
    deleteEnum,
    deleteForeignKey,
    deleteIndex,
    deleteTable,
    deleteTrigger,
    deleteView,
    updateColumnComment,
    updateColumnDefault,
    updateColumnIdentity,
    updateColumnNullability,
    updateColumnType,
    updateConstraintComment,
    updateEnumComment,
    updateForeignKeyComment,
    updateIndexComment,
    updateTableComment,
    updateTriggerComment,
    updateView,
} from './generators'

/**
 * Compute SQL needed to migrate from oldSchema to newSchema.
 * Returns ordered SQL statements but does not execute them.
 */
export function generatePushDiffSchema(
    oldSchema: LocalSchema,
    newSchema: LocalSchema
): string[] {
    const statements: string[] = []

    const oldEnums = indexByName(oldSchema.enums ?? [])
    const newEnums = indexByName(newSchema.enums ?? [])

    const oldTables = indexByName(oldSchema.tables ?? [])
    const newTables = indexByName(newSchema.tables ?? [])

    const oldViews = indexByName(oldSchema.views ?? [])
    const newViews = indexByName(newSchema.views ?? [])

    // 0. Drop removed views first (they can depend on tables we're about to change)
    for (const name of namesOnlyIn(oldViews, newViews)) {
        statements.push(deleteView(name))
    }

    // 1. Enums: create new, update comments for existing
    for (const name of namesOnlyIn(newEnums, oldEnums)) {
        statements.push(createEnum(newEnums[name]!))
    }
    for (const name of namesInBoth(oldEnums, newEnums)) {
        const oldDef = oldEnums[name]!
        const newDef = newEnums[name]!
        if (oldDef.description !== (newDef.description ?? null)) {
            statements.push(updateEnumComment(name, newDef.description ?? null))
        }
        // NOTE: Enum value changes are not handled here (unsafe without dependency analysis)
    }

    // 2. New tables: create base tables first (without worrying about deps)
    for (const name of namesOnlyIn(newTables, oldTables)) {
        const t = newTables[name]!
        statements.push(createTable(t))
    }

    // 3. Existing tables: apply ALTERs
    for (const name of namesInBoth(oldTables, newTables)) {
        statements.push(
            ...diffExistingTable(oldTables[name]!, newTables[name]!)
        )
    }

    // 4. For newly created tables, create secondary objects (indexes, fks, triggers)
    for (const name of namesOnlyIn(newTables, oldTables)) {
        const t = newTables[name]!
        // indexes
        for (const idx of t.indexes ?? []) {
            statements.push(createIndex(t.name, idx))
        }
        // foreign keys
        for (const fk of t.foreign_keys ?? []) {
            statements.push(addForeignKey(t.name, fk))
        }
        // triggers
        for (const trg of t.triggers ?? []) {
            statements.push(createTrigger(t.name, trg))
        }
    }

    // 5. Views: create or replace existing/new views after table changes
    for (const name of namesInBoth(oldViews, newViews)) {
        statements.push(updateView(newViews[name]!))
    }
    for (const name of namesOnlyIn(newViews, oldViews)) {
        statements.push(createView(newViews[name]!))
    }

    // 6. Drop removed tables (cascade handles contained objects)
    for (const name of namesOnlyIn(oldTables, newTables)) {
        statements.push(deleteTable(name))
    }

    // 7. Drop removed enums (after tables are handled)
    for (const name of namesOnlyIn(oldEnums, newEnums)) {
        statements.push(deleteEnum(name))
    }

    return statements
}

function diffExistingTable(
    oldTable: LocalTableDefinition,
    newTable: LocalTableDefinition
): string[] {
    const sql: string[] = []

    // Table comment
    if ((oldTable.description ?? null) !== (newTable.description ?? null)) {
        sql.push(
            updateTableComment(newTable.name, newTable.description ?? null)
        )
    }

    const oldCols = indexByName(oldTable.columns)
    const newCols = indexByName(newTable.columns)

    const oldConstraints = indexByName(oldTable.constraints ?? [])
    const newConstraints = indexByName(newTable.constraints ?? [])

    const oldIndexes = indexByName(oldTable.indexes ?? [])
    const newIndexes = indexByName(newTable.indexes ?? [])

    const oldFks = indexByName(oldTable.foreign_keys ?? [])
    const newFks = indexByName(newTable.foreign_keys ?? [])

    const oldTriggers = indexByName(oldTable.triggers ?? [])
    const newTriggers = indexByName(newTable.triggers ?? [])

    // Drop constraints/indexes/fks/triggers that are removed or changed (safer before column drops/changes)
    for (const name of namesOnlyIn(oldConstraints, newConstraints)) {
        sql.push(deleteConstraint(newTable.name, name))
    }
    for (const name of namesInBoth(oldConstraints, newConstraints)) {
        if (!sameConstraintDef(oldConstraints[name]!, newConstraints[name]!)) {
            sql.push(deleteConstraint(newTable.name, name))
        }
    }

    for (const name of namesOnlyIn(oldFks, newFks)) {
        sql.push(deleteForeignKey(newTable.name, name))
    }
    for (const name of namesInBoth(oldFks, newFks)) {
        if (!sameForeignKeyDef(oldFks[name]!, newFks[name]!)) {
            sql.push(deleteForeignKey(newTable.name, name))
        }
    }

    for (const name of namesOnlyIn(oldIndexes, newIndexes)) {
        sql.push(deleteIndex(name))
    }
    for (const name of namesInBoth(oldIndexes, newIndexes)) {
        if (!sameIndexDef(oldIndexes[name]!, newIndexes[name]!)) {
            sql.push(deleteIndex(name))
        }
    }

    // Drop removed columns
    for (const name of namesOnlyIn(oldCols, newCols)) {
        sql.push(deleteColumn(newTable.name, name))
    }

    // Add new columns
    for (const name of namesOnlyIn(newCols, oldCols)) {
        sql.push(addColumn(newTable.name, newCols[name]!))
    }

    // Alter existing columns
    for (const name of namesInBoth(oldCols, newCols)) {
        const o = oldCols[name]!
        const n = newCols[name]!

        // Type
        if (!sameColumnType(o, n)) {
            sql.push(
                updateColumnType(newTable.name, name, resolveTypeString(n))
            )
        }

        // Default
        if ((o.default ?? null) !== (n.default ?? null)) {
            sql.push(
                updateColumnDefault(newTable.name, name, n.default ?? null)
            )
        }

        // Nullability
        if (normalizeNullable(o) !== normalizeNullable(n)) {
            sql.push(
                updateColumnNullability(
                    newTable.name,
                    name,
                    normalizeNullable(n)
                )
            )
        }

        // Identity
        const oId = o.is_identity ? o.identity_generation || 'BY DEFAULT' : null
        const nId = n.is_identity ? n.identity_generation || 'BY DEFAULT' : null
        if (oId !== nId) {
            sql.push(
                updateColumnIdentity(
                    newTable.name,
                    name,
                    nId ? { generation: nId } : null
                )
            )
        }

        // Comment
        if ((o.description ?? null) !== (n.description ?? null)) {
            sql.push(
                updateColumnComment(newTable.name, name, n.description ?? null)
            )
        }
    }

    // Re-add changed constraints
    for (const name of namesInBoth(oldConstraints, newConstraints)) {
        const o = oldConstraints[name]!
        const n = newConstraints[name]!
        if (!sameConstraintDef(o, n)) {
            sql.push(addConstraint(newTable.name, n))
        } else if ((o.description ?? null) !== (n.description ?? null)) {
            sql.push(
                updateConstraintComment(
                    newTable.name,
                    name,
                    n.description ?? null
                )
            )
        }
    }
    for (const name of namesOnlyIn(newConstraints, oldConstraints)) {
        sql.push(addConstraint(newTable.name, newConstraints[name]!))
    }

    // Re-add changed FKs
    for (const name of namesInBoth(oldFks, newFks)) {
        const o = oldFks[name]!
        const n = newFks[name]!
        if (!sameForeignKeyDef(o, n)) {
            sql.push(addForeignKey(newTable.name, n))
        } else if ((o.description ?? null) !== (n.description ?? null)) {
            sql.push(
                updateForeignKeyComment(
                    newTable.name,
                    name,
                    n.description ?? null
                )
            )
        }
    }
    for (const name of namesOnlyIn(newFks, oldFks)) {
        sql.push(addForeignKey(newTable.name, newFks[name]!))
    }

    // Re-add changed indexes
    for (const name of namesInBoth(oldIndexes, newIndexes)) {
        const o = oldIndexes[name]!
        const n = newIndexes[name]!
        if (!sameIndexDef(o, n)) {
            sql.push(createIndex(newTable.name, n))
        } else if ((o.description ?? null) !== (n.description ?? null)) {
            sql.push(updateIndexComment(name, n.description ?? null))
        }
    }
    for (const name of namesOnlyIn(newIndexes, oldIndexes)) {
        sql.push(createIndex(newTable.name, newIndexes[name]!))
    }

    // Triggers
    // Drop removed triggers
    for (const name of namesOnlyIn(oldTriggers, newTriggers)) {
        sql.push(deleteTrigger(newTable.name, name))
    }

    // Drop changed triggers then re-create, or update comments
    for (const name of namesInBoth(oldTriggers, newTriggers)) {
        const o = oldTriggers[name]!
        const n = newTriggers[name]!
        if (!sameTriggerDef(o, n)) {
            sql.push(deleteTrigger(newTable.name, name))
            sql.push(createTrigger(newTable.name, n))
        } else if ((o.description ?? null) !== (n.description ?? null)) {
            sql.push(
                updateTriggerComment(newTable.name, name, n.description ?? null)
            )
        }
    }
    for (const name of namesOnlyIn(newTriggers, oldTriggers)) {
        sql.push(createTrigger(newTable.name, newTriggers[name]!))
    }

    return sql
}

function resolveTypeString(col: {
    data_type: string
    udt_name?: string
}): string {
    if (col.data_type === 'USER-DEFINED' && col.udt_name)
        return `"${col.udt_name.replace(/"/g, '""')}"`
    if (col.data_type === 'ARRAY' && col.udt_name) {
        const base = col.udt_name.startsWith('_')
            ? col.udt_name.slice(1)
            : col.udt_name
        return `${base}[]`
    }
    return col.data_type
}

function normalizeNullable(col: { is_nullable?: boolean }): boolean {
    return col.is_nullable !== false
}

function sameColumnType(
    a: { data_type: string; udt_name?: string },
    b: { data_type: string; udt_name?: string }
): boolean {
    return resolveTypeString(a) === resolveTypeString(b)
}

function sameConstraintDef(
    a: LocalConstraintDefinition,
    b: LocalConstraintDefinition
): boolean {
    return (
        JSON.stringify(normalizeConstraint(a)) ===
        JSON.stringify(normalizeConstraint(b))
    )
}
function normalizeConstraint(c: LocalConstraintDefinition) {
    return {
        type: c.type ?? null,
        columns: (c.columns ?? []).slice(),
        check_predicate: c.check_predicate ?? null,
        nulls_not_distinct: c.nulls_not_distinct ?? false,
    }
}

function sameIndexDef(
    a: LocalIndexDefinition,
    b: LocalIndexDefinition
): boolean {
    return (
        JSON.stringify(normalizeIndex(a)) === JSON.stringify(normalizeIndex(b))
    )
}
function normalizeIndex(i: LocalIndexDefinition) {
    return {
        is_unique: !!i.is_unique,
        index_type: i.index_type ?? '',
        columns: (i.columns || []).map((c) => ({
            name: c.name,
            sort_order: c.sort_order ?? undefined,
            nulls_order: c.nulls_order ?? undefined,
        })),
        predicate: i.predicate ?? null,
    }
}

function sameForeignKeyDef(
    a: LocalForeignKeyDefinition,
    b: LocalForeignKeyDefinition
): boolean {
    return JSON.stringify(normalizeFk(a)) === JSON.stringify(normalizeFk(b))
}
function normalizeFk(fk: LocalForeignKeyDefinition) {
    return {
        columns: fk.columns.slice(),
        foreign_table: fk.foreign_table,
        foreign_columns: fk.foreign_columns.slice(),
        on_update: fk.on_update ?? null,
        on_delete: fk.on_delete ?? null,
        match_option: fk.match_option ?? null,
    }
}

function sameTriggerDef(
    a: LocalTriggerDefinition,
    b: LocalTriggerDefinition
): boolean {
    return (
        (a.timing ?? null) === (b.timing ?? null) &&
        (a.event ?? null) === (b.event ?? null) &&
        (a.level ?? null) === (b.level ?? null) &&
        (a.function_schema ?? null) === (b.function_schema ?? null) &&
        (a.function_name ?? null) === (b.function_name ?? null)
    )
}

function indexByName<T extends { name: string }>(
    items: T[]
): Record<string, T> {
    const map: Record<string, T> = {}
    for (const item of items) map[item.name] = item
    return map
}

function namesOnlyIn<
    A extends Record<string, unknown>,
    B extends Record<string, unknown>,
>(a: A, b: B): string[] {
    return Object.keys(a).filter((k) => !(k in b))
}

function namesInBoth<
    A extends Record<string, unknown>,
    B extends Record<string, unknown>,
>(a: A, b: B): string[] {
    return Object.keys(a).filter((k) => k in b)
}
