import { Command } from 'commander'
import postgres from 'postgres'
import { loadSchema } from '../utils/source-loader'
import { fetchSchemaPostgresSQL } from '../../schema/remote/fetch'
import { generatePushNewSchema } from '../../schema/push/new'
import { generatePushDiffSchema } from '../../schema/push/diff'
import { writeFile } from 'node:fs/promises'

export function createSchemaPushCommand(): Command {
    return new Command('push')
        .description('Push schema to target database')
        .argument('<source>', 'Schema source (file or database URL)')
        .argument('<target>', 'Target database URL')
        .option('--type <type>', 'Source type', 'auto')
        .option('--mode <mode>', 'Push mode: new|diff', 'diff')
        .option('--dry-run', 'Generate SQL without executing', false)
        .option('--output <path>', 'Save generated SQL to file')
        .option('--yes', 'Skip confirmation prompts', false)
        .action(async (source, target, opts) => {
            try {
                const sourceSchema = await loadSchema(source, opts.type)
                const targetDb = postgres(target)

                let statements: string[][]

                if (opts.mode === 'new') {
                    // Generate SQL for new schema
                    const localSchema = {
                        tables: sourceSchema.tables,
                        enums: sourceSchema.enums,
                        views: sourceSchema.views,
                    }
                    statements = [generatePushNewSchema(localSchema)]
                } else {
                    // Generate diff migration
                    const currentSchema = await fetchSchemaPostgresSQL(targetDb)
                    statements = generatePushDiffSchema(
                        currentSchema,
                        sourceSchema,
                    )
                }

                const sql = statements.flat().join(';\n\n') + ';'

                // Output SQL
                if (opts.output) {
                    await writeFile(opts.output, sql)
                    console.log(`SQL saved to ${opts.output}`)
                }

                if (opts.dryRun) {
                    console.log('\n=== Generated SQL (Dry Run) ===\n')
                    console.log(sql)
                    await targetDb.end()
                    return
                }

                // Confirm before execution
                if (!opts.yes) {
                    console.log(
                        `\n⚠️  This will modify the database: ${target}`,
                    )
                    console.log(
                        `Statements to execute: ${statements.flat().length}`,
                    )
                    console.log(
                        '\nUse --dry-run to preview or --yes to skip this prompt\n',
                    )
                    await targetDb.end()
                    return
                }

                // Execute migration
                console.log('Executing migration...')
                for (const batch of statements) {
                    await targetDb.begin(async (tx) => {
                        for (const stmt of batch) {
                            await tx.unsafe(stmt)
                        }
                    })
                }

                console.log('✓ Migration completed successfully')
                await targetDb.end()
            } catch (error: any) {
                console.error(`Error: ${error.message}`)
                process.exit(1)
            }
        })
}
