import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id').notNull(),
    side: text('side').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('comments_round_created').on(table.roundId, table.createdAt),
  ],
);
