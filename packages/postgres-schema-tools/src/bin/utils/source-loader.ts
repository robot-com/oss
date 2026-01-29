import postgres from 'postgres'
import { readFile } from 'node:fs/promises'
import { fetchSchemaPostgresSQL } from '../../schema/remote/fetch'
import { loadDrizzleSchemaFromFile } from './drizzle-loader'
import type { RemoteSchema } from '../../schema/remote/types'
import { localSchemaToRemoteSchema } from '../../schema/local/to-remote'

export type SourceType = 'auto' | 'postgres' | 'drizzle' | 'json'

export async function loadSchema(
    source: string,
    type: SourceType = 'auto',
): Promise<RemoteSchema> {
    const detectedType = type === 'auto' ? detectSourceType(source) : type

    switch (detectedType) {
        case 'postgres': {
            const db = postgres(source)
            try {
                const schema = await fetchSchemaPostgresSQL(db)
                await db.end()
                return schema
            } catch (error) {
                await db.end()
                throw error
            }
        }

        case 'drizzle': {
            // source must be a file path to the schema
            const localSchema = await loadDrizzleSchemaFromFile(source)
            return localSchemaToRemoteSchema(localSchema)
        }

        case 'json': {
            const content = await readFile(source, 'utf-8')
            return JSON.parse(content)
        }

        default:
            throw new Error(`Unknown source type: ${detectedType}`)
    }
}

function detectSourceType(source: string): SourceType {
    if (
        source.startsWith('postgres://') ||
        source.startsWith('postgresql://')
    ) {
        return 'postgres'
    }
    if (source.endsWith('.json')) {
        return 'json'
    }
    if (source.endsWith('.ts') || source.endsWith('.js')) {
        return 'drizzle'
    }
    return 'json' // Default to JSON for other files
}
