import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'

export async function createLocalDatabase<S extends Record<string, unknown>>(
    schema: S,
): Promise<
    PgliteDatabase<S> & {
        $client: PGlite
    }
> {
    const client = new PGlite({
        extensions: { pg_trgm },
    })

    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')

    return drizzle(client, { schema })
}
