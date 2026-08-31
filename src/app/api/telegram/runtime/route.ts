import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { badRequest, jsonOk, withErrorHandling } from "@/lib/http";
import {
  snapshot,
  startBotRuntime,
  stopBotRuntime,
} from "@/server/telegram/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/telegram/runtime (Admin) — current supervisor state for the admin panel. */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  return jsonOk(snapshot());
});

/**
 * POST /api/telegram/runtime (Admin)
 * Body: { action: "start" | "stop" }
 *
 * "start" is the in-app equivalent of running `npm run bot` in a terminal.
 * The response carries the Persian success/failure message the UI shows as the
 * green or red banner.
 */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "start";

  if (action === "stop") return jsonOk(await stopBotRuntime());
  if (action !== "start") throw badRequest('action must be "start" or "stop"');

  return jsonOk(await startBotRuntime());
});
