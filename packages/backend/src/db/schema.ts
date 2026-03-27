import {
  pgTable,
  uuid,
  text,
  bigint,
  serial,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title"),
  mode: text("mode").notNull().default("yolo"),
  sandboxId: text("sandbox_id"),
  deployUrl: text("deploy_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  seq: serial("seq").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const fileSnapshots = pgTable(
  "file_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    path: text("path").notNull(),
    content: text("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.conversationId, table.path)],
);

export const userQuotas = pgTable("user_quotas", {
  userId: uuid("user_id").primaryKey(),
  totalTokens: bigint("total_tokens", { mode: "number" })
    .notNull()
    .default(1000000),
  usedTokens: bigint("used_tokens", { mode: "number" }).notNull().default(0),
});
