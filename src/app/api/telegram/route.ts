import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramWhitelist } from "@/db/schema";
import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { badRequest, jsonOk, requireString, withErrorHandling } from "@/lib/http";
import { probeTelegram } from "@/server/telegram/bot";
import type { TelegramContactDTO, TelegramStatusDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listWhitelist(): Promise<TelegramContactDTO[]> {
  const rows = await db
    .select()
    .from(telegramWhitelist)
    .orderBy(asc(telegramWhitelist.createdAt));
  return rows.map((row) => ({
    id: row.id,
    telegramId: row.telegramId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** GET /api/telegram (Admin) -> bot status + whitelist */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);

  const probe = await probeTelegram();
  const status: TelegramStatusDTO = {
    configured: Boolean(config.telegram.token),
    botUsername: probe.botUsername,
    reachable: config.telegram.token ? probe.reachable : null,
    message: probe.message,
    whitelist: await listWhitelist(),
  };
  return jsonOk(status);
});

/** POST /api/telegram (Admin) -> whitelist a Telegram user ID */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const telegramId = requireString(body.telegramId, "telegramId", 32);
  if (!/^\d{3,20}$/.test(telegramId)) {
    throw badRequest("telegramId must be the numeric Telegram user ID (see /whoami)");
  }
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : "Staff";

  await db
    .insert(telegramWhitelist)
    .values({ telegramId, label })
    .onConflictDoUpdate({ target: telegramWhitelist.telegramId, set: { label } });

  return jsonOk({ success: true, whitelist: await listWhitelist() }, 201);
});

/** DELETE /api/telegram?id={rowId} (Admin) */
export const DELETE = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw badRequest("Query parameter id is required");
  await db.delete(telegramWhitelist).where(eq(telegramWhitelist.id, id));
  return jsonOk({ success: true, whitelist: await listWhitelist() });
});
