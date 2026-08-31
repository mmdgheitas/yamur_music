import fsp from "node:fs/promises";
import path from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  BOOTSTRAP_SQL,
  categories,
  songs,
  systemConfig,
  users,
} from "@/db/schema";
import { config } from "@/lib/config";
import { hashPassword } from "@/lib/password";
import { ensureUploadDirs, mimeForFile, songsDir } from "@/lib/storage";
import { extractAudioMetadata } from "@/lib/audio-meta";

type SeedCategory = {
  name: string;
  slug: string;
  description: string;
  accent: string;
  order: number;
  files: { file: string; title: string; artist: string }[];
};

const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Chill",
    slug: "chill",
    description: "Warm low-tempo pads for the slow hours of the afternoon.",
    accent: "amber",
    order: 0,
    files: [
      { file: "chill-amber-dusk.wav", title: "Amber Dusk", artist: "House Ensemble" },
      { file: "chill-slow-pour.wav", title: "Slow Pour", artist: "House Ensemble" },
    ],
  },
  {
    name: "Study",
    slug: "study",
    description: "Steady, low-distraction textures for laptop regulars.",
    accent: "emerald",
    order: 1,
    files: [
      { file: "study-paper-light.wav", title: "Paper & Light", artist: "Desk Lamp Trio" },
      { file: "study-quiet-focus.wav", title: "Quiet Focus", artist: "Desk Lamp Trio" },
    ],
  },
];

let bootstrapPromise: Promise<void> | null = null;

async function applySchema(): Promise<void> {
  await db.execute(BOOTSTRAP_SQL);
}

async function seedUsers(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  await db.insert(users).values([
    {
      username: config.defaultAdmin.username,
      password: await hashPassword(config.defaultAdmin.password),
      role: "ADMIN",
    },
    {
      username: config.defaultGuest.username,
      password: await hashPassword(config.defaultGuest.password),
      role: "GUEST",
    },
  ]);
  console.log("[bootstrap] seeded default accounts");
}

async function seedConfig(): Promise<void> {
  await db
    .insert(systemConfig)
    .values({ id: 1, allowGuestUpload: false, scheduleTimezone: "LOCAL" })
    .onConflictDoNothing({ target: systemConfig.id });
}

async function seedCategoriesAndSongs(): Promise<void> {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing.length > 0) return;

  ensureUploadDirs();

  for (const seed of SEED_CATEGORIES) {
    const [category] = await db
      .insert(categories)
      .values({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        accent: seed.accent,
        order: seed.order,
      })
      .returning();

    let order = 0;
    for (const track of seed.files) {
      const source = path.join(config.seedAudioDir, track.file);
      try {
        const buffer = await fsp.readFile(source);
        const targetName = `seed-${track.file}`;
        await fsp.writeFile(path.join(songsDir, targetName), buffer);
        const meta = await extractAudioMetadata(buffer, track.file, mimeForFile(track.file));
        await db.insert(songs).values({
          title: track.title,
          artist: track.artist,
          filePath: `${config.songDirName}/${targetName}`,
          mimeType: mimeForFile(track.file, "audio/wav"),
          sizeBytes: buffer.byteLength,
          duration: meta.duration,
          order: order++,
          source: "SEED",
          uploadedBy: "system",
          categoryId: category.id,
        });
      } catch (error) {
        console.warn(
          `[bootstrap] skipped seed track ${track.file}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  console.log("[bootstrap] seeded categories and demo tracks");
}

async function runBootstrap(): Promise<void> {
  // Advisory lock keeps concurrent cold-start requests from racing each other.
  await db.execute(sql`SELECT pg_advisory_lock(918273645)`);
  try {
    await applySchema();
    await seedUsers();
    await seedConfig();
    await seedCategoriesAndSongs();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(918273645)`);
  }
}

/** Idempotent, memoized database + storage bootstrap invoked by every route handler. */
export async function ensureBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

/** Convenience helper used by the dashboard server component. */
export async function listCategoriesOrdered() {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.order), asc(categories.name));
}

export async function getSystemConfig() {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(systemConfig)
    .values({ id: 1, allowGuestUpload: false, scheduleTimezone: "LOCAL" })
    .onConflictDoUpdate({ target: systemConfig.id, set: { id: 1 } })
    .returning();
  return created;
}
