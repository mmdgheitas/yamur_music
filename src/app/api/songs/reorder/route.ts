import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { badRequest, jsonOk, withErrorHandling } from "@/lib/http";
import { reorderSongs } from "@/server/songs-service";
import type { ReorderPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/songs/reorder -> Body: { categoryId, songOrders: [{ id, order }] } */
export const PUT = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);

  const body = (await request.json().catch(() => ({}))) as Partial<ReorderPayload>;
  if (!body.categoryId || typeof body.categoryId !== "string") {
    throw badRequest("categoryId is required");
  }
  const songs = await reorderSongs(body.categoryId, body.songOrders ?? []);
  return jsonOk({ success: true, songs });
});
