import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { loadSchema } from '../utils/source-loader'

export function createSchemaFetchCommand(): Command {
    return new Command('fetch')
        .description(
            'Fetch schema from a source (database, Drizzle file, or JSON)',
        )
        .argument(
            '<source>',
            'Source: database URL or file path (required for Drizzle)',
        )
        .option(
            '--type <type>',
            'Source type: auto|postgres|drizzle|json',
            'auto',
        )
        .option('--output <path>', 'Output file path (default: stdout)')
        .option('--format <format>', 'Output format: json|yaml', 'json')
        .action(async (source, opts) => {
            try {
                const schema = await loadSchema(source, opts.type)
                const output = JSON.stringify(schema, null, 2)

                if (opts.output) {
                    await writeFile(opts.output, output)
                    console.log(`Schema saved to ${opts.output}`)
                } else {
                    console.log(output)
                }
            } catch (error: any) {
                console.error(`Error: ${error.message}`)
                process.exit(1)
            }
        })
}
