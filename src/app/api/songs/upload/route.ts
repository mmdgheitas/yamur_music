import { ensureBootstrap, getSystemConfig } from "@/db/bootstrap";
import { requireUser } from "@/lib/auth";
import { badRequest, forbidden, jsonOk, withErrorHandling } from "@/lib/http";
import { createSong, createSongFromStream } from "@/server/songs-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/songs/upload — local disk ingest (the Multer equivalent).
 *
 * AUTH (why the old 401-at-100% bug happened and how this route fixes it):
 *  - Authentication runs here in the Node route handler via `requireUser(request)`,
 *    which awaits Next.js 16's async `cookies()` helper AND reads the
 *    `Authorization: Bearer` header. Either one is sufficient.
 *  - The frontend sends the JWT as a Bearer header (and the cookie too), so the
 *    upload is authenticated even when the browser drops cross-site/iframe cookies.
 *  - `proxy.ts` explicitly passes `/api/songs/upload` through untouched, so the
 *    streamed body and auth headers always reach this handler without being consumed
 *    or stripped by Edge middleware.
 *  - If a session is found to be expired here, the client refreshes via
 *    `/api/auth/refresh` and resends automatically.
 *
 * Two transports are accepted:
 *  1. RAW (fast path, used by the web UI): binary body + query params
 *     ?categoryId=…&filename=…&title=…&artist=…&duration=…
 *     The body is streamed straight to /uploads/songs with constant memory.
 *  2. multipart/form-data (curl / third-party clients): fields file, categoryId, title,
 *     artist, duration.
 *
 * Guests are gated by SystemConfig.allowGuestUpload; admins always pass.
 */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const user = await requireUser(request);

  if (user.role !== "ADMIN") {
    const config = await getSystemConfig();
    if (!config.allowGuestUpload) {
      throw forbidden("Guest uploads are currently disabled by the cafe admin");
    }
  }

  const contentType = request.headers.get("content-type") ?? "";

  // ---- Fast path: raw binary stream ----
  if (!contentType.includes("multipart/form-data")) {
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId");
    const filename = url.searchParams.get("filename");

    if (!categoryId) throw badRequest("Query parameter categoryId is required");
    if (!filename) throw badRequest("Query parameter filename is required");
    if (!request.body) throw badRequest("Request body is empty");

    const durationParam = url.searchParams.get("duration");
    const song = await createSongFromStream({
      body: request.body,
      originalName: filename,
      categoryId,
      uploadedBy: user.username,
      source: "WEB",
      title: url.searchParams.get("title"),
      artist: url.searchParams.get("artist"),
      durationHint: durationParam ? Number(durationParam) : null,
    });
    return jsonOk(song, 201);
  }

  // ---- Compatibility path: multipart/form-data ----
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Malformed multipart/form-data upload");
  }

  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest('Missing "file" field in form data');

  const categoryId = form.get("categoryId");
  if (typeof categoryId !== "string" || !categoryId) {
    throw badRequest('Missing "categoryId" field in form data');
  }

  const titleField = form.get("title");
  const artistField = form.get("artist");
  const durationField = form.get("duration");

  const song = await createSong({
    buffer: Buffer.from(await file.arrayBuffer()),
    originalName: file.name || "upload.mp3",
    categoryId,
    uploadedBy: user.username,
    source: "WEB",
    title: typeof titleField === "string" ? titleField : null,
    artist: typeof artistField === "string" ? artistField : null,
    durationHint:
      typeof durationField === "string" && durationField.trim()
        ? Number(durationField)
        : null,
  });

  return jsonOk(song, 201);
});
