import fsp from "node:fs/promises";
import path from "node:path";

export type AudioMetadata = {
  title: string;
  artist: string;
  duration: number;
};

function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base
    .replace(/[_]+/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Untitled Track";
  return cleaned
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ")
    .slice(0, 120);
}

/** Minimal WAV header duration reader (used as a dependency-free fallback). */
function wavDuration(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  const byteRate = buffer.readUInt32LE(28);
  if (!byteRate) return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const seconds = Math.round(chunkSize / byteRate);
      return seconds > 0 ? seconds : null;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

const MPEG_BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const MPEG_SAMPLE_RATES_V1 = [44100, 48000, 32000, 0];

/** Rough CBR MP3 duration estimate from the first valid frame header. */
function mp3Duration(buffer: Buffer, totalBytes?: number): number | null {
  const limit = Math.min(buffer.length - 4, 200_000);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      const versionBits = (buffer[i + 1] >> 3) & 0x03;
      const layerBits = (buffer[i + 1] >> 1) & 0x03;
      if (versionBits !== 3 || layerBits !== 1) continue; // MPEG1 Layer III only
      const bitrate = MPEG_BITRATES_V1_L3[(buffer[i + 2] >> 4) & 0x0f];
      const sampleRate = MPEG_SAMPLE_RATES_V1[(buffer[i + 2] >> 2) & 0x03];
      if (!bitrate || !sampleRate) continue;
      const bytes = (totalBytes ?? buffer.length) - i;
      return Math.round((bytes * 8) / (bitrate * 1000));
    }
  }
  return null;
}

/**
 * Extracts title/artist/duration using `music-metadata`, degrading gracefully to
 * header parsing and finally to filename-derived values. Never throws.
 */
export async function extractAudioMetadata(
  buffer: Buffer,
  originalName: string,
  mimeType?: string,
): Promise<AudioMetadata> {
  const fallbackTitle = titleFromFilename(originalName);
  let title = fallbackTitle;
  let artist = "Unknown Artist";
  let duration = 0;

  try {
    const mm = await import("music-metadata");
    const parsed = await mm.parseBuffer(
      new Uint8Array(buffer),
      mimeType ? { mimeType } : undefined,
      { duration: true },
    );
    if (parsed.common.title?.trim()) title = parsed.common.title.trim().slice(0, 120);
    const parsedArtist = parsed.common.artist ?? parsed.common.albumartist;
    if (parsedArtist?.trim()) artist = parsedArtist.trim().slice(0, 120);
    if (parsed.format.duration && Number.isFinite(parsed.format.duration)) {
      duration = Math.max(0, Math.round(parsed.format.duration));
    }
  } catch (error) {
    console.warn(
      "[audio-meta] music-metadata unavailable, falling back to header parsing:",
      error instanceof Error ? error.message : error,
    );
  }

  if (duration <= 0) {
    duration = wavDuration(buffer) ?? mp3Duration(buffer) ?? 0;
  }

  return { title, artist, duration };
}

/**
 * Metadata extraction that reads from disk instead of memory — used by the
 * streaming upload path so we never hold the whole track in RAM. Never throws.
 */
export async function extractAudioMetadataFromFile(
  absolutePath: string,
  originalName: string,
): Promise<AudioMetadata> {
  const fallbackTitle = titleFromFilename(originalName);
  let title = fallbackTitle;
  let artist = "Unknown Artist";
  let duration = 0;

  try {
    const mm = await import("music-metadata");
    if (typeof mm.parseFile === "function") {
      const parsed = await mm.parseFile(absolutePath, { duration: true });
      if (parsed.common.title?.trim()) title = parsed.common.title.trim().slice(0, 120);
      const parsedArtist = parsed.common.artist ?? parsed.common.albumartist;
      if (parsedArtist?.trim()) artist = parsedArtist.trim().slice(0, 120);
      if (parsed.format.duration && Number.isFinite(parsed.format.duration)) {
        duration = Math.max(0, Math.round(parsed.format.duration));
      }
    }
  } catch (error) {
    console.warn(
      "[audio-meta] parseFile failed, falling back to header parsing:",
      error instanceof Error ? error.message : error,
    );
  }

  if (duration <= 0) {
    // Header-only fallback: read just the first 256 KB from disk.
    try {
      const handle = await fsp.open(absolutePath, "r");
      try {
        const head = Buffer.alloc(Math.min(262_144, (await handle.stat()).size));
        await handle.read(head, 0, head.length, 0);
        const stat = await handle.stat();
        duration = wavDuration(head) ?? mp3Duration(head, stat.size) ?? 0;
      } finally {
        await handle.close();
      }
    } catch {
      duration = 0;
    }
  }

  return { title, artist, duration };
}

export { titleFromFilename };
