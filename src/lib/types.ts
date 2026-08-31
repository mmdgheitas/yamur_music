export type Role = "ADMIN" | "GUEST";

export type SessionUserDTO = {
  id: string;
  username: string;
  role: Role;
};

export type CategoryDTO = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  order: number;
  songCount: number;
  totalDuration: number;
  createdAt: string;
};

export type SongDTO = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  order: number;
  categoryId: string;
  source: "WEB" | "TELEGRAM" | "SEED";
  uploadedBy: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
  createdAt: string;
};

export type SystemConfigDTO = {
  allowGuestUpload: boolean;
  cafeName: string;
  /** "LOCAL" = device clock; otherwise an IANA timezone name (e.g. "Asia/Tehran"). */
  scheduleTimezone: string;
  updatedAt: string;
};

export type ScheduleEntryDTO = {
  id: string;
  label: string;
  /** 24-hour "HH:MM" in the configured schedule timezone. */
  time: string;
  categoryId: string;
  categoryName: string;
  enabled: boolean;
  createdAt: string;
};

export type TelegramContactDTO = {
  id: string;
  telegramId: string;
  label: string;
  createdAt: string;
};

export type TelegramStatusDTO = {
  configured: boolean;
  botUsername: string;
  reachable: boolean | null;
  message: string;
  whitelist: TelegramContactDTO[];
};

export type ReorderPayload = {
  categoryId: string;
  songOrders: { id: string; order: number }[];
};

/** Supervisor state for the in-app Telegram bot runner (the admin-panel button). */
export type BotMode = "OFF" | "STANDBY" | "STARTING" | "ACTIVE" | "ERROR";

export type BotRuntimeDTO = {
  mode: BotMode;
  active: boolean;
  standby: boolean;
  configured: boolean;
  botUsername: string;
  message: string;
  startedAt: string | null;
};
