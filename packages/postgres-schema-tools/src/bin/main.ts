import { mkdir, writeFile } from 'node:fs/promises'
import { Command } from 'commander'
import postgres from 'postgres'
import { createMarkdownReport } from '../report'
import { createJsonDiffReport } from '../report/json'
import { fetchSchemaPostgresSQL } from '../schema'

const program = new Command()

program
    .name('postgres-schema-tools')
    .description('Tools for managing Postgres database schemas.')
    .version('0.0.1')

program
    .command('diff-report')
    .description('Compare two database schemas and generate a report.')
    .argument('<dbA>', 'The first url to compare.')
    .argument('<dbB>', 'The second url schema to compare.')
    .option('--out-dir <dir>', 'The output directory for the report.')
    .option(
        '--fail-on-changes',
        'Exit with a non-zero code if there are changes.',
        false,
    )
    .action(async (db1Url, db2Url, opts) => {
        const db1 = postgres(db1Url)
        const db2 = postgres(db2Url)

        const failIfChanges = opts.failOnChanges
        const outDir = opts.outDir

        try {
            const schema1 = await fetchSchemaPostgresSQL(db1)
            const schema2 = await fetchSchemaPostgresSQL(db2)

            const jsonReport = createJsonDiffReport(schema1, schema2)

            if (outDir) {
                // TODO: Write report to file
                await mkdir(outDir, { recursive: true })
                await writeFile(
                    `${outDir}/schema1.json`,
                    JSON.stringify(schema1, null, 2),
                )
                await writeFile(
                    `${outDir}/schema2.json`,
                    JSON.stringify(schema2, null, 2),
                )
                await writeFile(
                    `${outDir}/report.json`,
                    JSON.stringify(jsonReport, null, 2),
                )
                await writeFile(
                    `${outDir}/report.md`,
                    createMarkdownReport(jsonReport),
                )
            } else {
                console.log(createMarkdownReport(jsonReport))
            }

            if (jsonReport.has_changes && failIfChanges) {
                process.exit(1)
            }
        } catch (e) {
            console.error(e)
        }

        db1.end()
        db2.end()
    })

program.parse()
