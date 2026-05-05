import {
  type AnyPgColumn,
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --- better-auth tables ---
// See https://www.better-auth.com/docs/concepts/database#core-schema
// Keep column names/types aligned with better-auth's drizzle adapter expectations.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- business tables ---

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  mode: text("mode").notNull().default("yolo"),
  sandboxId: text("sandbox_id"),
  deployUrl: text("deploy_url"),
  agentRunning: boolean("agent_running").notNull().default(false),
  settings: jsonb("settings").notNull().default({}),
  // SET NULL: GC'ing a version must not lock the conversation.
  currentVersionId: uuid("current_version_id").references((): AnyPgColumn => versions.id, { onDelete: "set null" }),
  // Non-null = sandbox is currently checked out at this prior version (read-only preview).
  // Sender stays disabled until user explicitly Exits or Restores.
  previewingVersionId: uuid("previewing_version_id").references((): AnyPgColumn => versions.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  // Stores the agent-package Message's `content` field (discriminated
  // union of content blocks). Shape depends on role — see shared types.
  content: jsonb("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.conversationId, table.path)],
);

// Content-addressed blob pool: hash = sha256(content), immutable, shared across all versions/conversations.
export const fileBlobs = pgTable("file_blobs", {
  hash: text("hash").primaryKey(),
  content: text("content").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One checkpoint per turn; parentVersionId is the prior active version, may diverge after restore.
export const versions = pgTable("versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  parentVersionId: uuid("parent_version_id").references((): AnyPgColumn => versions.id, { onDelete: "set null" }),
  createdByMessageId: uuid("created_by_message_id").references(() => messages.id, { onDelete: "set null" }),
  label: text("label"),
  fileCount: integer("file_count").notNull(),
  totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// blobHash uses default RESTRICT — GC must verify ref_count=0 before deleting a blob.
export const versionFiles = pgTable(
  "version_files",
  {
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    blobHash: text("blob_hash")
      .notNull()
      .references(() => fileBlobs.hash),
  },
  (table) => [primaryKey({ columns: [table.versionId, table.path] })],
);

const DEFAULT_TOTAL_TOKENS = 1000000;
export const userQuotas = pgTable("user_quotas", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(DEFAULT_TOTAL_TOKENS),
  usedTokens: bigint("used_tokens", { mode: "number" }).notNull().default(0),
});

// Generic per-user key-value settings. Value shape depends on key.
// Known keys:
//   "mcp"            → Record<serverId, { envVars: Record<string, string>; installedAt: string }>
//   "vercel_oauth"   → AES-GCM encrypted blob { iv, data } (decrypts to VercelOAuthToken)
//   "supabase_oauth" → AES-GCM encrypted blob { iv, data } (decrypts to SupabaseOAuthToken)
export const settings = pgTable(
  "settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);
