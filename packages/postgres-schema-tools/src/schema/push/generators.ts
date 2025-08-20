import type {
    LocalColumnDefinition,
    LocalConstraintDefinition,
    LocalEnumDefinition,
    LocalForeignKeyDefinition,
    LocalIndexColumn,
    LocalIndexDefinition,
    LocalTableDefinition,
    LocalTriggerDefinition,
    LocalViewDefinition,
} from '../local/types'

// --- HELPERS ---

/**
 * Quotes a PostgreSQL identifier (e.g., table, column name) to handle
 * special characters and reserved keywords.
 * @param identifier The identifier to quote.
 * @returns The quoted identifier.
 */
export function quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * Quotes a string literal for use in a SQL query.
 * @param literal The string to quote.
 * @returns The quoted and escaped string literal.
 */
export function quoteLiteral(literal: string): string {
    return `'${literal.replace(/'/g, "''")}'`
}

/**
 * Generates a `COMMENT ON` SQL statement if a description is provided.
 * @param type The type of the database object (e.g., 'TABLE', 'COLUMN').
 * @param objectName The fully qualified name of the object.
 * @param description The comment text.
 * @returns An array containing a single SQL `COMMENT ON` statement, or an empty array.
 */
export function generateComment(
    type: string,
    objectName: string,
    description?: string | null,
): string[] {
    if (description) {
        return [
            `COMMENT ON ${type} ${objectName} IS ${quoteLiteral(description)};`,
        ]
    }
    return []
}

// --- ENUMS ---

/**
 * Generates SQL to create a new ENUM type.
 * @param def The definition of the enum.
 * @returns An array of SQL statements for creation and commenting.
 */
export function createEnum(def: LocalEnumDefinition): string[] {
    const values = def.values.map(quoteLiteral).join(', ')
    const statements: string[] = []
    statements.push(`CREATE TYPE ${quote(def.name)} AS ENUM (${values});`)
    statements.push(
        ...generateComment('TYPE', quote(def.name), def.description),
    )
    return statements
}

/**
 * Generates SQL to update an ENUM type by dropping and re-creating it.
 * @warning This is a destructive operation and will fail if the type is in use.
 * @param oldDef The definition of the existing enum.
 * @param newDef The definition of the new enum.
 * @returns An array of SQL statements to drop the old and create the new enum.
 */
export function updateEnum(
    oldDef: LocalEnumDefinition,
    newDef: LocalEnumDefinition,
): string[] {
    return [...deleteEnum(oldDef.name), ...createEnum(newDef)]
}

/**
 * Generates SQL to drop an ENUM type.
 * @param name The name of the enum.
 * @returns An array containing a single SQL statement.
 */
export function deleteEnum(name: string): string[] {
    return [`DROP TYPE IF EXISTS ${quote(name)};`]
}

// --- VIEWS ---

/**
 * Generates SQL to create or replace a view.
 * @param def The definition of the view.
 * @returns An array of SQL statements for creation and commenting.
 */
export function createView(def: LocalViewDefinition): string[] {
    const statements: string[] = []
    statements.push(
        `CREATE OR REPLACE VIEW ${quote(def.name)} AS\n${def.definition};`,
    )
    statements.push(
        ...generateComment('VIEW', quote(def.name), def.description),
    )
    return statements
}

/**
 * Generates SQL to update a view. This is an alias for `createView`
 * as `CREATE OR REPLACE VIEW` handles both creation and updates.
 * @param def The new definition of the view.
 * @returns An array of SQL statements.
 */
export function updateView(def: LocalViewDefinition): string[] {
    return createView(def)
}

/**
 * Generates SQL to drop a view.
 * @param name The name of the view.
 * @returns An array containing a single SQL statement.
 */
export function deleteView(name: string): string[] {
    return [`DROP VIEW IF EXISTS ${quote(name)};`]
}

// --- TABLES ---

/**
 * Generates SQL to create a new table, including columns, constraints, and comments.
 * @param def The definition of the table.
 * @returns An array of SQL statements.
 */
export function createTable(def: LocalTableDefinition): string[] {
    const columnDefs = def.columns
        .map((col) => `  ${formatColumnDefinition(col)}`)
        .join(',\n')

    const constraintDefs = (def.constraints ?? [])
        .map((con) => `  ${formatConstraintDefinition(con)}`)
        .join(',\n')

    const parts = [columnDefs]
    if (constraintDefs) {
        parts.push(constraintDefs)
    }

    const statements: string[] = []
    statements.push(
        `CREATE TABLE ${quote(def.name)} (\n${parts.join(',\n')}\n);`,
    )

    statements.push(
        ...generateComment('TABLE', quote(def.name), def.description),
    )
    def.columns.forEach((col) => {
        statements.push(
            ...generateComment(
                'COLUMN',
                `${quote(def.name)}.${quote(col.name)}`,
                col.description,
            ),
        )
    })
    ;(def.constraints ?? []).forEach((con) => {
        statements.push(
            ...generateComment(
                'CONSTRAINT',
                `${quote(con.name)} ON ${quote(def.name)}`,
                con.description,
            ),
        )
    })

    return statements
}

/**
 * Generates SQL to update a table's name.
 * @param oldName The current name of the table.
 * @param newName The desired new name of the table.
 * @returns An array containing a single SQL statement.
 */
export function updateTableName(oldName: string, newName: string): string[] {
    if (oldName === newName) return []
    return [`ALTER TABLE ${quote(oldName)} RENAME TO ${quote(newName)};`]
}

/**
 * Generates SQL to update a table's description.
 * @param tableName The name of the table.
 * @param description The new description for the table.
 * @returns An array of SQL statements.
 */
export function updateTableDescription(
    tableName: string,
    description: string | null | undefined,
): string[] {
    return generateComment('TABLE', quote(tableName), description)
}

/**
 * Generates SQL to drop a table.
 * @param name The name of the table.
 * @returns An array containing a single SQL statement.
 */
export function deleteTable(name: string): string[] {
    return [`DROP TABLE IF EXISTS ${quote(name)} CASCADE;`]
}

// --- COLUMNS ---

function resolveArrayBaseType(udtName: string): string {
    const base = udtName.startsWith('_') ? udtName.slice(1) : udtName
    const mapping: Record<string, string> = {
        int2: 'smallint',
        int4: 'integer',
        int8: 'bigint',
        float4: 'real',
        float8: 'double precision',
        bool: 'boolean',
        bpchar: 'character',
        varchar: 'character varying',
        timestamptz: 'timestamptz',
        timetz: 'timetz',
    }
    return mapping[base] ?? base
}

function resolveColumnType(col: LocalColumnDefinition): string {
    if (col.data_type === 'USER-DEFINED' && col.udt_name) {
        return quote(col.udt_name)
    }
    if (col.data_type === 'ARRAY' && col.udt_name) {
        const base = resolveArrayBaseType(col.udt_name)
        return `${base}[]`
    }
    return col.data_type
}

function formatColumnDefinition(col: LocalColumnDefinition): string {
    const typeSql = resolveColumnType(col)
    const parts = [`${quote(col.name)} ${typeSql}`]
    if (col.is_nullable === false) {
        parts.push('NOT NULL')
    }
    if (col.default) {
        parts.push(`DEFAULT ${col.default}`)
    }
    if (col.is_identity) {
        const generation = col.identity_generation || 'BY DEFAULT'
        parts.push(`GENERATED ${generation} AS IDENTITY`)
    }
    if (col.is_generated && col.generation_expression) {
        parts.push(`GENERATED ALWAYS AS (${col.generation_expression}) STORED`)
    }
    return parts.join(' ')
}

/**
 * Generates SQL to add a new column to a table.
 * @param tableName The name of the table.
 * @param col The definition of the column to add.
 * @returns An array of SQL statements.
 */
export function createColumn(
    tableName: string,
    col: LocalColumnDefinition,
): string[] {
    const statements: string[] = []
    statements.push(
        `ALTER TABLE ${quote(tableName)} ADD COLUMN ${formatColumnDefinition(col)};`,
    )
    statements.push(
        ...generateComment(
            'COLUMN',
            `${quote(tableName)}.${quote(col.name)}`,
            col.description,
        ),
    )
    return statements
}

/**
 * Generates SQL statements to update a column to match a new definition.
 * It compares old and new definitions for name, data type, nullability,
 * default value, identity, and comments.
 * @param tableName The name of the table containing the column.
 * @param oldCol The current definition of the column.
 * @param newCol The desired new definition of the column.
 * @returns An array of SQL statements to perform the update.
 */
export function updateColumn(
    tableName: string,
    oldCol: LocalColumnDefinition,
    newCol: LocalColumnDefinition,
): string[] {
    const statements: string[] = []
    let currentName = oldCol.name

    if (oldCol.generation_expression !== newCol.generation_expression) {
        return [
            ...deleteColumn(tableName, oldCol.name),
            ...createColumn(tableName, newCol),
        ]
    }

    if (newCol.name !== oldCol.name) {
        statements.push(
            `ALTER TABLE ${quote(tableName)} RENAME COLUMN ${quote(
                oldCol.name,
            )} TO ${quote(newCol.name)};`,
        )
        currentName = newCol.name
    }

    const oldType = resolveColumnType(oldCol)
    const newType = resolveColumnType(newCol)
    if (oldType !== newType) {
        statements.push(
            `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                currentName,
            )} TYPE ${newType} USING ${quote(currentName)}::${newType};`,
        )
    }

    if (oldCol.default !== newCol.default) {
        if (newCol.default !== null) {
            statements.push(
                `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                    currentName,
                )} SET DEFAULT ${newCol.default};`,
            )
        } else {
            statements.push(
                `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                    currentName,
                )} DROP DEFAULT;`,
            )
        }
    }

    if (oldCol.is_nullable !== newCol.is_nullable) {
        const action = newCol.is_nullable ? 'DROP NOT NULL' : 'SET NOT NULL'
        statements.push(
            `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                currentName,
            )} ${action};`,
        )
    }

    const oldIsIdentity = oldCol.is_identity ?? false
    const newIsIdentity = newCol.is_identity ?? false
    if (
        oldIsIdentity !== newIsIdentity ||
        (newIsIdentity &&
            oldCol.identity_generation !== newCol.identity_generation)
    ) {
        if (oldIsIdentity) {
            statements.push(
                `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                    currentName,
                )} DROP IDENTITY IF EXISTS;`,
            )
        }
        if (newIsIdentity) {
            const generation = newCol.identity_generation || 'BY DEFAULT'
            statements.push(
                `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
                    currentName,
                )} ADD GENERATED ${generation} AS IDENTITY;`,
            )
        }
    }

    if (oldCol.description !== newCol.description) {
        statements.push(
            ...generateComment(
                'COLUMN',
                `${quote(tableName)}.${quote(currentName)}`,
                newCol.description,
            ),
        )
    }

    return statements
}

/**
 * Generates SQL to drop a column from a table.
 * @param tableName The name of the table.
 * @param columnName The name of the column.
 * @returns An array containing a single SQL statement.
 */
export function deleteColumn(tableName: string, columnName: string): string[] {
    return [
        `ALTER TABLE ${quote(tableName)} DROP COLUMN IF EXISTS ${quote(
            columnName,
        )};`,
    ]
}

// --- CONSTRAINTS (PRIMARY KEY, UNIQUE, CHECK) ---

function formatConstraintDefinition(con: LocalConstraintDefinition): string {
    let def = `CONSTRAINT ${quote(con.name)}`
    if (con.type === 'CHECK' && con.check_predicate) {
        def += ` CHECK (${con.check_predicate})`
    } else if (con.type) {
        def += ` ${con.type}`
        if (con.columns && con.columns.length > 0) {
            def += ` (${con.columns.map(quote).join(', ')})`
        }
    }
    return def
}

/**
 * Generates SQL to create a constraint on a table.
 * @param tableName The name of the table.
 * @param def The definition of the constraint.
 * @returns An array of SQL statements.
 */
export function createConstraint(
    tableName: string,
    def: LocalConstraintDefinition,
): string[] {
    const statements: string[] = []
    const sql = `ALTER TABLE ${quote(
        tableName,
    )} ADD ${formatConstraintDefinition(def)};`
    statements.push(sql)
    statements.push(
        ...generateComment(
            'CONSTRAINT',
            `${quote(def.name)} ON ${quote(tableName)}`,
            def.description,
        ),
    )
    return statements
}

/**
 * Replaces an existing constraint by dropping it and creating a new one.
 * @param tableName The name of the table the constraint is on.
 * @param oldDef The definition of the existing constraint.
 * @param newDef The definition of the new constraint.
 * @returns An array of SQL statements to drop the old and create the new constraint.
 */
export function updateConstraint(
    tableName: string,
    oldDef: LocalConstraintDefinition,
    newDef: LocalConstraintDefinition,
): string[] {
    return [
        ...deleteConstraint(tableName, oldDef.name),
        ...createConstraint(tableName, newDef),
    ]
}

/**
 * Generates SQL to drop a constraint from a table.
 * @param tableName The name of the table.
 * @param constraintName The name of the constraint.
 * @returns An array containing a single SQL statement.
 */
export function deleteConstraint(
    tableName: string,
    constraintName: string,
): string[] {
    return [
        `ALTER TABLE ${quote(tableName)} DROP CONSTRAINT IF EXISTS ${quote(
            constraintName,
        )};`,
    ]
}

// --- FOREIGN KEYS ---

/**
 * Generates SQL to create a foreign key constraint on a table.
 * @param tableName The name of the table.
 * @param def The definition of the foreign key.
 * @returns An array of SQL statements.
 */
export function createForeignKey(
    tableName: string,
    def: LocalForeignKeyDefinition,
): string[] {
    const columns = def.columns.map(quote).join(', ')
    const foreignColumns = def.foreign_columns.map(quote).join(', ')

    let sql = `ALTER TABLE ${quote(tableName)} ADD CONSTRAINT ${quote(
        def.name,
    )} FOREIGN KEY (${columns}) REFERENCES ${quote(
        def.foreign_table,
    )} (${foreignColumns})`

    if (def.match_option) sql += ` MATCH ${def.match_option}`
    if (def.on_update) sql += ` ON UPDATE ${def.on_update}`
    if (def.on_delete) sql += ` ON DELETE ${def.on_delete}`
    sql += ';'

    const statements: string[] = [sql]
    statements.push(
        ...generateComment(
            'CONSTRAINT',
            `${quote(def.name)} ON ${quote(tableName)}`,
            def.description,
        ),
    )
    return statements
}

/**
 * Replaces an existing foreign key by dropping it and creating a new one.
 * @param tableName The name of the table the foreign key is on.
 * @param oldDef The definition of the existing foreign key.
 * @param newDef The definition of the new foreign key.
 * @returns An array of SQL statements to drop the old and create the new foreign key.
 */
export function updateForeignKey(
    tableName: string,
    oldDef: LocalForeignKeyDefinition,
    newDef: LocalForeignKeyDefinition,
): string[] {
    return [
        ...deleteForeignKey(tableName, oldDef.name),
        ...createForeignKey(tableName, newDef),
    ]
}

/**
 * Generates SQL to drop a foreign key constraint.
 * @param tableName The name of the table.
 * @param constraintName The name of the foreign key constraint.
 * @returns An array containing a single SQL statement.
 */
export const deleteForeignKey = deleteConstraint

// --- INDEXES ---

function formatIndexColumn(col: LocalIndexColumn): string {
    const parts = [quote(col.name)]
    if (col.sort_order) parts.push(col.sort_order)
    if (col.nulls_order) parts.push(col.nulls_order)
    return parts.join(' ')
}

/**
 * Generates SQL to create an index on a table.
 * @param tableName The name of the table.
 * @param def The definition of the index.
 * @returns An array of SQL statements.
 */
export function createIndex(
    tableName: string,
    def: LocalIndexDefinition,
): string[] {
    const unique = def.is_unique ? 'UNIQUE ' : ''
    const columns = def.columns.map(formatIndexColumn).join(', ')
    const using = def.index_type ? ` USING ${def.index_type}` : ''
    const predicate = def.predicate ? ` WHERE ${def.predicate}` : ''

    const statements: string[] = []
    statements.push(
        `CREATE ${unique}INDEX ${quote(def.name)} ON ${quote(
            tableName,
        )}${using} (${columns})${predicate};`,
    )
    statements.push(
        ...generateComment('INDEX', quote(def.name), def.description),
    )
    return statements
}

/**
 * Replaces an existing index by dropping it and creating a new one.
 * @param tableName The name of the table the index is on.
 * @param oldDef The definition of the existing index.
 * @param newDef The definition of the new index.
 * @returns An array of SQL statements to drop the old and create the new index.
 */
export function updateIndex(
    tableName: string,
    oldDef: LocalIndexDefinition,
    newDef: LocalIndexDefinition,
): string[] {
    return [...deleteIndex(oldDef.name), ...createIndex(tableName, newDef)]
}

/**
 * Generates SQL to drop an index.
 * @param indexName The name of the index.
 * @returns An array containing a single SQL statement.
 */
export function deleteIndex(indexName: string): string[] {
    return [`DROP INDEX IF EXISTS ${quote(indexName)};`]
}

// --- TRIGGERS ---

/**
 * Generates SQL to create a trigger on a table.
 * @param tableName The name of the table.
 * @param def The definition of the trigger.
 * @returns An array of SQL statements.
 */
export function createTrigger(
    tableName: string,
    def: LocalTriggerDefinition,
): string[] {
    if (
        !def.timing ||
        !def.event ||
        !def.level ||
        !def.function_schema ||
        !def.function_name
    ) {
        throw new Error(
            'Trigger definition is missing required properties for creation.',
        )
    }

    const func = `${quote(def.function_schema)}.${quote(def.function_name)}()`
    const statements: string[] = []

    statements.push(
        `CREATE TRIGGER ${quote(def.name)} ${def.timing} ${
            def.event
        } ON ${quote(tableName)} FOR EACH ${def.level} EXECUTE FUNCTION ${func};`,
    )
    statements.push(
        ...generateComment(
            'TRIGGER',
            `${quote(def.name)} ON ${quote(tableName)}`,
            def.description,
        ),
    )
    return statements
}

/**
 * Replaces an existing trigger by dropping it and creating a new one.
 * @param tableName The name of the table the trigger is on.
 * @param oldDef The definition of the existing trigger.
 * @param newDef The definition of the new trigger.
 * @returns An array of SQL statements to drop the old and create the new trigger.
 */
export function updateTrigger(
    tableName: string,
    oldDef: LocalTriggerDefinition,
    newDef: LocalTriggerDefinition,
): string[] {
    return [
        ...deleteTrigger(tableName, oldDef.name),
        ...createTrigger(tableName, newDef),
    ]
}

/**
 * Generates SQL to drop a trigger from a table.
 * @param tableName The name of the table.
 * @param triggerName The name of the trigger.
 * @returns An array containing a single SQL statement.
 */
export function deleteTrigger(
    tableName: string,
    triggerName: string,
): string[] {
    return [
        `DROP TRIGGER IF EXISTS ${quote(triggerName)} ON ${quote(tableName)};`,
    ]
}
