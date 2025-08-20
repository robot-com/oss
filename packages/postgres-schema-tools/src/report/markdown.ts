import type {
    ColumnDefinition,
    ConstraintDefinition,
    EnumDefinition,
    ForeignKeyDefinition,
    IndexDefinition,
    RemoteSchema,
    TableDefinition,
    ViewDefinition,
} from '../schema/remote/types' // Adjust the import path as needed

/**
 * Compares two PublicSchema objects and generates a Markdown report of the differences.
 *
 * @param schemaA The original or "before" schema.
 * @param schemaB The new or "after" schema.
 * @param nameA An optional name for the first schema (e.g., 'production').
 * @param nameB An optional name for the second schema (e.g., 'development').
 * @returns A string containing the Markdown-formatted difference report.
 */
export function createMarkdownReport(
    schemaA: RemoteSchema,
    schemaB: RemoteSchema,
    nameA = 'Current',
    nameB = 'New'
): string {
    const report: string[] = []

    report.push(`# 📄 Schema Difference Report: \`${nameA}\` vs \`${nameB}\``)
    report.push(`> Generated at: ${new Date().toISOString()}`)

    // --- Generic Helper for Comparing Lists of Items by Name ---
    function compareLists<T extends { name: string }>(
        listA: T[],
        listB: T[],
        entityName: string,
        compareFn: (itemA: T, itemB: T) => string[]
    ): string[] {
        const diffs: string[] = []
        const mapA = new Map(listA.map((item) => [item.name, item]))
        const mapB = new Map(listB.map((item) => [item.name, item]))

        // Check for removed and modified items
        for (const [name, itemA] of mapA.entries()) {
            if (mapB.has(name)) {
                const itemB = mapB.get(name)!
                const itemDiffs = compareFn(itemA, itemB)
                if (itemDiffs.length > 0) {
                    diffs.push(
                        `- 🔄 Modified ${entityName}: \`${name}\``,
                        ...itemDiffs
                    )
                }
            } else {
                diffs.push(`- ➖ Removed ${entityName}: \`${name}\``)
            }
        }

        // Check for added items
        for (const name of mapB.keys()) {
            if (!mapA.has(name)) {
                diffs.push(`- ➕ Added ${entityName}: \`${name}\``)
            }
        }

        return diffs
    }

    // --- Property Comparison Helper ---
    function compareProperty(
        propName: string,
        valA: unknown,
        valB: unknown
    ): string | null {
        const strA = JSON.stringify(valA ?? 'null')
        const strB = JSON.stringify(valB ?? 'null')
        if (strA !== strB) {
            return `  - ${propName} changed: \`${strA}\` ➡️ \`${strB}\``
        }
        return null
    }

    // --- Specific Comparison Functions ---

    const compareEnums = (a: EnumDefinition, b: EnumDefinition): string[] => {
        return [compareProperty('Values', a.values, b.values)].filter(
            (d): d is string => d !== null
        )
    }

    const compareViews = (a: ViewDefinition, b: ViewDefinition): string[] => {
        return [
            compareProperty('Definition', a.definition, b.definition),
        ].filter((d): d is string => d !== null)
    }

    const compareColumns = (
        a: ColumnDefinition,
        b: ColumnDefinition
    ): string[] => {
        const diffs: string[] = []
        const props: (keyof ColumnDefinition)[] = [
            'data_type',
            'is_nullable',
            'default',
            'max_length',
            'numeric_precision',
            'numeric_scale',
        ]
        for (const prop of props) {
            const diff = compareProperty(prop, a[prop], b[prop])
            if (diff) {
                diffs.push(diff)
            }
        }
        return diffs
    }

    const compareConstraints = (
        a: ConstraintDefinition,
        b: ConstraintDefinition
    ): string[] => {
        return [
            compareProperty('Definition', a.definition, b.definition),
        ].filter((d): d is string => d !== null)
    }

    const compareForeignKeys = (
        a: ForeignKeyDefinition,
        b: ForeignKeyDefinition
    ): string[] => {
        const diffs: string[] = []
        const props: (keyof ForeignKeyDefinition)[] = [
            'columns',
            'foreign_table',
            'foreign_columns',
            'on_update',
            'on_delete',
        ]
        for (const prop of props) {
            const diff = compareProperty(prop, a[prop], b[prop])
            if (diff) {
                diffs.push(diff)
            }
        }
        return diffs
    }

    const compareIndexes = (
        a: IndexDefinition,
        b: IndexDefinition
    ): string[] => {
        // A simple definition check is a great catch-all
        return [
            compareProperty('Definition', a.definition, b.definition),
        ].filter((d): d is string => d !== null)
    }

    const compareTables = (
        tableA: TableDefinition,
        tableB: TableDefinition
    ): string[] => {
        const tableDiffs: string[] = []

        // Compare Columns
        const colDiffs = compareLists(
            tableA.columns,
            tableB.columns,
            '📊 Column',
            compareColumns
        )
        if (colDiffs.length > 0) {
            tableDiffs.push(...colDiffs)
        }

        // Compare Constraints
        const conDiffs = compareLists(
            tableA.constraints,
            tableB.constraints,
            '🔑 Constraint',
            compareConstraints
        )
        if (conDiffs.length > 0) {
            tableDiffs.push(...conDiffs)
        }

        // Compare Indexes
        const idxDiffs = compareLists(
            tableA.indexes,
            tableB.indexes,
            '⚡️ Index',
            compareIndexes
        )
        if (idxDiffs.length > 0) {
            tableDiffs.push(...idxDiffs)
        }

        // Compare Foreign Keys
        const fkDiffs = compareLists(
            tableA.foreign_keys,
            tableB.foreign_keys,
            '🔗 Foreign Key',
            compareForeignKeys
        )
        if (fkDiffs.length > 0) {
            tableDiffs.push(...fkDiffs)
        }

        return tableDiffs.map((d) => `  ${d}`) // Indent for readability
    }

    // --- Execute Comparisons ---

    const enumDiffs = compareLists(
        schemaA.enums,
        schemaB.enums,
        'Enum',
        compareEnums
    )
    if (enumDiffs.length > 0) {
        report.push('\n## 📜 Enums', ...enumDiffs)
    }

    const viewDiffs = compareLists(
        schemaA.views,
        schemaB.views,
        'View',
        compareViews
    )
    if (viewDiffs.length > 0) {
        report.push('\n## 📜 Views', ...viewDiffs)
    }

    const tableDiffs = compareLists(
        schemaA.tables,
        schemaB.tables,
        '🔲 Table',
        compareTables
    )
    if (tableDiffs.length > 0) {
        report.push('\n## 🔲 Tables', ...tableDiffs)
    }

    // --- Final Report ---
    if (report.length === 2) {
        // Only title and timestamp were added
        return `# ✅ No differences found between \`${nameA}\` and \`${nameB}\`.`
    }

    return report.join('\n')
}
