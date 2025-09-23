import {
    bigint,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    uuid,
} from 'drizzle-orm/pg-core'

export const rbf_outbox = pgTable(
    'rbf_outbox',
    {
        id: uuid('id').defaultRandom().notNull(),
        namespace: text('namespace').notNull(),
        source_request_id: text('source_request_id').notNull(),
        type: text('type', { enum: ['request', 'message'] }).notNull(),
        path: text('path').notNull(),
        data: jsonb('data'),
        target_at: bigint('target_at', { mode: 'number' }),
        created_at: bigint('created_at', { mode: 'number' })
            .notNull()
            .$defaultFn(() => Date.now()),
    },
    (t) => [primaryKey({ columns: [t.namespace, t.id] })],
)

export const rbf_results = pgTable(
    'rbf_results',
    {
        request_id: text('request_id').notNull(),
        namespace: text('namespace').notNull(),
        requested_path: text('requested_path').notNull(),
        requested_input: text('requested_input').notNull(),
        data: jsonb('data'),
        status: integer('status').notNull(),
        created_at: bigint('created_at', { mode: 'number' })
            .notNull()
            .$defaultFn(() => Date.now()),
    },
    (t) => [primaryKey({ columns: [t.namespace, t.request_id] })],
)
