import path from "node:path";

/**
 * Central runtime configuration. Everything is local-first: no external SaaS,
 * no CDN, no third-party storage — suitable for an air-gapped/intranet VPS.
 */
export const config = {
  jwtSecret:
    process.env.JWT_SECRET ?? "cafe-audio-local-dev-secret-change-me-in-production-2026",
  jwtIssuer: "cafe-audio",
  cookieName: "cafe_session",
  sessionMaxAgeSeconds: 60 * 60 * 24 * 30,
  /** Absolute path of the local upload root (served through the range-aware stream route). */
  uploadRoot: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads"),
  songDirName: "songs",
  seedAudioDir: path.join(process.cwd(), "seed-audio"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024),
  defaultAdmin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "cafe1404",
  },
  defaultGuest: {
    username: process.env.GUEST_USERNAME ?? "barista",
    password: process.env.GUEST_PASSWORD ?? "guest1404",
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    /**
     * The bot always talks to the official Telegram Bot API directly.
     * No proxy, mirror or intermediate API root is used.
     */
    apiRoot: "https://api.telegram.org",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "CafeMusicSyncBot",
  },
} as const;

export const ACCEPTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
  ".webm",
] as const;

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};
