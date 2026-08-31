import type { Update } from "telegraf/types";
import { ensureBootstrap } from "@/db/bootstrap";
import { config } from "@/lib/config";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { getBot } from "@/server/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/telegram/webhook — webhook transport for the same bot logic used by the
 * standalone long-poll worker. Always answers 200 so Telegram never floods retries.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const bot = getBot();
  if (!bot) {
    return jsonOk({ ok: false, reason: "TELEGRAM_BOT_TOKEN not configured" }, 200);
  }

  if (config.telegram.webhookSecret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== config.telegram.webhookSecret) {
      return jsonOk({ ok: false, reason: "invalid secret token" }, 401);
    }
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return jsonOk({ ok: false, reason: "invalid update payload" }, 200);

  try {
    await ensureBootstrap();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error("[telegram] webhook processing error:", error);
  }

  return jsonOk({ ok: true });
});

export const GET = withErrorHandling(async () =>
  jsonOk({
    ok: true,
    transport: "webhook",
    configured: Boolean(config.telegram.token),
    bot: config.telegram.botUsername,
  }),
);
