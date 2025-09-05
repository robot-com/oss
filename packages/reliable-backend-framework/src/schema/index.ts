import {
    bigint,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core'

export const rbf_outbox = pgTable('rbf_outbox', {
    id: uuid('id').defaultRandom().primaryKey(),
    subject: text('subject').notNull(),
    payload: jsonb('payload').notNull(),
    headers: jsonb('headers').notNull(),
    status: text('status').notNull().default('pending'),
    created_at: bigint('created_at', { mode: 'number' })
        .notNull()
        .$defaultFn(() => Date.now()),
    scheduled_for: bigint('scheduled_for', { mode: 'number' })
        .notNull()
        .$defaultFn(() => Date.now()),
    attempt_count: integer('attempt_count').notNull().default(0),
    last_attempt_at: bigint('last_attempt_at', { mode: 'number' })
        .notNull()
        .$defaultFn(() => Date.now()),
})

export const rbf_results = pgTable('rbf_results', {
    request_id: text('request_id').primaryKey(),
    result: jsonb('result').notNull(),
    status: text('status').notNull(),
    created_at: timestamp('created_at').notNull().defaultNow(),
    expires_at: timestamp('expires_at'),
})
