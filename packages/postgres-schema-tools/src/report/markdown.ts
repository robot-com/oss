import type { JsonReport } from './type'

export function createMarkdownReport(
    jsonReport: JsonReport,
    nameA = 'Current',
    nameB = 'New'
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
        jsonReport.enums.removed.forEach((e) =>
            report.push(`- ➖ Removed Enum: \`${e.name}\``)
        )
        jsonReport.enums.added.forEach((e) =>
            report.push(`- ➕ Added Enum: \`${e.name}\``)
        )
        jsonReport.enums.modified.forEach((e) =>
            report.push(`- 🔄 Modified Enum: \`${e.from.name}\``)
        )
    }

    // Views section
    if (
        jsonReport.views.removed.length > 0 ||
        jsonReport.views.added.length > 0 ||
        jsonReport.views.modified.length > 0
    ) {
        report.push('\n## 📜 Views')
        jsonReport.views.removed.forEach((v) =>
            report.push(`- ➖ Removed View: \`${v.name}\``)
        )
        jsonReport.views.added.forEach((v) =>
            report.push(`- ➕ Added View: \`${v.name}\``)
        )
        jsonReport.views.modified.forEach((v) => {
            report.push(`- 🔄 Modified View: \`${v.from.name}\``)
            if (v.from.definition !== v.to.definition) {
                report.push(
                    `  - Definition changed: \`${v.from.definition}\` ➡️ \`${v.to.definition}\``
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
        jsonReport.tables.removed.forEach((t) =>
            report.push(`- ➖ Removed 🔲 Table: \`${t.name}\``)
        )
        jsonReport.tables.added.forEach((t) =>
            report.push(`- ➕ Added 🔲 Table: \`${t.name}\``)
        )

        jsonReport.tables.modified.forEach((t) => {
            report.push(`- 🔄 Modified 🔲 Table: \`${t.name}\``)

            // Columns
            t.columns.removed.forEach((c) =>
                report.push(`  - ➖ Removed 📊 Column: \`${c.name}\``)
            )
            t.columns.added.forEach((c) =>
                report.push(`  - ➕ Added 📊 Column: \`${c.name}\``)
            )

            // Constraints
            t.constraints.removed.forEach((c) =>
                report.push(`  - ➖ Removed 🔑 Constraint: \`${c.name}\``)
            )
            t.constraints.added.forEach((c) =>
                report.push(`  - ➕ Added 🔑 Constraint: \`${c.name}\``)
            )

            // Indexes
            t.indexes.removed.forEach((i) =>
                report.push(`  - ➖ Removed ⚡️ Index: \`${i.name}\``)
            )
            t.indexes.added.forEach((i) =>
                report.push(`  - ➕ Added ⚡️ Index: \`${i.name}\``)
            )

            // Foreign Keys
            t.foreign_keys.removed.forEach((fk) =>
                report.push(`  - ➖ Removed 🔗 Foreign Key: \`${fk.name}\``)
            )
            t.foreign_keys.added.forEach((fk) =>
                report.push(`  - ➕ Added 🔗 Foreign Key: \`${fk.name}\``)
            )

            // Triggers
            t.triggers.removed.forEach((tr) =>
                report.push(`  - ➖ Removed 🔥 Trigger: \`${tr.name}\``)
            )
            t.triggers.added.forEach((tr) =>
                report.push(`  - ➕ Added 🔥 Trigger: \`${tr.name}\``)
            )
            t.triggers.modified.forEach((tr) => {
                report.push(`  - 🔄 Modified 🔥 Trigger: \`${tr.from.name}\``)
                if (tr.from.definition !== tr.to.definition) {
                    report.push(
                        `    - Definition changed: \`${tr.from.definition}\` ➡️ \`${tr.to.definition}\``
                    )
                }
            })
        })
    }

    return report.join('\n')
}
