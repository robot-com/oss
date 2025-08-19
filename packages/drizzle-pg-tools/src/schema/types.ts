/**
 * Defines the possible referential actions for foreign key constraints.
 */
export type ReferentialAction =
    | 'CASCADE'
    | 'RESTRICT'
    | 'NO ACTION'
    | 'SET NULL'
    | 'SET DEFAULT'

/**
 * Defines the match type for foreign key constraints.
 */
export type MatchOption = 'FULL' | 'PARTIAL' | 'SIMPLE'

/**
 * Defines the type of a table constraint.
 */
export type ConstraintType = 'PRIMARY KEY' | 'UNIQUE' | 'CHECK'

/**
 * Defines the sort order for an indexed column.
 */
export type SortOrder = 'ASC' | 'DESC'

/**
 * Defines the nulls ordering for an indexed column.
 */
export type NullsOrder = 'NULLS FIRST' | 'NULLS LAST'

/**
 * Represents a user-defined enum type in the database schema.
 */
export interface EnumDefinition {
    /** The name of the enum type. */
    name: string
    /** An ordered array of the possible values for the enum. */
    values: string[]
}

/**
 * Represents a database view.
 */
export interface ViewDefinition {
    /** The name of the view. */
    name: string
    /** The complete SQL `CREATE VIEW` definition string. */
    definition: string
}

/**
 * Represents a single column within a table's index.
 */
export interface IndexColumn {
    /** The name of the column included in the index. */
    name: string
    /** The sort order of the column in the index. */
    sort_order: SortOrder
    /** The ordering of null values for this column in the index. */
    nulls_order: NullsOrder
}

/**
 * Represents a database index on a table.
 */
export interface IndexDefinition {
    /** The name of the index. */
    name: string
    /** The complete SQL `CREATE INDEX` definition string. */
    definition: string
    /** Indicates if the index is created by a constraint. */
    is_constraint_index: boolean
    /** Indicates if the index enforces a uniqueness constraint. */
    is_unique: boolean
    /** Indicates if the index is currently valid and usable by the query planner. */
    is_valid: boolean
    /** The index access method (e.g., 'btree', 'gist', 'gin'). */
    index_type: string
    /** An ordered array of columns that make up the index. */
    columns: IndexColumn[]
    /** The predicate for a partial index (the `WHERE` clause), or null if not a partial index. */
    predicate: string | null
}

/**
 * Represents a column within a database table.
 */
export interface ColumnDefinition {
    /** The name of the column. */
    name: string
    /** The 1-based ordinal position of the column in the table. */
    position: number
    /** The data type of the column (e.g., 'integer', 'character varying'). */
    data_type: string
    /** Indicates if the column can store NULL values. */
    is_nullable: boolean
    /** The default value expression for the column, if any. */
    default: string | null
    /** The maximum length for character types, if applicable. */
    max_length: number | null
    /** The precision for numeric types, if applicable. */
    numeric_precision: number | null
    /** The scale for numeric types, if applicable. */
    numeric_scale: number | null
    /** The underlying user-defined type name (e.g., 'int4', 'varchar'). */
    udt_name: string
}

/**
 * Represents a constraint on a table (e.g., PRIMARY KEY, UNIQUE, CHECK).
 */
export interface ConstraintDefinition {
    /** The name of the constraint. */
    name: string
    /** The type of the constraint. */
    type: ConstraintType
    /** The SQL definition of the constraint. */
    definition: string
}

/**
 * Represents a foreign key constraint relationship between two tables.
 */
export interface ForeignKeyDefinition {
    /** The name of the foreign key constraint. */
    name: string
    /** The column(s) in the local table that make up the foreign key. */
    columns: string[]
    /** The table that the foreign key references. */
    foreign_table: string
    /** The column(s) in the foreign table that are referenced. */
    foreign_columns: string[]
    /** The action to perform on an update operation. */
    on_update: ReferentialAction
    /** The action to perform on a delete operation. */
    on_delete: ReferentialAction
    /** The match type of the foreign key. */
    match_option: MatchOption
}

/**
 * Represents a single database table, including its columns, constraints, indexes, and foreign keys.
 */
export interface TableDefinition {
    /** The name of the table. */
    name: string
    /** An array of the table's columns. */
    columns: ColumnDefinition[]
    /** An array of the table's constraints (Primary Key, Unique, Check). */
    constraints: ConstraintDefinition[]
    /** An array of the table's indexes. */
    indexes: IndexDefinition[]
    /** An array of foreign keys originating from this table. */
    foreign_keys: ForeignKeyDefinition[]
}

/**
 * The root type for the entire public schema JSON object.
 */
export interface PublicSchema {
    /** The name of the schema being described. */
    schema: string
    /** The ISO 8601 timestamp of when the schema was generated. */
    generated_at: string
    /** An array of all user-defined enum types in the schema. */
    enums: EnumDefinition[]
    /** An array of all views in the schema. */
    views: ViewDefinition[]
    /** An array of all tables in the schema. */
    tables: TableDefinition[]
}
