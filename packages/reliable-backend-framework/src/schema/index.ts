import {
    bigint,
    integer,
    jsonb,
    pgTable,
    text,
    uuid,
} from 'drizzle-orm/pg-core'

export const rbf_outbox = pgTable('rbf_outbox', {
    id: uuid('id').defaultRandom().primaryKey(),
    source_request_id: text('source_request_id').notNull(),
    type: text('type', { enum: ['request', 'message'] }).notNull(),
    path: text('path').notNull(),
    data: jsonb('data').notNull(),
    target_at: bigint('target_at', { mode: 'number' }),
    created_at: bigint('created_at', { mode: 'number' })
        .notNull()
        .$defaultFn(() => Date.now()),
})

export const rbf_results = pgTable('rbf_results', {
    request_id: text('request_id').primaryKey(),
    requested_path: text('requested_path').notNull(),
    requested_input: text('requested_input').notNull(),
    data: jsonb('data').notNull(),
    status: integer('status').notNull(),
    created_at: bigint('created_at', { mode: 'number' })
        .notNull()
        .$defaultFn(() => Date.now()),
})
