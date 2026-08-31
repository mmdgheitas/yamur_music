import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { deleteSong, getSongById, serializeSong, updateSong } from "@/server/songs-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/songs/:id */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext) => {
  await ensureBootstrap();
  const { id } = await context.params;
  return jsonOk(serializeSong(await getSongById(id)));
});

/** PATCH /api/songs/:id (Admin) — rename or move between categories */
export const PATCH = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const song = await updateSong(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    artist: typeof body.artist === "string" ? body.artist : undefined,
    categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
  });
  return jsonOk(song);
});

/** DELETE /api/songs/:id (Admin) -> { success: true } */
export const DELETE = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  return jsonOk(await deleteSong(id));
});
