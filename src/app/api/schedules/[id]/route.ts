import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";
import {
  deleteScheduleEntry,
  updateScheduleEntry,
} from "@/server/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/schedules/:id (Admin) — rename, retime, move or toggle a schedule. */
export const PATCH = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const entry = await updateScheduleEntry(id, {
    label: typeof body.label === "string" ? body.label : undefined,
    time: typeof body.time === "string" ? body.time : undefined,
    categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  return jsonOk(entry);
});

/** DELETE /api/schedules/:id (Admin). */
export const DELETE = withErrorHandling(async (_request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(_request);
  const { id } = await context.params;
  return jsonOk(await deleteScheduleEntry(id));
});
