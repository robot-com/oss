import { mkdir, writeFile } from 'node:fs/promises'
import { Command } from 'commander'
import postgres from 'postgres'
import { createMarkdownReport } from '../report'
import { createJsonDiffReport } from '../report/json'
import { fetchSchemaPostgresSQL } from '../schema'
import { createSchemaFetchCommand } from './commands/schema-fetch'
import { createSchemaDiffCommand } from './commands/schema-diff'
import { createSchemaPushCommand } from './commands/schema-push'
import { createMigrateGenerateCommand } from './commands/migrate-generate'

const program = new Command()

program
    .name('postgres-schema-tools')
    .description('Tools for managing Postgres database schemas')
    .version('0.0.6')

// Schema commands
const schema = program
    .command('schema')
    .description('Schema operations (fetch, diff, push)')

schema.addCommand(createSchemaFetchCommand())
schema.addCommand(createSchemaDiffCommand())
schema.addCommand(createSchemaPushCommand())

// Migrate commands
const migrate = program
    .command('migrate')
    .description('Migration operations (generate, apply)')

migrate.addCommand(createMigrateGenerateCommand())

// Backward compatibility: keep diff-report as deprecated alias
program
    .command('diff-report')
    .description('[DEPRECATED] Use "schema diff" instead')
    .argument('<dbA>', 'First database URL')
    .argument('<dbB>', 'Second database URL')
    .option('--out-dir <dir>', 'Output directory')
    .option(
        '--fail-on-changes',
        'Exit with code 1 if changes detected',
        false,
    )
    .action(async (dbA, dbB, opts) => {
        console.warn(
            '⚠️  Warning: "diff-report" is deprecated. Use "schema diff" instead.\n',
        )

        const db1 = postgres(dbA)
        const db2 = postgres(dbB)

        try {
            const schema1 = await fetchSchemaPostgresSQL(db1)
            const schema2 = await fetchSchemaPostgresSQL(db2)
            const report = createJsonDiffReport(schema1, schema2)

            if (opts.outDir) {
                await mkdir(opts.outDir, { recursive: true })
                await writeFile(
                    `${opts.outDir}/schema1.json`,
                    JSON.stringify(schema1, null, 2),
                )
                await writeFile(
                    `${opts.outDir}/schema2.json`,
                    JSON.stringify(schema2, null, 2),
                )
                await writeFile(
                    `${opts.outDir}/report.json`,
                    JSON.stringify(report, null, 2),
                )
                await writeFile(
                    `${opts.outDir}/report.md`,
                    createMarkdownReport(report),
                )
            } else {
                console.log(createMarkdownReport(report))
            }

            if (report.has_changes && opts.failOnChanges) {
                process.exit(1)
            }
        } catch (e) {
            console.error(e)
            process.exit(1)
        } finally {
            await db1.end()
            await db2.end()
        }
    })

program.parse()
