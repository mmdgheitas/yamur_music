import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, songs, type SongRow } from "@/db/schema";
import type { SongDTO } from "@/lib/types";
import { badRequest, notFound } from "@/lib/http";
import {
  assertAudioFile,
  deleteStoredFile,
  extensionOf,
  mimeForFile,
  saveSongBuffer,
  saveSongStream,
} from "@/lib/storage";
import { extractAudioMetadata, extractAudioMetadataFromFile } from "@/lib/audio-meta";

export function serializeSong(row: SongRow): SongDTO {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    order: row.order,
    categoryId: row.categoryId,
    source: row.source,
    uploadedBy: row.uploadedBy,
    sizeBytes: Number(row.sizeBytes ?? 0),
    mimeType: row.mimeType,
    url: `/api/stream/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSongs(categoryId?: string): Promise<SongDTO[]> {
  const rows = categoryId
    ? await db
        .select()
        .from(songs)
        .where(eq(songs.categoryId, categoryId))
        .orderBy(asc(songs.order), asc(songs.createdAt))
    : await db.select().from(songs).orderBy(asc(songs.categoryId), asc(songs.order));
  return rows.map(serializeSong);
}

export async function getSongById(id: string): Promise<SongRow> {
  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  if (!row) throw notFound("Song not found");
  return row;
}

export async function nextOrderIndex(categoryId: string): Promise<number> {
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`cast(coalesce(max(${songs.order}), -1) as int)` })
    .from(songs)
    .where(eq(songs.categoryId, categoryId));
  return maxOrder + 1;
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!row) throw notFound("Target category does not exist");
}

export type CreateSongInput = {
  buffer: Buffer;
  originalName: string;
  categoryId: string;
  uploadedBy: string;
  source?: "WEB" | "TELEGRAM" | "SEED";
  title?: string | null;
  artist?: string | null;
  /** Duration measured client-side (used when server-side probing fails). */
  durationHint?: number | null;
};

/**
 * Writes the audio buffer to local disk, extracts metadata and appends the song
 * to the end of the target category playlist. Shared by the REST API and the bot.
 */
export async function createSong(input: CreateSongInput): Promise<SongDTO> {
  assertAudioFile(input.originalName, input.buffer.byteLength);
  await assertCategoryExists(input.categoryId);

  const mimeType = mimeForFile(input.originalName, "audio/mpeg");
  const meta = await extractAudioMetadata(input.buffer, input.originalName, mimeType);

  const stored = await saveSongBuffer(input.originalName, input.buffer);
  const order = await nextOrderIndex(input.categoryId);

  const duration =
    meta.duration > 0
      ? meta.duration
      : input.durationHint && input.durationHint > 0
        ? Math.round(input.durationHint)
        : 0;

  try {
    const [row] = await db
      .insert(songs)
      .values({
        title: (input.title?.trim() || meta.title).slice(0, 160),
        artist: (input.artist?.trim() || meta.artist || "Unknown Artist").slice(0, 160),
        filePath: stored.relativePath,
        mimeType,
        sizeBytes: stored.size,
        duration,
        order,
        source: input.source ?? "WEB",
        uploadedBy: input.uploadedBy.slice(0, 80),
        categoryId: input.categoryId,
      })
      .returning();
    return serializeSong(row);
  } catch (error) {
    // Roll the local file back so disk and DB never drift apart.
    await deleteStoredFile(stored.relativePath);
    throw error;
  }
}

export type CreateSongStreamInput = {
  body: ReadableStream<Uint8Array>;
  originalName: string;
  categoryId: string;
  uploadedBy: string;
  source?: "WEB" | "TELEGRAM" | "SEED";
  title?: string | null;
  artist?: string | null;
  durationHint?: number | null;
};

/**
 * Streaming ingest: writes the request body directly to disk (constant memory),
 * then probes metadata from the saved file. This is the fast upload path.
 */
export async function createSongFromStream(
  input: CreateSongStreamInput,
): Promise<SongDTO> {
  const ext = extensionOf(input.originalName);
  if (!ext) throw badRequest("Upload filename must include an audio extension");
  assertAudioFile(input.originalName, 1);
  await assertCategoryExists(input.categoryId);

  const mimeType = mimeForFile(input.originalName, "audio/mpeg");
  const stored = await saveSongStream(input.originalName, input.body);

  try {
    const meta = await extractAudioMetadataFromFile(
      stored.absolutePath,
      input.originalName,
    );
    const duration =
      meta.duration > 0
        ? meta.duration
        : input.durationHint && input.durationHint > 0
          ? Math.round(input.durationHint)
          : 0;

    const order = await nextOrderIndex(input.categoryId);
    const [row] = await db
      .insert(songs)
      .values({
        title: (input.title?.trim() || meta.title).slice(0, 160),
        artist: (input.artist?.trim() || meta.artist || "Unknown Artist").slice(0, 160),
        filePath: stored.relativePath,
        mimeType,
        sizeBytes: stored.size,
        duration,
        order,
        source: input.source ?? "WEB",
        uploadedBy: input.uploadedBy.slice(0, 80),
        categoryId: input.categoryId,
      })
      .returning();
    return serializeSong(row);
  } catch (error) {
    await deleteStoredFile(stored.relativePath);
    throw error;
  }
}

export async function updateSong(
  id: string,
  patch: { title?: string; artist?: string; categoryId?: string },
): Promise<SongDTO> {
  const current = await getSongById(id);
  const values: Partial<typeof songs.$inferInsert> = {};

  if (typeof patch.title === "string" && patch.title.trim()) {
    values.title = patch.title.trim().slice(0, 160);
  }
  if (typeof patch.artist === "string" && patch.artist.trim()) {
    values.artist = patch.artist.trim().slice(0, 160);
  }
  if (patch.categoryId && patch.categoryId !== current.categoryId) {
    await assertCategoryExists(patch.categoryId);
    values.categoryId = patch.categoryId;
    values.order = await nextOrderIndex(patch.categoryId);
  }

  if (Object.keys(values).length === 0) return serializeSong(current);

  const [row] = await db.update(songs).set(values).where(eq(songs.id, id)).returning();
  return serializeSong(row);
}

export async function reorderSongs(
  categoryId: string,
  songOrders: { id: string; order: number }[],
): Promise<SongDTO[]> {
  if (!Array.isArray(songOrders) || songOrders.length === 0) {
    throw badRequest("songOrders must be a non-empty array");
  }
  await assertCategoryExists(categoryId);

  await db.transaction(async (tx) => {
    for (const item of songOrders) {
      if (typeof item?.id !== "string" || typeof item?.order !== "number") {
        throw badRequest("Each entry must be { id: string, order: number }");
      }
      await tx
        .update(songs)
        .set({ order: Math.max(0, Math.trunc(item.order)) })
        .where(and(eq(songs.id, item.id), eq(songs.categoryId, categoryId)));
    }
  });

  return listSongs(categoryId);
}

export async function deleteSong(id: string): Promise<{ success: true; id: string }> {
  const row = await getSongById(id);
  await db.delete(songs).where(eq(songs.id, id));
  await deleteStoredFile(row.filePath);
  return { success: true, id };
}

export async function libraryStats() {
  const [row] = await db
    .select({
      songCount: sql<number>`cast(count(${songs.id}) as int)`,
      totalDuration: sql<number>`cast(coalesce(sum(${songs.duration}), 0) as int)`,
      totalBytes: sql<number>`cast(coalesce(sum(${songs.sizeBytes}), 0) as bigint)`,
    })
    .from(songs);
  return {
    songCount: Number(row?.songCount ?? 0),
    totalDuration: Number(row?.totalDuration ?? 0),
    totalBytes: Number(row?.totalBytes ?? 0),
  };
}
