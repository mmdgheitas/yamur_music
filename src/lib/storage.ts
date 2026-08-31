import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as StreamWebReadable } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  MIME_BY_EXTENSION,
  config,
} from "@/lib/config";
import { badRequest } from "@/lib/http";

export const songsDir = path.join(config.uploadRoot, config.songDirName);

export function ensureUploadDirs(): void {
  fs.mkdirSync(songsDir, { recursive: true });
}

export function extensionOf(filename: string): string {
  return path.extname(filename || "").toLowerCase();
}

export function assertAudioFile(filename: string, sizeBytes: number): string {
  const ext = extensionOf(filename);
  if (!(ACCEPTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest(
      `Unsupported audio format "${ext || "unknown"}". Allowed: ${ACCEPTED_AUDIO_EXTENSIONS.join(", ")}`,
    );
  }
  if (sizeBytes <= 0) throw badRequest("Uploaded file is empty");
  if (sizeBytes > config.maxUploadBytes) {
    throw badRequest(
      `File is too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Limit is ${(
        config.maxUploadBytes /
        1024 /
        1024
      ).toFixed(0)} MB`,
    );
  }
  return ext;
}

export function mimeForFile(filename: string, fallback = "application/octet-stream"): string {
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? fallback;
}

/** Builds a collision-proof, path-traversal-safe relative storage path. */
export function buildStoredName(originalName: string): string {
  const ext = extensionOf(originalName) || ".mp3";
  const base = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase();
  const safeBase = base.length > 0 ? base : "track";
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}-${safeBase}${ext}`;
}

/** Persists a buffer to local disk and returns the relative path stored in the DB. */
export async function saveSongBuffer(
  originalName: string,
  buffer: Buffer,
): Promise<{ relativePath: string; absolutePath: string; size: number }> {
  ensureUploadDirs();
  const storedName = buildStoredName(originalName);
  const absolutePath = path.join(songsDir, storedName);
  await fsp.writeFile(absolutePath, buffer);
  return {
    relativePath: `${config.songDirName}/${storedName}`,
    absolutePath,
    size: buffer.byteLength,
  };
}

/**
 * Streams a request body straight to local disk — constant memory, no full-file
 * buffering, which is what makes large uploads fast.
 */
export async function saveSongStream(
  originalName: string,
  body: ReadableStream<Uint8Array>,
): Promise<{ relativePath: string; absolutePath: string; size: number }> {
  ensureUploadDirs();
  const storedName = buildStoredName(originalName);
  const absolutePath = path.join(songsDir, storedName);

  let size = 0;
  let overflowed = false;
  const limit = config.maxUploadBytes;
  const writeStream = fs.createWriteStream(absolutePath);

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;
      if (size > limit) {
        // Do NOT abort the pipeline: destroying the request body stream mid-flight
        // makes Next.js throw an uncaught "ReadableStream is already closed" after
        // the 400 is returned. Instead, keep consuming the body (it is already
        // capped by the proxy layer) and drop everything past the limit.
        overflowed = true;
        callback(null, Buffer.alloc(0));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body as StreamWebReadable), counter, writeStream);
  } catch (error) {
    await fsp.unlink(absolutePath).catch(() => undefined);
    throw badRequest(error instanceof Error ? error.message : "Upload stream failed");
  }

  if (overflowed) {
    await fsp.unlink(absolutePath).catch(() => undefined);
    throw badRequest(
      `File exceeds the ${(limit / 1024 / 1024).toFixed(0)} MB upload limit`,
    );
  }

  if (size === 0) {
    await fsp.unlink(absolutePath).catch(() => undefined);
    throw badRequest("Uploaded file is empty");
  }

  return { relativePath: `${config.songDirName}/${storedName}`, absolutePath, size };
}

/** Resolves a DB-relative path to an absolute path, blocking traversal attempts. */
export function resolveStoredPath(relativePath: string): string | null {
  const normalized = path
    .normalize(relativePath)
    .replace(/^([/\\])+/, "")
    .replace(/\\/g, "/");
  if (normalized.includes("..")) return null;
  const absolute = path.join(config.uploadRoot, normalized);
  const root = path.resolve(config.uploadRoot);
  if (!path.resolve(absolute).startsWith(root)) return null;
  return absolute;
}

export async function deleteStoredFile(relativePath: string): Promise<void> {
  const absolute = resolveStoredPath(relativePath);
  if (!absolute) return;
  try {
    await fsp.unlink(absolute);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      console.warn(`[storage] failed to delete ${relativePath}:`, err.message);
    }
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  const absolute = resolveStoredPath(relativePath);
  if (!absolute) return false;
  try {
    await fsp.access(absolute, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
