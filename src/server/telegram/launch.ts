/**
 * Standalone Telegram worker (the `bot.js` deliverable of the spec).
 *
 * Run with:  npm run bot
 *
 * It long-polls Telegram, writes uploads into the same local /uploads volume and
 * the same PostgreSQL database the web app uses. If the National Data Network cuts
 * outbound access, the worker keeps retrying with backoff while the cafe web player
 * continues to operate 100% locally.
 */
import "dotenv/config";
import { ensureBootstrap } from "@/db/bootstrap";
import { config } from "@/lib/config";
import { ensureUploadDirs } from "@/lib/storage";
import { getBot, probeTelegram } from "@/server/telegram/bot";

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 120_000;

async function main(): Promise<void> {
  ensureUploadDirs();
  await ensureBootstrap();

  const bot = getBot();
  if (!bot) {
    console.error(
      "[telegram] TELEGRAM_BOT_TOKEN is not set. Add it to .env and restart `npm run bot`.",
    );
    process.exit(1);
  }

  let attempt = 0;

  const start = async (): Promise<void> => {
    const probe = await probeTelegram();
    if (!probe.reachable) {
      throw new Error(probe.message);
    }
    console.log(`[telegram] launching long-poll worker as @${probe.botUsername}`);
    await bot.launch({ dropPendingUpdates: false });
  };

  const loop = async (): Promise<void> => {
    for (;;) {
      try {
        await start();
        attempt = 0;
        return;
      } catch (error) {
        attempt += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
        console.warn(
          `[telegram] launch failed (attempt ${attempt}): ${
            error instanceof Error ? error.message : error
          } — retrying in ${Math.round(delay / 1000)}s. Web app is unaffected.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  console.log(
    `[telegram] worker booting · api=${config.telegram.apiRoot} · uploads=${config.uploadRoot}`,
  );
  await loop();
}

main().catch((error) => {
  console.error("[telegram] fatal worker error:", error);
  process.exit(1);
});
