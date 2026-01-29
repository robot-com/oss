import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email'),
})

export const posts = pgTable('posts', {
    id: integer('id').primaryKey(),
    userId: integer('user_id').notNull(),
    title: text('title').notNull(),
    content: text('content'),
})

// Export as default for testing
export default {
    users,
    posts,
}
