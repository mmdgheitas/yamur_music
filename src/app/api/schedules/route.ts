import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, requireString, withErrorHandling } from "@/lib/http";
import {
  createScheduleEntry,
  listScheduleEntries,
} from "@/server/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schedules — all scheduled playlist times. Public on purpose: every
 * open client (guest or anonymous cafe tab) runs the scheduler locally.
 */
export const GET = withErrorHandling(async () => {
  await ensureBootstrap();
  return jsonOk(await listScheduleEntries());
});

/** POST /api/schedules (Admin) — add a daily schedule entry. */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const time = requireString(body.time, "time", 5);
  const categoryId = requireString(body.categoryId, "categoryId", 64);

  const entry = await createScheduleEntry({
    time,
    categoryId,
    label: typeof body.label === "string" ? body.label : null,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  return jsonOk(entry, 201);
});
