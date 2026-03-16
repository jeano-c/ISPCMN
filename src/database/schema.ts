import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// --------------------------------------------------------
// Table: users
// --------------------------------------------------------
export const users = sqliteTable('users', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text('name', { length: 100 }).notNull(),
  email: text('email', { length: 150 }).notNull().unique(),
  createdAt: text('createdat').default(sql`CURRENT_TIMESTAMP`),
  password: text('password'),
  avatar: text('avatar'),
});

// --------------------------------------------------------
// Table: surveys
// --------------------------------------------------------
export const surveys = sqliteTable(
  'surveys',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    formData: text('FormData').default('[{"id":1,"questions":[]}]'),
    publicId: text('PublicId').notNull(),
    allowMultipleSubmissions: integer('AllowMultipleSubmissions', {
      mode: 'boolean',
    }).default(true),
    isPublished: integer('isPublished', { mode: 'boolean' }).default(false),
    hasReviewPage: integer('hasReviewPage', { mode: 'boolean' }).default(false),
  },
  (table) => ({
    publicIdIdx: uniqueIndex('IX_surveys_PublicId').on(table.publicId),
  }),
);

// --------------------------------------------------------
// Table: responses
// --------------------------------------------------------
export const responses = sqliteTable(
  'responses',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    surveyId: integer('survey_id').references(() => surveys.id, {
      onDelete: 'cascade',
    }),
    responseData: text('response_data', { mode: 'json' }),
    submittedAt: text('submitted_at').default(sql`CURRENT_TIMESTAMP`),
    browserId: text('browser_id'),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    browserIdIdx: index('IX_responce_browser_id').on(table.browserId),
  }),
);

// --------------------------------------------------------
// Table: media
// --------------------------------------------------------
export const media = sqliteTable('media', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  mediaUrl: text('media_url'),
});

// --------------------------------------------------------
// Drizzle Relations (Optional but highly recommended)
// This makes querying joined data much easier in your services
// --------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  surveys: many(surveys),
  responses: many(responses),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  author: one(users, {
    fields: [surveys.userId],
    references: [users.id],
  }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one }) => ({
  survey: one(surveys, {
    fields: [responses.surveyId],
    references: [surveys.id],
  }),
  user: one(users, {
    fields: [responses.userId],
    references: [users.id],
  }),
}));

// --------------------------------------------------------
// TypeScript Types for your Services
// --------------------------------------------------------
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = typeof surveys.$inferInsert;

export type Response = typeof responses.$inferSelect;
export type InsertResponse = typeof responses.$inferInsert;

export type Media = typeof media.$inferSelect;
export type InsertMedia = typeof media.$inferInsert;
