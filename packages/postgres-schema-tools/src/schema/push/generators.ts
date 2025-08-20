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
    // Using dollar-quoting is safer if the literal itself contains quotes
    return `'${literal.replace(/'/g, "''")}'`
}

/**
 * Generates a `COMMENT ON` SQL statement if a description is provided.
 * @param type The type of the database object (e.g., 'TABLE', 'COLUMN', 'CONSTRAINT').
 * @param objectName The fully qualified name of the object.
 * @param description The comment text.
 * @returns A SQL `COMMENT ON` statement or an empty string.
 */
export function generateComment(
    type: string,
    objectName: string,
    description?: string | null
): string {
    if (description) {
        return `COMMENT ON ${type} ${objectName} IS ${quoteLiteral(description)};\n`
    }
    return ''
}

// --- ENUMS ---

export function createEnum(def: LocalEnumDefinition): string {
    const values = def.values.map(quoteLiteral).join(', ')
    let sql = `CREATE TYPE ${quote(def.name)} AS ENUM (${values});\n`
    sql += generateComment('TYPE', quote(def.name), def.description)
    return sql
}

export function updateEnumComment(
    name: string,
    description: string | null
): string {
    return generateComment('TYPE', quote(name), description)
}

export function deleteEnum(name: string): string {
    return `DROP TYPE IF EXISTS ${quote(name)};\n`
}

// --- VIEWS ---

export function createView(def: LocalViewDefinition): string {
    // CREATE OR REPLACE handles both creation and updates seamlessly.
    let sql = `CREATE OR REPLACE VIEW ${quote(def.name)} AS\n${
        def.definition
    };\n`
    sql += generateComment('VIEW', quote(def.name), def.description)
    return sql
}

export function updateView(def: LocalViewDefinition): string {
    // A view's definition is updated by re-running CREATE OR REPLACE.
    return createView(def)
}

export function deleteView(name: string): string {
    return `DROP VIEW IF EXISTS ${quote(name)};\n`
}

// --- TABLES ---

export function createTable(def: LocalTableDefinition): string {
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

    let sql = `CREATE TABLE ${quote(def.name)} (\n${parts.join(',\n')}\n);\n`

    // Add comments
    sql += generateComment('TABLE', quote(def.name), def.description)
    def.columns.forEach((col) => {
        sql += generateComment(
            'COLUMN',
            `${quote(def.name)}.${quote(col.name)}`,
            col.description
        )
    })
    ;(def.constraints ?? []).forEach((con) => {
        sql += generateComment(
            'CONSTRAINT',
            `${quote(con.name)} ON ${quote(def.name)}`,
            con.description
        )
    })

    return sql
}

/**
 * Generates SQL statements to update a column's properties, such as its
 * name and data type. Can return multiple statements.
 * @param tableName The name of the table containing the column.
 * @param oldName The current name of the column to update.
 * @param def A partial definition of the column with the desired new properties.
 * @returns An array of SQL statements to perform the update.
 */
export function updateColumn(
    tableName: string,
    oldName: string,
    def: Partial<Pick<LocalColumnDefinition, 'name' | 'data_type'>>
): string[] {
    const statements: string[] = []
    let currentName = oldName

    // 1. Handle renaming
    if (def.name && def.name !== oldName) {
        statements.push(renameColumn(tableName, oldName, def.name))
        currentName = def.name
    }

    // 2. Handle type change
    if (def.data_type) {
        statements.push(updateColumnType(tableName, currentName, def.data_type))
    }

    return statements
}

/**
 * Renames a column in a table.
 * @param tableName The name of the table.
 * @param oldName The current name of the column.
 * @param newName The new name for the column.
 * @returns A SQL `ALTER TABLE RENAME COLUMN` statement.
 */
export function renameColumn(
    tableName: string,
    oldName: string,
    newName: string
): string {
    return `ALTER TABLE ${quote(tableName)} RENAME COLUMN ${quote(
        oldName
    )} TO ${quote(newName)};\n`
}

/**
 * Updates the data type of a column.
 * Includes a `USING` clause for safe casting.
 * @param tableName The name of the table.
 * @param columnName The name of the column.
 * @param newDataType The new data type for the column.
 * @returns A SQL `ALTER TABLE ALTER COLUMN` statement.
 */
export function updateColumnType(
    tableName: string,
    columnName: string,
    newDataType: string
): string {
    // Adding a USING clause is crucial for many type changes (e.g., text to int)
    return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
        columnName
    )} TYPE ${newDataType} USING ${quote(columnName)}::${newDataType};\n`
}

/**
 * Updates the identity property of a column.
 * @param tableName The name of the table.
 * @param columnName The name of the column.
 * @param identity An object defining the identity generation, or null to drop identity.
 * @returns A SQL statement to add or drop the identity property.
 */
export function updateColumnIdentity(
    tableName: string,
    columnName: string,
    identity: { generation: 'ALWAYS' | 'BY DEFAULT' } | null
): string {
    if (identity) {
        return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
            columnName
        )} ADD GENERATED ${identity.generation} AS IDENTITY;\n`
    } else {
        return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
            columnName
        )} DROP IDENTITY IF EXISTS;\n`
    }
}

export function updateTableComment(
    name: string,
    description: string | null
): string {
    return generateComment('TABLE', quote(name), description)
}

export function deleteTable(name: string): string {
    return `DROP TABLE IF EXISTS ${quote(name)} CASCADE;\n`
}

// --- COLUMNS ---

function resolveArrayBaseType(udtName: string): string {
    // udtName for array types typically starts with '_' (e.g., '_text', '_int4')
    const base = udtName.startsWith('_') ? udtName.slice(1) : udtName
    // Map common Postgres internal type names to their SQL aliases
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
        // leave others as-is (e.g., text, uuid, bytea, json, jsonb)
    }
    return mapping[base] ?? base
}

function resolveColumnType(col: LocalColumnDefinition): string {
    // Handle enums and other user-defined types
    if (col.data_type === 'USER-DEFINED' && col.udt_name) {
        // Type names are identifiers; quote to be safe
        return quote(col.udt_name)
    }

    // Handle array types using udt_name like '_text', '_int4'
    if (col.data_type === 'ARRAY' && col.udt_name) {
        const base = resolveArrayBaseType(col.udt_name)
        return `${base}[]`
    }

    // Fallback to provided data_type string
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

export function addColumn(
    tableName: string,
    col: LocalColumnDefinition
): string {
    let sql = `ALTER TABLE ${quote(tableName)} ADD COLUMN ${formatColumnDefinition(
        col
    )};\n`
    sql += generateComment(
        'COLUMN',
        `${quote(tableName)}.${quote(col.name)}`,
        col.description
    )
    return sql
}

export function updateColumnComment(
    tableName: string,
    columnName: string,
    description: string | null
): string {
    return generateComment(
        'COLUMN',
        `${quote(tableName)}.${quote(columnName)}`,
        description
    )
}

export function updateColumnDefault(
    tableName: string,
    columnName: string,
    newDefault: string | null
): string {
    if (newDefault !== null) {
        return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
            columnName
        )} SET DEFAULT ${newDefault};\n`
    } else {
        return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
            columnName
        )} DROP DEFAULT;\n`
    }
}

export function updateColumnNullability(
    tableName: string,
    columnName: string,
    isNullable: boolean
): string {
    const action = isNullable ? 'DROP NOT NULL' : 'SET NOT NULL'
    return `ALTER TABLE ${quote(tableName)} ALTER COLUMN ${quote(
        columnName
    )} ${action};\n`
}

export function deleteColumn(tableName: string, columnName: string): string {
    return `ALTER TABLE ${quote(tableName)} DROP COLUMN IF EXISTS ${quote(
        columnName
    )};\n`
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

export function addConstraint(
    tableName: string,
    def: LocalConstraintDefinition,
    columns?: string[]
): string {
    // Use columns from the constraint definition if available, otherwise use the parameter
    const constraintColumns =
        def.columns && def.columns.length > 0 ? def.columns : columns
    const columnList = constraintColumns
        ? ` (${constraintColumns.map(quote).join(', ')})`
        : ''
    let sql = `ALTER TABLE ${quote(tableName)} ADD CONSTRAINT ${quote(
        def.name
    )} ${def.type}${columnList}`
    if (def.type === 'CHECK' && def.check_predicate) {
        sql += ` (${def.check_predicate})`
    }
    sql += ';\n'
    sql += generateComment(
        'CONSTRAINT',
        `${quote(def.name)} ON ${quote(tableName)}`,
        def.description
    )
    return sql
}

export function updateConstraintComment(
    tableName: string,
    constraintName: string,
    description: string | null
): string {
    return generateComment(
        'CONSTRAINT',
        `${quote(constraintName)} ON ${quote(tableName)}`,
        description
    )
}

export function deleteConstraint(
    tableName: string,
    constraintName: string
): string {
    return `ALTER TABLE ${quote(tableName)} DROP CONSTRAINT IF EXISTS ${quote(
        constraintName
    )};\n`
}

// --- FOREIGN KEYS ---

export function addForeignKey(
    tableName: string,
    def: LocalForeignKeyDefinition
): string {
    const columns = def.columns.map(quote).join(', ')
    const foreignColumns = def.foreign_columns.map(quote).join(', ')

    let sql = `ALTER TABLE ${quote(tableName)} ADD CONSTRAINT ${quote(
        def.name
    )} FOREIGN KEY (${columns}) REFERENCES ${quote(
        def.foreign_table
    )} (${foreignColumns})`

    if (def.match_option) sql += ` MATCH ${def.match_option}`
    if (def.on_update) sql += ` ON UPDATE ${def.on_update}`
    if (def.on_delete) sql += ` ON DELETE ${def.on_delete}`

    sql += ';\n'
    sql += generateComment(
        'CONSTRAINT',
        `${quote(def.name)} ON ${quote(tableName)}`,
        def.description
    )
    return sql
}

// Foreign keys are constraints, so update/delete uses the same functions
export const updateForeignKeyComment = updateConstraintComment
export const deleteForeignKey = deleteConstraint

// --- INDEXES ---

function formatIndexColumn(col: LocalIndexColumn): string {
    const parts = [quote(col.name)]
    if (col.sort_order) parts.push(col.sort_order)
    if (col.nulls_order) parts.push(col.nulls_order)
    return parts.join(' ')
}

export function createIndex(
    tableName: string,
    def: LocalIndexDefinition
): string {
    const unique = def.is_unique ? 'UNIQUE ' : ''
    const columns = def.columns.map(formatIndexColumn).join(', ')
    const using = def.index_type ? ` USING ${def.index_type}` : ''
    const predicate = def.predicate ? ` WHERE ${def.predicate}` : ''

    let sql = `CREATE ${unique}INDEX ${quote(def.name)} ON ${quote(
        tableName
    )}${using} (${columns})${predicate};\n`

    sql += generateComment('INDEX', quote(def.name), def.description)
    return sql
}

export function updateIndexComment(
    indexName: string,
    description: string | null
): string {
    return generateComment('INDEX', quote(indexName), description)
}

export function deleteIndex(indexName: string): string {
    return `DROP INDEX IF EXISTS ${quote(indexName)};\n`
}

// --- TRIGGERS ---

export function createTrigger(
    tableName: string,
    def: LocalTriggerDefinition
): string {
    if (
        !def.timing ||
        !def.event ||
        !def.level ||
        !def.function_schema ||
        !def.function_name
    ) {
        throw new Error(
            'Trigger definition is missing required properties for creation.'
        )
    }

    const func = `${quote(def.function_schema)}.${quote(def.function_name)}()`

    let sql = `CREATE TRIGGER ${quote(def.name)} ${def.timing} ${
        def.event
    } ON ${quote(tableName)} FOR EACH ${def.level} EXECUTE FUNCTION ${func};\n`

    sql += generateComment(
        'TRIGGER',
        `${quote(def.name)} ON ${quote(tableName)}`,
        def.description
    )
    return sql
}

export function updateTriggerComment(
    tableName: string,
    triggerName: string,
    description: string | null
): string {
    return generateComment(
        'TRIGGER',
        `${quote(triggerName)} ON ${quote(tableName)}`,
        description
    )
}

export function deleteTrigger(tableName: string, triggerName: string): string {
    return `DROP TRIGGER IF EXISTS ${quote(triggerName)} ON ${quote(
        tableName
    )};\n`
}
