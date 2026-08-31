import { randomBytes } from "node:crypto";
import { Context, Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramWhitelist } from "@/db/schema";
import { ensureBootstrap, getSystemConfig, listCategoriesOrdered } from "@/db/bootstrap";
import { config } from "@/lib/config";
import { createSong } from "@/server/songs-service";
import { extensionOf } from "@/lib/storage";

type PendingUpload = {
  fileId: string;
  fileName: string;
  title: string | null;
  artist: string | null;
  duration: number | null;
  requestedBy: string;
  createdAt: number;
};

const PENDING_TTL_MS = 15 * 60 * 1000;
const pending = new Map<string, PendingUpload>();

function prunePending(): void {
  const now = Date.now();
  for (const [key, value] of pending.entries()) {
    if (now - value.createdAt > PENDING_TTL_MS) pending.delete(key);
  }
}

export type TelegramPermission = {
  allowed: boolean;
  reason: "WHITELIST" | "GUEST_UPLOAD_ENABLED" | "GUEST_UPLOAD_DISABLED";
};

/** Whitelist first, then the global guest-upload switch (admins of the web app bypass this). */
export async function resolveTelegramPermission(
  telegramId: string,
): Promise<TelegramPermission> {
  const [entry] = await db
    .select({ id: telegramWhitelist.id })
    .from(telegramWhitelist)
    .where(eq(telegramWhitelist.telegramId, telegramId))
    .limit(1);

  if (entry) return { allowed: true, reason: "WHITELIST" };

  const system = await getSystemConfig();
  return system.allowGuestUpload
    ? { allowed: true, reason: "GUEST_UPLOAD_ENABLED" }
    : { allowed: false, reason: "GUEST_UPLOAD_DISABLED" };
}

function displayName(from?: { username?: string; first_name?: string; id?: number }): string {
  if (!from) return "telegram";
  if (from.username) return `@${from.username}`;
  if (from.first_name) return from.first_name;
  return `tg:${from.id ?? "unknown"}`;
}

async function downloadTelegramFile(bot: Telegraf, fileId: string): Promise<Buffer> {
  const link = await bot.telegram.getFileLink(fileId);
  const response = await fetch(link.href);
  if (!response.ok) {
    throw new Error(`Telegram file download failed with status ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildBot(token: string): Telegraf {
  const bot = new Telegraf(token, {
    handlerTimeout: 120_000,
  });

  bot.catch((error, ctx) => {
    // Never crash the process: the web app must stay 100% operational offline.
    console.error(
      `[telegram] handler error for update ${ctx.updateType}:`,
      error instanceof Error ? error.message : error,
    );
  });

  bot.start(async (ctx) => {
    await ensureBootstrap();
    await ctx.reply(
      [
        `☕️ به ربات همگام‌سازی موسیقی کافه خوش آمدید (@${config.telegram.botUsername}).`,
        "",
        "یک فایل صوتی (MP3/M4A/WAV/FLAC) بفرستید یا فوروارد کنید؛ من می‌پرسم",
        "برای کدام لیست پخش است و سپس آن را مستقیم در پخش‌کنندهٔ کافه قرار می‌دهم.",
        "",
        "دستورها: /list لیست‌های پخش · /whoami شناسهٔ شما · /help راهنما",
      ].join("\n"),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        "روش افزودن موسیقی:",
        "۱. یک فایل صوتی بفرستید یا از هر گفت‌وگویی فوروارد کنید.",
        "۲. روی دکمهٔ لیست پخش موردنظر بزنید.",
        "۳. فایل روی سرور کافه ذخیره و به انتهای همان لیست اضافه می‌شود.",
        "",
        "اگر بارگذاری قفل است، از مدیر بخواهید شناسهٔ تلگرام شما (/whoami) را",
        "به فهرست مجاز اضافه کند یا بارگذاری مهمان‌ها را در سایت فعال کند.",
      ].join("\n"),
    );
  });

  bot.command("whoami", async (ctx) => {
    const id = String(ctx.from?.id ?? "unknown");
    const permission = await resolveTelegramPermission(id).catch(() => null);
    await ctx.reply(
      [
        `شناسهٔ تلگرام شما: ${id}`,
        permission
          ? permission.allowed
            ? "دسترسی بارگذاری: ✅ فعال"
            : "دسترسی بارگذاری: ⛔️ قفل — از مدیر بخواهید شما را به فهرست مجاز اضافه کند"
          : "دسترسی بارگذاری: نامشخص (پایگاه داده در دسترس نیست)",
      ].join("\n"),
    );
  });

  bot.command("list", async (ctx) => {
    await ensureBootstrap();
    const categories = await listCategoriesOrdered();
    if (categories.length === 0) {
      await ctx.reply("هنوز لیست پخشی ساخته نشده است. ابتدا در سایت یکی بسازید.");
      return;
    }
    await ctx.reply(
      ["🎚 لیست‌های پخش:", ...categories.map((c, i) => `${i + 1}. ${c.name} (${c.slug})`)].join(
        "\n",
      ),
    );
  });

  const handleIncomingAudio = async (
    ctx: Context,
    file: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      title?: string;
      performer?: string;
      duration?: number;
    },
  ) => {
    await ensureBootstrap();
    const telegramId = String(ctx.from?.id ?? "");
    const permission = await resolveTelegramPermission(telegramId);

    if (!permission.allowed) {
      await ctx.reply(
        "⛔️ بارگذاری در حال حاضر قفل است. از مدیر کافه بخواهید شناسهٔ شما " +
          `(${telegramId}) را به فهرست مجاز اضافه کند یا بارگذاری مهمان‌ها را فعال کند.`,
      );
      return;
    }

    const fallbackName = file.file_name ?? `${file.title ?? "telegram-track"}.mp3`;
    const ext = extensionOf(fallbackName);
    const fileName = ext ? fallbackName : `${fallbackName}.mp3`;

    const categories = await listCategoriesOrdered();
    if (categories.length === 0) {
      await ctx.reply("هنوز لیست پخشی ساخته نشده است. ابتدا در سایت یکی بسازید.");
      return;
    }

    prunePending();
    const key = randomBytes(4).toString("hex");
    pending.set(key, {
      fileId: file.file_id,
      fileName,
      title: file.title ?? null,
      artist: file.performer ?? null,
      duration: file.duration ?? null,
      requestedBy: displayName(ctx.from),
      createdAt: Date.now(),
    });

    await ctx.reply(
      `🎧 «${file.title ?? fileName}» دریافت شد. به کدام لیست پخش اضافه شود؟`,
      Markup.inlineKeyboard(
        categories.map((category) => [
          Markup.button.callback(`▶︎ ${category.name}`, `pick:${key}:${category.id}`),
        ]),
      ),
    );
  };

  bot.on(message("audio"), async (ctx) => {
    await handleIncomingAudio(ctx, ctx.message.audio);
  });

  bot.on(message("voice"), async (ctx) => {
    await handleIncomingAudio(ctx, {
      file_id: ctx.message.voice.file_id,
      file_name: `voice-note-${Date.now()}.ogg`,
      mime_type: ctx.message.voice.mime_type,
      duration: ctx.message.voice.duration,
    });
  });

  bot.on(message("document"), async (ctx) => {
    const doc = ctx.message.document;
    const looksAudio =
      (doc.mime_type ?? "").startsWith("audio/") ||
      [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"].includes(
        extensionOf(doc.file_name ?? ""),
      );
    if (!looksAudio) {
      await ctx.reply("این فایل صوتی نیست — لطفاً MP3، M4A، WAV، FLAC یا OGG بفرستید.");
      return;
    }
    await handleIncomingAudio(ctx, {
      file_id: doc.file_id,
      file_name: doc.file_name,
      mime_type: doc.mime_type,
    });
  });

  bot.action(/^pick:([a-f0-9]{8}):([0-9a-fA-F-]{36})$/, async (ctx) => {
    const key = ctx.match[1];
    const categoryId = ctx.match[2];
    await ctx.answerCbQuery("در حال دریافت…").catch(() => undefined);

    const job = pending.get(key);
    if (!job) {
      await ctx.editMessageText("⏳ مهلت این فایل تمام شد. لطفاً دوباره ارسال کنید.");
      return;
    }

    try {
      await ensureBootstrap();
      const permission = await resolveTelegramPermission(String(ctx.from?.id ?? ""));
      if (!permission.allowed) {
        await ctx.editMessageText("⛔️ پیش از ذخیرهٔ این فایل، بارگذاری قفل شد.");
        pending.delete(key);
        return;
      }

      const buffer = await downloadTelegramFile(bot, job.fileId);
      const song = await createSong({
        buffer,
        originalName: job.fileName,
        categoryId,
        uploadedBy: job.requestedBy,
        source: "TELEGRAM",
        title: job.title,
        artist: job.artist,
        durationHint: job.duration,
      });
      pending.delete(key);

      const categories = await listCategoriesOrdered();
      const category = categories.find((c) => c.id === categoryId);
      await ctx.editMessageText(
        [
          "✅ به پخش‌کنندهٔ کافه اضافه شد.",
          `🎵 ${song.title} — ${song.artist}`,
          `🗂 لیست پخش: ${category?.name ?? "نامشخص"} (جایگاه ${song.order + 1})`,
          `⏱ مدت: ${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, "0")}`,
        ].join("\n"),
      );
    } catch (error) {
      console.error("[telegram] upload failed:", error);
      await ctx
        .editMessageText(
          `⚠️ بارگذاری ناموفق بود: ${error instanceof Error ? error.message : "خطای نامشخص"}`,
        )
        .catch(() => undefined);
    }
  });

  bot.on(message("text"), async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    await ctx.reply("یک فایل صوتی بفرستید تا به لیست پخش کافه اضافه شود. /help برای راهنما.");
  });

  return bot;
}

let cachedBot: Telegraf | null = null;

/** Returns the shared bot instance, or null when no token is configured. */
export function getBot(): Telegraf | null {
  if (!config.telegram.token) return null;
  if (!cachedBot) {
    cachedBot = buildBot(config.telegram.token);
  }
  return cachedBot;
}

/**
 * Lightweight reachability probe used by the admin panel (intranet-safe).
 * Always targets the official Telegram Bot API — no proxy in between.
 */
export async function probeTelegram(timeoutMs = 4000): Promise<{
  reachable: boolean;
  message: string;
  botUsername: string;
}> {
  const bot = getBot();
  if (!bot) {
    return {
      reachable: false,
      message: "توکن ربات تلگرام تنظیم نشده است — ربات غیرفعال، سایت بدون تأثیر کار می‌کند.",
      botUsername: config.telegram.botUsername,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${config.telegram.apiRoot}/bot${config.telegram.token}/getMe`,
      { signal: controller.signal, cache: "no-store" },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!payload.ok) {
      return {
        reachable: false,
        message: payload.description ?? "تلگرام توکن را نپذیرفت.",
        botUsername: config.telegram.botUsername,
      };
    }
    return {
      reachable: true,
      message: "اتصال به سرویس تلگرام برقرار است.",
      botUsername: payload.result?.username ?? config.telegram.botUsername,
    };
  } catch (error) {
    return {
      reachable: false,
      message:
        error instanceof Error && error.name === "AbortError"
          ? "تلگرام در دسترس نیست (اتمام زمان). پخش محلی بدون مشکل ادامه دارد."
          : `تلگرام در دسترس نیست: ${error instanceof Error ? error.message : "خطای شبکه"}`,
      botUsername: config.telegram.botUsername,
    };
  } finally {
    clearTimeout(timer);
  }
}
