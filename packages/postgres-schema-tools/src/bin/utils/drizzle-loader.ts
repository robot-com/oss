import { createJiti } from 'jiti'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fetchSchemaDrizzleORMWithNormalizedViews } from '../../schema/drizzle/fetch'
import type { LocalSchema } from '../../schema/local/types'

interface DrizzleSchemaModule {
    default?: Record<string, unknown>
    schema?: Record<string, unknown>
    [key: string]: unknown
}

export async function loadDrizzleSchemaFromFile(
    schemaPath: string,
    options: { cwd?: string } = {},
): Promise<LocalSchema> {
    const cwd = options.cwd || process.cwd()

    // Resolve file path (required parameter)
    const filePath = resolveSchemaFile(schemaPath, cwd)

    // Load TypeScript module
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        cache: false,
        requireCache: false,
    })

    try {
        const module = (await jiti.import(filePath)) as DrizzleSchemaModule

        // Extract schema object (simplified based on user feedback)
        // Pattern 1: default export or Pattern 2: export const schema
        const schemaObj = module.default || module.schema

        if (!schemaObj || typeof schemaObj !== 'object') {
            throw new Error(
                `No valid schema export found in ${filePath}\n` +
                    `Expected: export default { ... } or export const schema = { ... }`,
            )
        }

        // Convert to LocalSchema and normalize view definitions using PGLite
        return fetchSchemaDrizzleORMWithNormalizedViews(schemaObj)
    } catch (error: any) {
        throw new Error(
            `Failed to load Drizzle schema from ${filePath}\n${error.message}`,
        )
    }
}

function resolveSchemaFile(schemaPath: string, cwd: string): string {
    const resolved = resolve(cwd, schemaPath)
    if (!existsSync(resolved)) {
        throw new Error(`Schema file not found: ${resolved}`)
    }
    return resolved
}
