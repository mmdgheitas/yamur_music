/**
 * Autonomous Cafe Audio Management System
 * Database schema (Drizzle ORM / PostgreSQL) — mirrors the specified Prisma models:
 *   User, Category, Song, SystemConfig (+ TelegramWhitelist for bot access control)
 */
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "GUEST"]);
export const songSourceEnum = pgEnum("song_source", ["WEB", "TELEGRAM", "SEED"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    password: text("password").notNull(),
    role: userRoleEnum("role").notNull().default("GUEST"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_key").on(table.username)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    accent: text("accent").notNull().default("amber"),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("categories_slug_key").on(table.slug)],
);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default("Unknown Artist"),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type").notNull().default("audio/mpeg"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    duration: integer("duration").notNull().default(0),
    order: integer("order").notNull().default(0),
    source: songSourceEnum("source").notNull().default("WEB"),
    uploadedBy: text("uploaded_by").notNull().default("system"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("songs_category_order_idx").on(table.categoryId, table.order),
  ],
);

export const systemConfig = pgTable("system_config", {
  id: integer("id").primaryKey().default(1),
  allowGuestUpload: boolean("allow_guest_upload").notNull().default(false),
  cafeName: text("cafe_name").notNull().default("Kavé Nour"),
  /**
   * Timezone used by the scheduled-playlist engine. "LOCAL" means the browser/device
   * clock of whichever machine runs the web app; any other value is an IANA zone
   * name (e.g. "Asia/Tehran") interpreted in every client the same way.
   */
  scheduleTimezone: text("schedule_timezone").notNull().default("LOCAL"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Daily playlist schedule: when the wall clock (in `system_config.schedule_timezone`)
 * hits `time`, the engine starts playing `category_id` right after the current song
 * ends, then loops that playlist.
 */
export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull().default(""),
    /** 24-hour "HH:MM" in the configured schedule timezone. */
    time: text("time").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("schedule_entries_time_idx").on(table.time)],
);

export const telegramWhitelist = pgTable(
  "telegram_whitelist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: text("telegram_id").notNull(),
    label: text("label").notNull().default("Staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("telegram_whitelist_tid_key").on(table.telegramId)],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  songs: many(songs),
}));

export const songsRelations = relations(songs, ({ one }) => ({
  category: one(categories, {
    fields: [songs.categoryId],
    references: [categories.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type SongRow = typeof songs.$inferSelect;
export type SystemConfigRow = typeof systemConfig.$inferSelect;
export type TelegramWhitelistRow = typeof telegramWhitelist.$inferSelect;
export type ScheduleEntryRow = typeof scheduleEntries.$inferSelect;

/** Raw idempotent DDL, used by the runtime bootstrapper on fresh/self-hosted installs. */
export const BOOTSTRAP_SQL = sql`
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  DO $$ BEGIN
    CREATE TYPE "user_role" AS ENUM ('ADMIN', 'GUEST');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "song_source" AS ENUM ('WEB', 'TELEGRAM', 'SEED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "username" text NOT NULL,
    "password" text NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'GUEST',
    "created_at" timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users" ("username");

  CREATE TABLE IF NOT EXISTS "categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "description" text,
    "accent" text NOT NULL DEFAULT 'amber',
    "order" integer NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key" ON "categories" ("slug");

  CREATE TABLE IF NOT EXISTS "songs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" text NOT NULL,
    "artist" text NOT NULL DEFAULT 'Unknown Artist',
    "file_path" text NOT NULL,
    "mime_type" text NOT NULL DEFAULT 'audio/mpeg',
    "size_bytes" bigint NOT NULL DEFAULT 0,
    "duration" integer NOT NULL DEFAULT 0,
    "order" integer NOT NULL DEFAULT 0,
    "source" "song_source" NOT NULL DEFAULT 'WEB',
    "uploaded_by" text NOT NULL DEFAULT 'system',
    "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
    "created_at" timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS "songs_category_order_idx" ON "songs" ("category_id", "order");

  CREATE TABLE IF NOT EXISTS "system_config" (
    "id" integer PRIMARY KEY DEFAULT 1,
    "allow_guest_upload" boolean NOT NULL DEFAULT false,
    "cafe_name" text NOT NULL DEFAULT 'Kavé Nour',
    "updated_at" timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "schedule_timezone" text NOT NULL DEFAULT 'LOCAL';

  CREATE TABLE IF NOT EXISTS "schedule_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "label" text NOT NULL DEFAULT '',
    "time" text NOT NULL,
    "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
    "enabled" boolean NOT NULL DEFAULT true,
    "created_at" timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS "schedule_entries_time_idx" ON "schedule_entries" ("time");

  CREATE TABLE IF NOT EXISTS "telegram_whitelist" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "telegram_id" text NOT NULL,
    "label" text NOT NULL DEFAULT 'Staff',
    "created_at" timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "telegram_whitelist_tid_key" ON "telegram_whitelist" ("telegram_id");
`;
