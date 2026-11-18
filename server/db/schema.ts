import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

// Shared AON workspace: private Site membership plus authenticated API identity.
export const aonTasks = sqliteTable("aon_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  owner: text("owner").notNull(),
  due: text("due").notNull(),
  status: text("status").notNull(),
  next: text("next").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
  creationPayload: text("creation_payload").notNull(),
}, (table) => [index("aon_tasks_updated_at_idx").on(table.updatedAt)]);

export const aonEvents = sqliteTable("aon_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
  creationPayload: text("creation_payload").notNull(),
}, (table) => [index("aon_events_date_idx").on(table.date, table.time)]);
