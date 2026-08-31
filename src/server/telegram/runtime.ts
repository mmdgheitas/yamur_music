import { getBot, probeTelegram } from "@/server/telegram/bot";
import { config } from "@/lib/config";

/**
 * In-process Telegram supervisor.
 *
 * This is what makes the "اتصال ربات تلگرام" button in the admin panel behave exactly
 * like running `npm run bot` in a terminal — but in the background of the web server,
 * so a non-technical cafe owner never has to touch a shell.
 *
 * Two mutually exclusive polling modes (Telegram allows only ONE getUpdates consumer
 * per token, so these can never overlap):
 *
 *   STANDBY — a dependency-free long-poll listener that answers every incoming message
 *             with "the bot is not connected, press the button on the website first".
 *             It never accepts audio. Started automatically when the server boots.
 *
 *   ACTIVE  — the real Telegraf bot (playlist buttons, downloads, DB inserts).
 *             Started when an admin presses the button.
 *
 * Everything degrades gracefully: with no token, or with Telegram unreachable, the
 * cafe player keeps working 100% locally.
 */

export type BotMode = "OFF" | "STANDBY" | "STARTING" | "ACTIVE" | "ERROR";

export type BotRuntimeStatus = {
  /** Current supervisor mode. */
  mode: BotMode;
  /** True only when the real bot is accepting music. */
  active: boolean;
  /** True when the standby "press the button first" responder is listening. */
  standby: boolean;
  /** Whether TELEGRAM_BOT_TOKEN is present at all. */
  configured: boolean;
  botUsername: string;
  /** Persian, user-facing status line rendered in the admin panel. */
  message: string;
  /** ISO timestamp of the moment the real bot came online. */
  startedAt: string | null;
};

/** Persian reply sent by the standby listener (requirement #4). */
const STANDBY_REPLY = [
  "⚠️ ارتباط ربات هنوز برقرار نشده است.",
  "",
  "لطفاً ابتدا در سایت وارد بخش «مدیریت» شوید و روی دکمهٔ «اتصال ربات تلگرام» کلیک کنید،",
  "سپس دوباره فایل موسیقی را ارسال کنید.",
].join("\n");

/** Do not spam the same chat with the standby warning more than once a minute. */
const STANDBY_REPLY_COOLDOWN_MS = 60_000;
const STANDBY_POLL_TIMEOUT_SECONDS = 25;
const STANDBY_ERROR_BACKOFF_MS = 10_000;

type RuntimeState = {
  mode: BotMode;
  message: string;
  startedAt: number | null;
  botUsername: string;
  standbyController: AbortController | null;
  standbyLoop: Promise<void> | null;
};

/**
 * Kept on globalThis so Next.js dev-mode hot reloads (which re-evaluate modules)
 * cannot leave a second poller running against the same token.
 */
const globalForBot = globalThis as typeof globalThis & {
  __cafeTelegramRuntime?: RuntimeState;
};

function state(): RuntimeState {
  globalForBot.__cafeTelegramRuntime ??= {
    mode: "OFF",
    message: config.telegram.token
      ? "ربات متصل نیست. برای فعال‌سازی روی دکمهٔ اتصال کلیک کنید."
      : "توکن ربات تلگرام تنظیم نشده است؛ بخش موسیقی سایت مستقل از ربات کار می‌کند.",
    startedAt: null,
    botUsername: config.telegram.botUsername,
    standbyController: null,
    standbyLoop: null,
  };
  return globalForBot.__cafeTelegramRuntime;
}

function apiUrl(method: string): string {
  // The official Telegram Bot API endpoint; no mirror/proxy is involved.
  const root = config.telegram.apiRoot.trim().replace(/\/+$/, "");
  return `${root}/bot${config.telegram.token}/${method}`;
}

async function telegramCall<T>(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(apiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as { ok: boolean; result?: T };
    return payload.ok ? (payload.result ?? null) : null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

type StandbyUpdate = {
  update_id: number;
  message?: { chat?: { id?: number } };
  channel_post?: { chat?: { id?: number } };
};

/**
 * Minimal long-poll listener. It only ever answers with STANDBY_REPLY, so a client who
 * sends music before pressing the button is told what to do instead of being ignored.
 */
async function runStandbyLoop(signal: AbortSignal): Promise<void> {
  let offset = 0;
  const lastReplyAt = new Map<number, number>();

  while (!signal.aborted) {
    try {
      const updates = await telegramCall<StandbyUpdate[]>(
        "getUpdates",
        {
          offset,
          timeout: STANDBY_POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message", "channel_post"],
        },
        (STANDBY_POLL_TIMEOUT_SECONDS + 15) * 1000,
        signal,
      );

      if (signal.aborted) return;
      if (!updates) {
        // Token rejected, webhook registered, or another poller holds the lock.
        await sleep(STANDBY_ERROR_BACKOFF_MS, signal);
        continue;
      }

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const chatId = update.message?.chat?.id ?? update.channel_post?.chat?.id;
        if (typeof chatId !== "number") continue;

        const now = Date.now();
        const previous = lastReplyAt.get(chatId) ?? 0;
        if (now - previous < STANDBY_REPLY_COOLDOWN_MS) continue;
        lastReplyAt.set(chatId, now);

        await telegramCall(
          "sendMessage",
          { chat_id: chatId, text: STANDBY_REPLY },
          10_000,
          signal,
        ).catch(() => undefined);
      }
    } catch (error) {
      if (signal.aborted) return;
      // Network cut (the whole point of this project) — retry quietly, never crash.
      console.warn(
        "[telegram] standby listener retrying:",
        error instanceof Error ? error.message : error,
      );
      await sleep(STANDBY_ERROR_BACKOFF_MS, signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function startStandby(): void {
  const current = state();
  if (!config.telegram.token) return;
  if (current.standbyController) return;

  const controller = new AbortController();
  current.standbyController = controller;
  current.standbyLoop = runStandbyLoop(controller.signal).catch((error) => {
    console.warn(
      "[telegram] standby listener stopped:",
      error instanceof Error ? error.message : error,
    );
  });
  console.log("[telegram] standby listener armed (waiting for the website button)");
}

async function stopStandby(): Promise<void> {
  const current = state();
  if (!current.standbyController) return;
  current.standbyController.abort();
  current.standbyController = null;
  const loop = current.standbyLoop;
  current.standbyLoop = null;
  // Let the aborted long-poll unwind so Telegram releases the getUpdates lock.
  await Promise.race([loop ?? Promise.resolve(), sleep(1500)]);
}

/** Called once by `src/instrumentation.ts` when the Next.js server boots. */
export function initTelegramRuntime(): void {
  const current = state();
  if (!config.telegram.token) {
    current.mode = "OFF";
    return;
  }
  if (current.mode === "ACTIVE" || current.mode === "STARTING") return;

  startStandby();
  current.mode = "STANDBY";
  current.message =
    "ربات در حالت آماده‌باش است. برای دریافت موسیقی، روی دکمهٔ «اتصال ربات تلگرام» کلیک کنید.";
}

/**
 * The button handler — the in-app equivalent of `npm run bot`.
 * Resolves only after we know whether the connection actually succeeded, so the UI can
 * show the green or the red banner immediately.
 */
export async function startBotRuntime(): Promise<BotRuntimeStatus> {
  const current = state();

  if (!config.telegram.token) {
    current.mode = "OFF";
    current.message =
      "توکن ربات تلگرام روی سرور تنظیم نشده است. لطفاً با پشتیبانی فنی تماس بگیرید.";
    return snapshot();
  }

  if (current.mode === "ACTIVE") {
    current.message = "ربات از قبل متصل است؛ می‌توانید موسیقی ارسال کنید.";
    return snapshot();
  }

  const bot = getBot();
  if (!bot) {
    current.mode = "ERROR";
    current.message = "ساخت نمونهٔ ربات ممکن نشد. توکن تلگرام را بررسی کنید.";
    return snapshot();
  }

  current.mode = "STARTING";
  current.message = "در حال اتصال به تلگرام…";

  // Release the getUpdates lock before the real bot claims it.
  await stopStandby();

  // Reachability first: this is the check that decides green vs red.
  const probe = await probeTelegram(8000);
  if (!probe.reachable) {
    current.mode = "ERROR";
    current.message =
      "اتصال برقرار نشد — لطفاً اتصال اینترنت سرور را بررسی کنید و دوباره تلاش کنید.";
    current.startedAt = null;
    startStandby(); // keep warning users while we are offline
    return snapshot();
  }

  current.botUsername = probe.botUsername;

  try {
    // `launch()` resolves only when the bot stops, so it must not be awaited here.
    void bot
      .launch({ dropPendingUpdates: false })
      .then(() => {
        const live = state();
        if (live.mode === "ACTIVE") {
          live.mode = "STANDBY";
          live.startedAt = null;
          live.message = "ربات متوقف شد.";
          startStandby();
        }
      })
      .catch((error: unknown) => {
        const live = state();
        live.mode = "ERROR";
        live.startedAt = null;
        live.message =
          "اتصال قطع شد — لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.";
        console.error(
          "[telegram] polling stopped with an error:",
          error instanceof Error ? error.message : error,
        );
        startStandby();
      });

    // Give telegraf a moment to fail fast (409 conflict, revoked token, DNS, …).
    await sleep(1200);

    if (state().mode === "ERROR") return snapshot();

    current.mode = "ACTIVE";
    current.startedAt = Date.now();
    current.message = `ربات متصل شد. اکنون می‌توانید در @${current.botUsername} موسیقی ارسال کنید.`;
    console.log(`[telegram] bot activated from the web UI as @${current.botUsername}`);
    return snapshot();
  } catch (error) {
    current.mode = "ERROR";
    current.startedAt = null;
    current.message =
      "اتصال برقرار نشد — لطفاً اتصال اینترنت سرور را بررسی کنید و دوباره تلاش کنید.";
    console.error(
      "[telegram] activation failed:",
      error instanceof Error ? error.message : error,
    );
    startStandby();
    return snapshot();
  }
}

/** Stops the real bot and falls back to the standby responder. */
export async function stopBotRuntime(): Promise<BotRuntimeStatus> {
  const current = state();
  const bot = getBot();

  if (current.mode === "ACTIVE" && bot) {
    try {
      bot.stop("web-ui-stop");
    } catch (error) {
      console.warn(
        "[telegram] stop() reported:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  current.startedAt = null;

  if (config.telegram.token) {
    startStandby();
    current.mode = "STANDBY";
    current.message = "ربات قطع شد. برای اتصال دوباره، روی دکمهٔ اتصال کلیک کنید.";
  } else {
    current.mode = "OFF";
    current.message = "توکن ربات تلگرام تنظیم نشده است.";
  }

  return snapshot();
}

export function snapshot(): BotRuntimeStatus {
  const current = state();
  return {
    mode: current.mode,
    active: current.mode === "ACTIVE",
    standby: Boolean(current.standbyController),
    configured: Boolean(config.telegram.token),
    botUsername: current.botUsername,
    message: current.message,
    startedAt: current.startedAt ? new Date(current.startedAt).toISOString() : null,
  };
}
