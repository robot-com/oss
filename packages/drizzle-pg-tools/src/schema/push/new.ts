import type { LocalSchema } from '../local/types' // Assuming types are in './schema-types.ts'
import {
    addForeignKey,
    createEnum,
    createIndex,
    createTable,
    createTrigger,
    createView,
} from './generators' // Assuming the functions from the previous step are in './generators.ts'

/**
 * Generates an ordered array of SQL statements to create a new schema
 * from a LocalSchema definition object.
 *
 * The generation order is:
 * 1. Enums (Types)
 * 2. Tables (with columns and inline constraints)
 * 3. Indexes
 * 4. Foreign Keys
 * 5. Triggers
 * 6. Views
 *
 * @param schema The local schema definition.
 * @returns An array of SQL statements.
 */
export function generatePushNewSchema(schema: LocalSchema): string[] {
    const statements: string[] = []

    // 1. Create Enums first, as they are dependencies for tables.
    if (schema.enums) {
        for (const enumDef of schema.enums) {
            statements.push(createEnum(enumDef))
        }
    }

    // 2. Create Tables, including their columns and inline constraints.
    // Comments for tables, columns, and constraints are also generated here.
    if (schema.tables) {
        for (const tableDef of schema.tables) {
            statements.push(createTable(tableDef))
        }
    }

    // 3. Create Indexes, Foreign Keys, and Triggers after all tables exist.
    // This second pass ensures that all table dependencies (like for foreign keys)
    // are met before attempting to create them.
    if (schema.tables) {
        for (const tableDef of schema.tables) {
            // Add Indexes
            if (tableDef.indexes) {
                for (const indexDef of tableDef.indexes) {
                    statements.push(createIndex(tableDef.name, indexDef))
                }
            }

            // Add Foreign Keys
            if (tableDef.foreign_keys) {
                for (const fkDef of tableDef.foreign_keys) {
                    statements.push(addForeignKey(tableDef.name, fkDef))
                }
            }

            // Add Triggers
            if (tableDef.triggers) {
                for (const triggerDef of tableDef.triggers) {
                    statements.push(createTrigger(tableDef.name, triggerDef))
                }
            }
        }
    }

    // 4. Create Views, which may depend on the previously created tables.
    if (schema.views) {
        for (const viewDef of schema.views) {
            statements.push(createView(viewDef))
        }
    }

    return statements
}
