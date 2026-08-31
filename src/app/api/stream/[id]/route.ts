import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { ensureBootstrap } from "@/db/bootstrap";
import { notFound, withErrorHandling } from "@/lib/http";
import { resolveStoredPath } from "@/lib/storage";
import { getSongById } from "@/server/songs-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RangeSpec = { start: number; end: number } | "invalid" | null;

/** Parses a single-range `Range: bytes=start-end` header. */
function parseRange(header: string | null, size: number): RangeSpec {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start > end || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

function toWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream<Uint8Array>;
}

async function handle(request: Request, context: RouteContext, headOnly: boolean) {
  await ensureBootstrap();
  const { id } = await context.params;
  const song = await getSongById(id);

  const absolute = resolveStoredPath(song.filePath);
  if (!absolute) throw notFound("Audio file path is invalid");

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(absolute);
  } catch {
    throw notFound("Audio file is missing from local storage");
  }

  const size = stat.size;
  const baseHeaders: Record<string, string> = {
    "Content-Type": song.mimeType || "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Last-Modified": stat.mtime.toUTCString(),
    ETag: `"${song.id}-${size}-${stat.mtimeMs.toFixed(0)}"`,
    "Content-Disposition": `inline; filename="${encodeURIComponent(song.title)}"`,
  };

  const range = parseRange(request.headers.get("range"), size);

  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  if (headOnly) {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  if (range) {
    const chunkSize = range.end - range.start + 1;
    const nodeStream = fs.createReadStream(absolute, {
      start: range.start,
      end: range.end,
    });
    return new Response(toWebStream(nodeStream), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(chunkSize),
      },
    });
  }

  return new Response(toWebStream(fs.createReadStream(absolute)), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

/** GET /api/stream/:id — range-aware local audio streaming (HTTP 206 support). */
export const GET = withErrorHandling(async (request: Request, context: RouteContext) =>
  handle(request, context, false),
);

export const HEAD = withErrorHandling(async (request: Request, context: RouteContext) =>
  handle(request, context, true),
);
