import type { JsonReport } from '../../report'
import { createJsonDiffReport } from '../../report/json'
import type { RemoteSchema } from '../remote'
import {
    createColumn,
    createConstraint,
    createEnum,
    createForeignKey,
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
    updateColumn,
    updateEnum,
    updateTableDescription,
    updateView,
} from './generators'

export function generatePushDiffSchema(
    oldSchema: RemoteSchema,
    newSchema: RemoteSchema,
) {
    const report = createJsonDiffReport(oldSchema, newSchema)

    return generateMigrationSQL(report)
}

export function generateMigrationSQL(report: JsonReport): string[][] {
    const statements: string[][] = []

    // Drop removed views first
    report.views.removed.forEach((v) => {
        statements.push(deleteView(v.name))
    })

    // Drop modified views early (they'll be recreated later)
    // This prevents dependency issues when modifying tables/FKs
    report.views.modified.forEach((v) => {
        statements.push(deleteView(v.from.name))
    })

    // --- --- ---

    // Create new enums
    report.enums.added.forEach((e) => {
        statements.push(createEnum(e))
    })

    // Update modified enums
    report.enums.modified.forEach((e) => {
        statements.push(updateEnum(e.from, e.to))
    })

    // Drop removed enums
    report.enums.removed.forEach((e) => {
        statements.push(deleteEnum(e.name))
    })

    // --- --- ---

    report.tables.added.forEach((t) => {
        statements.push(createTable(t))
        // Create indexes for the new table
        ;(t.indexes ?? []).forEach((i) => {
            // Skip constraint indexes (they are created automatically)
            if (!i.is_constraint_index) {
                statements.push(createIndex(t.name, i))
            }
        })
        // Create foreign keys for the new table
        ;(t.foreign_keys ?? []).forEach((fk) => {
            statements.push(createForeignKey(t.name, fk))
        })
        // Create triggers for the new table
        ;(t.triggers ?? []).forEach((tr) => {
            statements.push(createTrigger(t.name, tr))
        })
    })

    report.tables.modified.forEach((t) => {
        if (t.description) {
            statements.push(updateTableDescription(t.name, t.description.to))
        }

        // Remove constraints
        t.foreign_keys.removed.forEach((fk) => {
            statements.push(deleteForeignKey(t.name, fk.name))
        })

        t.constraints.removed.forEach((c) => {
            statements.push(deleteConstraint(t.name, c.name))
        })

        t.indexes.removed.forEach((i) => {
            statements.push(deleteIndex(i.name))
        })

        t.triggers.removed.forEach((tr) => {
            statements.push(deleteTrigger(t.name, tr.name))
        })

        // Remove changed constraints
        t.foreign_keys.modified?.forEach((fk) => {
            statements.push(deleteForeignKey(t.name, fk.from.name))
        })

        t.constraints.modified.forEach((c) => {
            statements.push(deleteConstraint(t.name, c.from.name))
        })

        t.indexes.modified.forEach((i) => {
            statements.push(deleteIndex(i.from.name))
        })

        t.triggers.modified.forEach((tr) => {
            statements.push(deleteTrigger(t.name, tr.from.name))
        })

        // Drop removed columns
        t.columns.removed.forEach((c) => {
            statements.push(deleteColumn(t.name, c.name))
        })

        // Add new columns
        t.columns.added.forEach((c) => {
            statements.push(createColumn(t.name, c))
        })

        // Alter existing columns
        t.columns.modified.forEach((c) => {
            statements.push(updateColumn(t.name, c.from, c.to))
        })

        // Re-add changed constraints
        t.foreign_keys.modified?.forEach((fk) => {
            statements.push(createForeignKey(t.name, fk.to))
        })

        t.constraints.modified.forEach((c) => {
            statements.push(createConstraint(t.name, c.to))
        })

        t.indexes.modified.forEach((i) => {
            statements.push(createIndex(t.name, i.to))
        })

        t.triggers.modified.forEach((tr) => {
            statements.push(createTrigger(t.name, tr.to))
        })

        // Add new constraints
        t.foreign_keys.added.forEach((fk) => {
            statements.push(createForeignKey(t.name, fk))
        })

        t.constraints.added.forEach((c) => {
            statements.push(createConstraint(t.name, c))
        })

        t.indexes.added.forEach((i) => {
            statements.push(createIndex(t.name, i))
        })

        t.triggers.added.forEach((tr) => {
            statements.push(createTrigger(t.name, tr))
        })
    })

    // Drop removed tables
    report.tables.removed.forEach((t) => {
        statements.push(deleteTable(t.name))
    })

    report.views.modified.forEach((v) => {
        statements.push(updateView(v.to))
    })

    report.views.added.forEach((v) => {
        statements.push(createView(v))
    })

    return statements
}
