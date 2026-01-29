import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { loadSchema } from '../utils/source-loader'
import { createJsonDiffReport } from '../../report/json'
import { createMarkdownReport } from '../../report/markdown'

export function createSchemaDiffCommand(): Command {
    return new Command('diff')
        .description('Compare two schemas')
        .argument('<sourceA>', 'First schema source')
        .argument('<sourceB>', 'Second schema source')
        .option('--type-a <type>', 'Type of sourceA', 'auto')
        .option('--type-b <type>', 'Type of sourceB', 'auto')
        .option('--output <path>', 'Output file path (default: stdout)')
        .option(
            '--format <format>',
            'Output format: json|markdown',
            'markdown',
        )
        .option(
            '--fail-on-changes',
            'Exit with code 1 if differences detected',
            false,
        )
        .action(async (sourceA, sourceB, opts) => {
            try {
                const schemaA = await loadSchema(sourceA, opts.typeA)
                const schemaB = await loadSchema(sourceB, opts.typeB)

                const report = createJsonDiffReport(schemaA, schemaB)

                let output: string
                if (opts.format === 'json') {
                    output = JSON.stringify(report, null, 2)
                } else {
                    output = createMarkdownReport(report)
                }

                if (opts.output) {
                    await writeFile(opts.output, output)
                    console.log(`Report saved to ${opts.output}`)
                } else {
                    console.log(output)
                }

                if (report.has_changes && opts.failOnChanges) {
                    process.exit(1)
                }
            } catch (error: any) {
                console.error(`Error: ${error.message}`)
                process.exit(1)
            }
        })
}
