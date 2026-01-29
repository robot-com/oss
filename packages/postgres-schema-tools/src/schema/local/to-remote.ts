import type {
    ColumnDefinition,
    ConstraintDefinition,
    EnumDefinition,
    ForeignKeyDefinition,
    IndexDefinition,
    RemoteSchema,
    TableDefinition,
    TriggerDefinition,
    ViewDefinition,
} from '../remote'
import type {
    LocalColumnDefinition,
    LocalConstraintDefinition,
    LocalEnumDefinition,
    LocalForeignKeyDefinition,
    LocalIndexDefinition,
    LocalSchema,
    LocalTableDefinition,
    LocalTriggerDefinition,
    LocalViewDefinition,
} from './types'

/**
 * Maps a PostgreSQL data_type to its underlying udt_name.
 * This is needed because local schemas don't have udt_name,
 * but remote schemas from the database do.
 */
function dataTypeToUdtName(dataType: string): string {
    // Handle array types
    if (dataType.endsWith('[]')) {
        const baseType = dataType.slice(0, -2)
        return `_${dataTypeToUdtName(baseType)}`
    }

    const mapping: Record<string, string> = {
        // Text types
        text: 'text',
        'character varying': 'varchar',
        character: 'bpchar',
        varchar: 'varchar',

        // Integer types
        smallint: 'int2',
        integer: 'int4',
        bigint: 'int8',
        serial: 'int4',
        bigserial: 'int8',

        // Floating point types
        real: 'float4',
        'double precision': 'float8',
        numeric: 'numeric',
        decimal: 'numeric',

        // Boolean
        boolean: 'bool',

        // Date/Time types
        'timestamp without time zone': 'timestamp',
        'timestamp with time zone': 'timestamptz',
        timestamp: 'timestamp',
        timestamptz: 'timestamptz',
        date: 'date',
        'time without time zone': 'time',
        'time with time zone': 'timetz',
        time: 'time',
        interval: 'interval',

        // UUID
        uuid: 'uuid',

        // JSON types
        json: 'json',
        jsonb: 'jsonb',

        // Binary
        bytea: 'bytea',

        // Network types
        inet: 'inet',
        cidr: 'cidr',
        macaddr: 'macaddr',
        macaddr8: 'macaddr8',
    }

    return mapping[dataType.toLowerCase()] || dataType
}

export function localEnumToRemoteEnum(
    localEnum: LocalEnumDefinition,
): EnumDefinition {
    return {
        name: localEnum.name,
        description: localEnum.description ?? null,
        values: localEnum.values,
    }
}

export function localViewToRemoteView(
    localView: LocalViewDefinition,
): ViewDefinition {
    return {
        name: localView.name,
        description: localView.description ?? null,
        definition: localView.definition,
    }
}

export function localColumnToRemoteColumn(
    localColumn: LocalColumnDefinition,
): ColumnDefinition {
    return {
        name: localColumn.name,
        description: localColumn.description ?? null,
        position: 0, // Not available in local schema
        data_type: localColumn.data_type,
        is_nullable: localColumn.is_nullable ?? true,
        default: localColumn.default ?? null,
        is_generated: localColumn.is_generated ?? false,
        generation_expression: localColumn.generation_expression ?? null,
        is_identity: localColumn.is_identity ?? false,
        identity_generation: localColumn.identity_generation ?? null,
        max_length: localColumn.max_length ?? null,
        numeric_precision: localColumn.numeric_precision ?? null,
        numeric_scale: localColumn.numeric_scale ?? null,
        udt_name: localColumn.udt_name ?? dataTypeToUdtName(localColumn.data_type),
    }
}

export function localConstraintToRemoteConstraint(
    localConstraint: LocalConstraintDefinition,
): ConstraintDefinition {
    return {
        name: localConstraint.name,
        description: localConstraint.description ?? null,
        type: localConstraint.type,
        definition: '', // Not available in local schema
        columns: localConstraint.columns ?? [],
        check_predicate: localConstraint.check_predicate ?? null,
        nulls_not_distinct: localConstraint.nulls_not_distinct,
    }
}

export function localIndexToRemoteIndex(
    localIndex: LocalIndexDefinition,
): IndexDefinition {
    return {
        name: localIndex.name,
        description: localIndex.description ?? null,
        definition: '', // Not available in local schema
        is_constraint_index: false, // Not available in local schema
        is_unique: localIndex.is_unique ?? false,
        nulls_not_distinct: localIndex.nulls_not_distinct ?? false,
        is_valid: true, // Not available in local schema
        index_type: localIndex.index_type ?? '',
        columns: localIndex.columns.map((c) => ({
            name: c.name,
            sort_order: c.sort_order ?? 'ASC',
            nulls_order: c.nulls_order ?? 'NULLS LAST',
        })),
        predicate: localIndex.predicate ?? null,
    }
}

export function localForeignKeyToRemoteForeignKey(
    localForeignKey: LocalForeignKeyDefinition,
): ForeignKeyDefinition {
    return {
        name: localForeignKey.name,
        description: localForeignKey.description ?? null,
        columns: localForeignKey.columns,
        foreign_table: localForeignKey.foreign_table,
        foreign_columns: localForeignKey.foreign_columns,
        on_update: localForeignKey.on_update ?? 'NO ACTION',
        on_delete: localForeignKey.on_delete ?? 'NO ACTION',
        match_option: localForeignKey.match_option ?? 'SIMPLE',
    }
}

export function localTriggerToRemoteTrigger(
    localTrigger: LocalTriggerDefinition,
): TriggerDefinition {
    return {
        name: localTrigger.name,
        description: localTrigger.description ?? null,
        timing: localTrigger.timing ?? 'AFTER',
        event: localTrigger.event ?? '',
        level: localTrigger.level ?? 'ROW',
        function_schema: localTrigger.function_schema ?? 'public',
        function_name: localTrigger.function_name ?? '',
        definition: '', // Not available in local schema
    }
}

export function localTableToRemoteTable(
    localTable: LocalTableDefinition,
): TableDefinition {
    return {
        name: localTable.name,
        description: localTable.description ?? null,
        columns: localTable.columns.map(localColumnToRemoteColumn),
        constraints:
            localTable.constraints?.map(localConstraintToRemoteConstraint) ??
            [],
        indexes: localTable.indexes?.map(localIndexToRemoteIndex) ?? [],
        foreign_keys:
            localTable.foreign_keys?.map(localForeignKeyToRemoteForeignKey) ??
            [],
        triggers: localTable.triggers?.map(localTriggerToRemoteTrigger) ?? [],
    }
}

export function localSchemaToRemoteSchema(
    localSchema: LocalSchema,
): RemoteSchema {
    return {
        schema: 'public',
        generated_at: new Date().toISOString(),
        enums: localSchema.enums?.map(localEnumToRemoteEnum) ?? [],
        views: localSchema.views?.map(localViewToRemoteView) ?? [],
        tables: localSchema.tables?.map(localTableToRemoteTable) ?? [],
    }
}
