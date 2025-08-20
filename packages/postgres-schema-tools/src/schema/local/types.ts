import type {
    ConstraintType,
    MatchOption,
    NullsOrder,
    ReferentialAction,
    SortOrder,
    TriggerLevel,
    TriggerTiming,
} from '../common/types'

/**
 * Represents a user-defined enum type in the database schema.
 */
export interface LocalEnumDefinition {
    /** The name of the enum type. */
    name: string
    /** The comment or description for the enum type. */
    description?: string | null
    /** An ordered array of the possible values for the enum. */
    values: string[]
}

/**
 * Represents a database view.
 */
export interface LocalViewDefinition {
    /** The name of the view. */
    name: string
    /** The comment or description for the view. */
    description?: string | null
    /** The complete SQL `CREATE VIEW` definition string. */
    definition: string
}

/**
 * Represents a single column within a table's index.
 */
export interface LocalIndexColumn {
    /** The name of the column included in the index. */
    name: string
    /** The sort order of the column in the index. */
    sort_order?: SortOrder
    /** The ordering of null values for this column in the index. */
    nulls_order?: NullsOrder
}

/**
 * Represents a database index on a table.
 */
export interface LocalIndexDefinition {
    /** The name of the index. */
    name: string
    /** The comment or description for the index. */
    description?: string | null
    /** Indicates if the index enforces a uniqueness constraint. */
    is_unique?: boolean
    /** Indicates if the index does not consider null values as distinct. */
    nulls_not_distinct?: boolean | null
    /** The index access method (e.g., 'btree', 'gist', 'gin'). */
    index_type?: string
    /** An ordered array of columns that make up the index. */
    columns: LocalIndexColumn[]
    /** The predicate for a partial index (the `WHERE` clause), or null if not a partial index. */
    predicate?: string | null
}

/**
 * Represents a column within a database table.
 */
export interface LocalColumnDefinition {
    /** The name of the column. */
    name: string
    /** The comment or description for the column. */
    description?: string | null
    /** The data type of the column (e.g., 'integer', 'character varying'). */
    data_type: string
    /** Indicates if the column can store NULL values. */
    is_nullable?: boolean
    /** The default value expression for the column, if any. */
    default?: string | null
    /** Indicates if the column is a generated column. */
    is_generated?: boolean
    /** The expression used to generate the column's value. */
    generation_expression?: string | null
    /** Indicates if the column is an identity column. */
    is_identity?: boolean
    /** The generation type for an identity column. */
    identity_generation?: 'ALWAYS' | 'BY DEFAULT' | null
    /** The maximum length for character types, if applicable. */
    max_length?: number | null
    /** The precision for numeric types, if applicable. */
    numeric_precision?: number | null
    /** The scale for numeric types, if applicable. */
    numeric_scale?: number | null
    /** The underlying user-defined type name (e.g., 'int4', 'varchar'). */
    udt_name?: string
}

/**
 * Represents a constraint on a table (e.g., PRIMARY KEY, UNIQUE, CHECK).
 */
export interface LocalConstraintDefinition {
    /** The name of the constraint. */
    name: string
    /** The comment or description for the constraint. */
    description?: string | null
    /** The type of the constraint. */
    type: ConstraintType
    /** The column(s) that the constraint applies to. Empty for CHECK constraints that don't reference specific columns. */
    columns?: string[]
    /** The predicate for a CHECK constraint, or null if not a CHECK constraint. */
    check_predicate?: string | null
    /** Indicates if the constraint does not consider null values as distinct. */
    nulls_not_distinct?: boolean
}

/**
 * Represents a foreign key constraint relationship between two tables.
 */
export interface LocalForeignKeyDefinition {
    /** The name of the foreign key constraint. */
    name: string
    /** The comment or description for the foreign key. */
    description?: string | null
    /** The column(s) in the local table that make up the foreign key. */
    columns: string[]
    /** The table that the foreign key references. */
    foreign_table: string
    /** The column(s) in the foreign table that are referenced. */
    foreign_columns: string[]
    /** The action to perform on an update operation. */
    on_update?: ReferentialAction
    /** The action to perform on a delete operation. */
    on_delete?: ReferentialAction
    /** The match type of the foreign key. */
    match_option?: MatchOption
}

/**
 * Represents a trigger on a table.
 */
export interface LocalTriggerDefinition {
    /** The name of the trigger. */
    name: string
    /** The comment or description for the trigger. */
    description?: string | null
    /** When the trigger fires relative to the event. */
    timing?: TriggerTiming
    /** A string representing the event(s) that fire the trigger (e.g., 'INSERT OR UPDATE'). */
    event?: string
    /** The level at which the trigger operates. */
    level?: TriggerLevel
    /** The schema of the function executed by the trigger. */
    function_schema?: string
    /** The name of the function executed by the trigger. */
    function_name?: string
}

/**
 * Represents a single database table, including its columns, constraints, indexes, and foreign keys.
 */
export interface LocalTableDefinition {
    /** The name of the table. */
    name: string
    /** The comment or description for the table. */
    description?: string | null
    /** An array of the table's columns. */
    columns: LocalColumnDefinition[]
    /** An array of the table's constraints (Primary Key, Unique, Check). */
    constraints?: LocalConstraintDefinition[]
    /** An array of the table's indexes. */
    indexes?: LocalIndexDefinition[]
    /** An array of foreign keys originating from this table. */
    foreign_keys?: LocalForeignKeyDefinition[]
    /** An array of triggers defined on this table. */
    triggers?: LocalTriggerDefinition[]
}

/**
 * The root type for the entire public schema JSON object.
 */
export interface LocalSchema {
    /** An array of all user-defined enum types in the schema. */
    enums?: LocalEnumDefinition[]
    /** An array of all views in the schema. */
    views?: LocalViewDefinition[]
    /** An array of all tables in the schema. */
    tables?: LocalTableDefinition[]
}
