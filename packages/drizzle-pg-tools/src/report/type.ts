import type {
    ColumnDefinition,
    ConstraintDefinition,
    EnumDefinition,
    ForeignKeyDefinition,
    IndexDefinition,
    TableDefinition,
    TriggerDefinition,
    ViewDefinition,
} from '../schema/remote/types'

/**
 * A generic type to represent a modification, capturing the state before and after.
 */
export interface Difference<T> {
    from: T
    to: T
}

/**
 * Represents the changes detected within a single table.
 */
export interface TableModification {
    name: string
    description?: Difference<string | null>
    columns: {
        added: ColumnDefinition[]
        removed: ColumnDefinition[]
        modified: Difference<ColumnDefinition>[]
    }
    constraints: {
        added: ConstraintDefinition[]
        removed: ConstraintDefinition[]
        modified: Difference<ConstraintDefinition>[]
    }
    indexes: {
        added: IndexDefinition[]
        removed: IndexDefinition[]
        modified: Difference<IndexDefinition>[]
    }
    foreign_keys: {
        added: ForeignKeyDefinition[]
        removed: ForeignKeyDefinition[]
        modified: Difference<ForeignKeyDefinition>[]
    }
    triggers: {
        added: TriggerDefinition[]
        removed: TriggerDefinition[]
        modified: Difference<TriggerDefinition>[]
    }
}

/**
 * The root type for the JSON diff report.
 */
export interface JsonReport {
    schemas: {
        from: string
        to: string
    }
    generated_at: string
    enums: {
        added: EnumDefinition[]
        removed: EnumDefinition[]
        modified: Difference<EnumDefinition>[]
    }
    views: {
        added: ViewDefinition[]
        removed: ViewDefinition[]
        modified: Difference<ViewDefinition>[]
    }
    tables: {
        added: TableDefinition[]
        removed: TableDefinition[]
        modified: TableModification[]
    }
}
