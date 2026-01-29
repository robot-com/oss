import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { loadSchema } from '../utils/source-loader'
import { generatePushDiffSchema } from '../../schema/push/diff'

export function createMigrateGenerateCommand(): Command {
    return new Command('generate')
        .description('Generate migration SQL between two schemas')
        .argument('<from>', 'Current schema source')
        .argument('<to>', 'Target schema source')
        .option('--type-from <type>', 'Type of from source', 'auto')
        .option('--type-to <type>', 'Type of to source', 'auto')
        .option('--output <path>', 'Output SQL file (default: stdout)')
        .option('--format <format>', 'Output format: sql|batched', 'sql')
        .action(async (from, to, opts) => {
            try {
                const fromSchema = await loadSchema(from, opts.typeFrom)
                const toSchema = await loadSchema(to, opts.typeTo)

                const batches = generatePushDiffSchema(fromSchema, toSchema)

                let output: string
                if (opts.format === 'batched') {
                    output = JSON.stringify(batches, null, 2)
                } else {
                    output = batches.flat().join(';\n\n') + ';'
                }

                if (opts.output) {
                    await writeFile(opts.output, output)
                    console.log(`Migration saved to ${opts.output}`)
                } else {
                    console.log(output)
                }
            } catch (error: any) {
                console.error(`Error: ${error.message}`)
                process.exit(1)
            }
        })
}
