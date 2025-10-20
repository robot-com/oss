import { generateMigrationSQL } from '../schema'
import type { JsonReport } from './type'

export function createMarkdownReport(
    jsonReport: JsonReport,
    nameA = 'Current',
    nameB = 'New',
    opts?: {
        includeMigrationCode?: boolean
    },
): string {
    const report: string[] = []

    report.push(`# 📄 Schema Difference Report: \`${nameA}\` vs \`${nameB}\``)
    report.push(`> Generated at: ${new Date().toISOString()}`)

    // Enums section
    if (
        jsonReport.enums.removed.length > 0 ||
        jsonReport.enums.added.length > 0 ||
        jsonReport.enums.modified.length > 0
    ) {
        report.push('\n## 📜 Enums')
        jsonReport.enums.removed.forEach((e) => {
            report.push(`- ➖ Removed Enum: \`${e.name}\``)
        })
        jsonReport.enums.added.forEach((e) => {
            report.push(`- ➕ Added Enum: \`${e.name}\``)
        })
        jsonReport.enums.modified.forEach((e) => {
            report.push(`- 🔄 Modified Enum: \`${e.from.name}\``)
        })
    }

    // Views section
    if (
        jsonReport.views.removed.length > 0 ||
        jsonReport.views.added.length > 0 ||
        jsonReport.views.modified.length > 0
    ) {
        report.push('\n## 📜 Views')
        jsonReport.views.removed.forEach((v) => {
            report.push(`- ➖ Removed View: \`${v.name}\``)
        })
        jsonReport.views.added.forEach((v) => {
            report.push(`- ➕ Added View: \`${v.name}\``)
        })
        jsonReport.views.modified.forEach((v) => {
            report.push(`- 🔄 Modified View: \`${v.from.name}\``)
            if (v.from.definition !== v.to.definition) {
                report.push(
                    `  - Definition changed: \`${v.from.definition}\` ➡️ \`${v.to.definition}\``,
                )
            }
        })
    }

    // Tables section
    if (
        jsonReport.tables.removed.length > 0 ||
        jsonReport.tables.added.length > 0 ||
        jsonReport.tables.modified.length > 0
    ) {
        report.push('\n## 🔲 Tables')
        jsonReport.tables.removed.forEach((t) => {
            report.push(`- ➖ Removed 🔲 Table: \`${t.name}\``)
        })
        jsonReport.tables.added.forEach((t) => {
            report.push(`- ➕ Added 🔲 Table: \`${t.name}\``)
        })

        jsonReport.tables.modified.forEach((t) => {
            report.push(`- 🔄 Modified 🔲 Table: \`${t.name}\``)

            // Columns
            t.columns.removed.forEach((c) => {
                report.push(`  - ➖ Removed 📊 Column: \`${c.name}\``)
            })
            t.columns.added.forEach((c) => {
                report.push(`  - ➕ Added 📊 Column: \`${c.name}\``)
            })
            t.columns.modified.forEach((c) => {
                report.push(`  - 🔄 Modified 📊 Column: \`${c.from.name}\``)
                if (c.from.data_type !== c.to.data_type) {
                    report.push(
                        `    - Data type changed: \`${c.from.data_type}\` ➡️ \`${c.to.data_type}\``,
                    )
                }
                if (c.from.default !== c.to.default) {
                    report.push(
                        `    - Default value changed: \`${c.from.default}\` ➡️ \`${c.to.default}\``,
                    )
                }
                if (c.from.is_nullable !== c.to.is_nullable) {
                    report.push(
                        `    - Nullable changed: \`${c.from.is_nullable}\` ➡️ \`${c.to.is_nullable}\``,
                    )
                }
                if (c.from.description !== c.to.description) {
                    report.push(
                        `    - Description changed: \`${c.from.description}\` ➡️ \`${c.to.description}\``,
                    )
                }
                if (c.from.is_identity !== c.to.is_identity) {
                    report.push(
                        `    - Identity changed: \`${c.from.is_identity}\` ➡️ \`${c.to.is_identity}\``,
                    )
                }
                if (c.from.identity_generation !== c.to.identity_generation) {
                    report.push(
                        `    - Identity generation changed: \`${c.from.identity_generation}\` ➡️ \`${c.to.identity_generation}\``,
                    )
                }
                if (
                    c.from.generation_expression !== c.to.generation_expression
                ) {
                    report.push(
                        `    - Generation expression changed: \`${c.from.generation_expression}\` ➡️ \`${c.to.generation_expression}\``,
                    )
                }
                if (c.from.is_generated !== c.to.is_generated) {
                    report.push(
                        `    - Generated changed: \`${c.from.is_generated}\` ➡️ \`${c.to.is_generated}\``,
                    )
                }
                if (c.from.max_length !== c.to.max_length) {
                    report.push(
                        `    - Max length changed: \`${c.from.max_length}\` ➡️ \`${c.to.max_length}\``,
                    )
                }
                if (c.from.numeric_precision !== c.to.numeric_precision) {
                    report.push(
                        `    - Numeric precision changed: \`${c.from.numeric_precision}\` ➡️ \`${c.to.numeric_precision}\``,
                    )
                }
                if (c.from.numeric_scale !== c.to.numeric_scale) {
                    report.push(
                        `    - Numeric scale changed: \`${c.from.numeric_scale}\` ➡️ \`${c.to.numeric_scale}\``,
                    )
                }
                if (c.from.udt_name !== c.to.udt_name) {
                    report.push(
                        `    - UDT name changed: \`${c.from.udt_name}\` ➡️ \`${c.to.udt_name}\``,
                    )
                }
            })

            // Constraints
            t.constraints.removed.forEach((c) => {
                report.push(`  - ➖ Removed 🔑 Constraint: \`${c.name}\``)
            })
            t.constraints.added.forEach((c) => {
                report.push(`  - ➕ Added 🔑 Constraint: \`${c.name}\``)
            })
            t.constraints.modified.forEach((c) => {
                report.push(`  - 🔄 Modified 🔑 Constraint: \`${c.from.name}\``)
                if (c.from.type !== c.to.type) {
                    report.push(
                        `    - Type changed: \`${c.from.type}\` ➡️ \`${c.to.type}\``,
                    )
                }
                if (c.from.columns.join(',') !== c.to.columns.join(',')) {
                    report.push(
                        `    - Columns changed: \`${c.from.columns.join(
                            ',',
                        )}\` ➡️ \`${c.to.columns.join(',')}\``,
                    )
                }
                if (c.from.check_predicate !== c.to.check_predicate) {
                    report.push(
                        `    - Check predicate changed: \`${c.from.check_predicate}\` ➡️ \`${c.to.check_predicate}\``,
                    )
                }
                if (c.from.nulls_not_distinct !== c.to.nulls_not_distinct) {
                    report.push(
                        `    - Nulls not distinct changed: \`${c.from.nulls_not_distinct}\` ➡️ \`${c.to.nulls_not_distinct}\``,
                    )
                }
            })

            // Indexes
            t.indexes.removed.forEach((i) => {
                report.push(`  - ➖ Removed ⚡️ Index: \`${i.name}\``)
            })
            t.indexes.added.forEach((i) => {
                report.push(`  - ➕ Added ⚡️ Index: \`${i.name}\``)
            })
            t.indexes.modified.forEach((i) => {
                report.push(`  - 🔄 Modified ⚡️ Index: \`${i.from.name}\``)
                if (i.from.is_unique !== i.to.is_unique) {
                    report.push(
                        `    - Unique changed: \`${i.from.is_unique}\` ➡️ \`${i.to.is_unique}\``,
                    )
                }
                if (i.from.index_type !== i.to.index_type) {
                    report.push(
                        `    - Index type changed: \`${i.from.index_type}\` ➡️ \`${i.to.index_type}\``,
                    )
                }
                if (i.from.predicate !== i.to.predicate) {
                    report.push(
                        `    - Predicate changed: \`${i.from.predicate}\` ➡️ \`${i.to.predicate}\``,
                    )
                }
                let columnsChanged =
                    i.from.columns.length !== i.to.columns.length
                for (let j = 0; j < i.from.columns.length; j++) {
                    if (
                        i.from.columns[j].name !== i.to.columns[j].name ||
                        i.from.columns[j].sort_order !==
                            i.to.columns[j].sort_order ||
                        i.from.columns[j].nulls_order !==
                            i.to.columns[j].nulls_order
                    ) {
                        columnsChanged = true
                        break
                    }
                }

                if (columnsChanged) {
                    report.push(
                        `    - Columns changed: \`${i.from.columns
                            .map(
                                (c) =>
                                    `[${c.name}, ${c.sort_order}, ${c.nulls_order}]`,
                            )
                            .join(',')}\` ➡️ \`${i.to.columns
                            .map(
                                (c) =>
                                    `[${c.name}, ${c.sort_order}, ${c.nulls_order}]`,
                            )
                            .join(',')}\` ➡️ \`${i.to.columns
                            .map((c) => c.name)
                            .join(',')}\``,
                    )
                }

                if (i.from.nulls_not_distinct !== i.to.nulls_not_distinct) {
                    report.push(
                        `    - Nulls not distinct changed: \`${i.from.nulls_not_distinct}\` ➡️ \`${i.to.nulls_not_distinct}\``,
                    )
                }
            })

            // Foreign Keys
            t.foreign_keys.removed.forEach((fk) => {
                report.push(`  - ➖ Removed 🔗 Foreign Key: \`${fk.name}\``)
            })
            t.foreign_keys.added.forEach((fk) => {
                report.push(`  - ➕ Added 🔗 Foreign Key: \`${fk.name}\``)
            })
            t.foreign_keys.modified.forEach((fk) => {
                report.push(
                    `  - 🔄 Modified 🔗 Foreign Key: \`${fk.from.name}\``,
                )
                if (fk.from.columns.join(',') !== fk.to.columns.join(',')) {
                    report.push(
                        `    - Columns changed: \`${fk.from.columns.join(
                            ',',
                        )}\` ➡️ \`${fk.to.columns.join(',')}\``,
                    )
                }
                if (fk.from.foreign_table !== fk.to.foreign_table) {
                    report.push(
                        `    - Foreign table changed: \`${fk.from.foreign_table}\` ➡️ \`${fk.to.foreign_table}\``,
                    )
                }
                if (
                    fk.from.foreign_columns.join(',') !==
                    fk.to.foreign_columns.join(',')
                ) {
                    report.push(
                        `    - Foreign columns changed: \`${fk.from.foreign_columns.join(
                            ',',
                        )}\` ➡️ \`${fk.to.foreign_columns.join(',')}\``,
                    )
                }
                if (fk.from.on_update !== fk.to.on_update) {
                    report.push(
                        `    - On update changed: \`${fk.from.on_update}\` ➡️ \`${fk.to.on_update}\``,
                    )
                }
                if (fk.from.on_delete !== fk.to.on_delete) {
                    report.push(
                        `    - On delete changed: \`${fk.from.on_delete}\` ➡️ \`${fk.to.on_delete}\``,
                    )
                }
                if (fk.from.match_option !== fk.to.match_option) {
                    report.push(
                        `    - Match option changed: \`${fk.from.match_option}\` ➡️ \`${fk.to.match_option}\``,
                    )
                }
            })

            // Triggers
            t.triggers.removed.forEach((tr) => {
                report.push(`  - ➖ Removed 🔥 Trigger: \`${tr.name}\``)
            })
            t.triggers.added.forEach((tr) => {
                report.push(`  - ➕ Added 🔥 Trigger: \`${tr.name}\``)
            })
            t.triggers.modified.forEach((tr) => {
                report.push(`  - 🔄 Modified 🔥 Trigger: \`${tr.from.name}\``)
                if (tr.from.description !== tr.to.description) {
                    report.push(
                        `    - Description changed: \`${tr.from.description}\` ➡️ \`${tr.to.description}\``,
                    )
                }
                if (tr.from.timing !== tr.to.timing) {
                    report.push(
                        `    - Timing changed: \`${tr.from.timing}\` ➡️ \`${tr.to.timing}\``,
                    )
                }
                if (tr.from.event !== tr.to.event) {
                    report.push(
                        `    - Event changed: \`${tr.from.event}\` ➡️ \`${tr.to.event}\``,
                    )
                }
                if (tr.from.level !== tr.to.level) {
                    report.push(
                        `    - Level changed: \`${tr.from.level}\` ➡️ \`${tr.to.level}\``,
                    )
                }
                if (tr.from.function_schema !== tr.to.function_schema) {
                    report.push(
                        `    - Function schema changed: \`${tr.from.function_schema}\` ➡️ \`${tr.to.function_schema}\``,
                    )
                }
                if (tr.from.function_name !== tr.to.function_name) {
                    report.push(
                        `    - Function name changed: \`${tr.from.function_name}\` ➡️ \`${tr.to.function_name}\``,
                    )
                }
            })
        })
    }

    if (opts?.includeMigrationCode) {
        const migrations = generateMigrationSQL(jsonReport)

        report.push('\n\n# Apply Changes\n')

        if (migrations.length > 0) {
            report.push('```sql')

            for (const migration of migrations) {
                for (const line of migration) {
                    report.push(line)
                    report.push('')
                }
            }

            report.push('```')
        } else {
            report.push('_No changes to apply_')
        }
    }

    return report.join('\n')
}
