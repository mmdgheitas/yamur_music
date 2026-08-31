"use client";

import type {
  BotRuntimeDTO,
  CategoryDTO,
  ScheduleEntryDTO,
  SessionUserDTO,
  SongDTO,
  SystemConfigDTO,
  TelegramStatusDTO,
} from "@/lib/types";

const TOKEN_KEY = "cafe_audio_token";

/**
 * The JWT is mirrored into localStorage and sent as `Authorization: Bearer`.
 * The HttpOnly cookie still drives server-side rendering, but browsers drop
 * cross-site cookies when the app is embedded in an iframe — the Bearer header
 * keeps privileged calls (upload, reorder, delete) working everywhere.
 */
export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — cookie auth still applies */
  }
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Silently renews the JWT when it is close to expiring or has just expired.
 * Mirrors the new token into localStorage so every subsequent request (including
 * a long multipart/binary upload) carries a fresh `Authorization` header. This
 * prevents the "Authentication required" failure that used to hit at ~100% when
 * a session expired mid-stream.
 */
export async function refreshSession(): Promise<boolean> {
  const token = getStoredToken();

  refreshPromise ??= (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // Explicit `include` attaches cookies even through cross-origin proxy/iframe setups.
        credentials: "include",
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as { token: string };
        if (data.token) setStoredToken(data.token);
        return true;
      }
      // Do not keep poisoning requests with a stale localStorage token.
      setStoredToken(null);
      return false;
    } catch {
      // A transient network error must not destroy a potentially valid cookie session.
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Shared request with one silent retry after a token refresh on 401. */
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const isAuthRoute =
    typeof input === "string" &&
    (input.includes("/auth/login") || input.includes("/auth/refresh"));

  const build = () => {
    const headers = new Headers(init?.headers as HeadersInit);
    if (init?.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    const auth = authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));

    return fetch(input, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  };

  let response = await build();

  // Session may have expired: refresh once, then transparently retry.
  if (response.status === 401 && !isAuthRoute) {
    if (await refreshSession()) {
      response = await build();
    }
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  login: async (username: string, password: string) => {
    const result = await request<{ token: string; user: SessionUserDTO }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    setStoredToken(result.token);
    return result;
  },

  logout: async () => {
    const result = await request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
    setStoredToken(null);
    return result;
  },

  me: () => request<{ user: SessionUserDTO | null }>("/api/auth/me"),

  categories: () => request<CategoryDTO[]>("/api/categories"),

  createCategory: (payload: { name: string; description?: string; accent?: string }) =>
    request<CategoryDTO>("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCategory: (
    id: string,
    payload: { name?: string; description?: string; accent?: string },
  ) =>
    request<CategoryDTO>(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteCategory: (id: string) =>
    request<{ success: boolean; deletedSongs: number }>(`/api/categories/${id}`, {
      method: "DELETE",
    }),

  songs: (categoryId: string) =>
    request<SongDTO[]>(`/api/songs?categoryId=${encodeURIComponent(categoryId)}`),

  songsSnapshot: (categoryId: string) =>
    request<{
      songs: SongDTO[];
      stats: { songCount: number; totalDuration: number; totalBytes: number };
      /** Scoped to the requested playlist — compare this against the visible list. */
      categoryStats: { songCount: number; totalDuration: number };
    }>(`/api/songs?categoryId=${encodeURIComponent(categoryId)}&stats=1`),

  reorder: (categoryId: string, songOrders: { id: string; order: number }[]) =>
    request<{ success: boolean; songs: SongDTO[] }>("/api/songs/reorder", {
      method: "PUT",
      body: JSON.stringify({ categoryId, songOrders }),
    }),

  deleteSong: (id: string) =>
    request<{ success: boolean }>(`/api/songs/${id}`, { method: "DELETE" }),

  updateSong: (id: string, payload: { title?: string; artist?: string; categoryId?: string }) =>
    request<SongDTO>(`/api/songs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  config: () => request<SystemConfigDTO>("/api/config"),

  updateConfig: (payload: {
    allowGuestUpload?: boolean;
    cafeName?: string;
    scheduleTimezone?: string;
  }) =>
    request<SystemConfigDTO>("/api/config", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  /** All daily playlist-schedule entries (public — clients run the scheduler). */
  schedules: () => request<ScheduleEntryDTO[]>("/api/schedules"),

  createSchedule: (payload: { label?: string; time: string; categoryId: string }) =>
    request<ScheduleEntryDTO>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSchedule: (
    id: string,
    payload: { label?: string; time?: string; categoryId?: string; enabled?: boolean },
  ) =>
    request<ScheduleEntryDTO>(`/api/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteSchedule: (id: string) =>
    request<{ success: boolean }>(`/api/schedules/${id}`, { method: "DELETE" }),

  updateProfile: async (payload: {
    username?: string;
    currentPassword: string;
    newPassword?: string;
  }) => {
    const result = await request<{
      success: true;
      token: string;
      user: SessionUserDTO;
    }>("/api/admin/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    // Credential changes rotate the JWT; never leave the previous token in storage.
    setStoredToken(result.token);
    return result;
  },

  telegramStatus: () => request<TelegramStatusDTO>("/api/telegram"),

  /** Current state of the in-app bot supervisor. */
  botRuntime: () => request<BotRuntimeDTO>("/api/telegram/runtime"),

  /**
   * Starts (or stops) the Telegram bot inside the running web server — the
   * one-click equivalent of `npm run bot` for non-technical staff.
   */
  setBotRuntime: (action: "start" | "stop") =>
    request<BotRuntimeDTO>("/api/telegram/runtime", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  addTelegramContact: (telegramId: string, label: string) =>
    request<{ success: boolean; whitelist: TelegramStatusDTO["whitelist"] }>("/api/telegram", {
      method: "POST",
      body: JSON.stringify({ telegramId, label }),
    }),

  removeTelegramContact: (id: string) =>
    request<{ success: boolean; whitelist: TelegramStatusDTO["whitelist"] }>(
      `/api/telegram?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

/**
 * Raw binary upload with real progress. Sending the File directly (instead of
 * multipart) lets the server stream it to disk without buffering, which removes
 * the long stall that used to happen right before the response came back.
 *
 * Auth is sent BOTH as the HttpOnly cookie (via `withCredentials`) AND as an
 * `Authorization: Bearer` header so it works even when the browser drops
 * cross-site cookies (e.g. the app embedded in a preview iframe). On a 401 the
 * session is refreshed silently and the upload is resent once.
 */
function xhrUpload(
  params: URLSearchParams,
  file: File,
  token: string | null,
  onProgress?: (percent: number) => void,
): Promise<{ status: number; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/songs/upload?${params.toString()}`);
    xhr.withCredentials = true; // attach the HttpOnly session cookie too
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        // Cap at 99% until the server confirms; 100% means "saved".
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* malformed body handled by caller */
      }
      resolve({ status: xhr.status, payload });
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });
}

export async function uploadSong(
  file: File,
  categoryId: string,
  extras: { title?: string; artist?: string; duration?: number },
  onProgress?: (percent: number) => void,
): Promise<SongDTO> {
  // Authenticate BEFORE sending any audio bytes. Besides failing fast, this rotates
  // the 30-day token so it cannot expire during a long transfer.
  onProgress?.(0);
  if (!(await refreshSession())) {
    throw new Error("Your session has expired. Please sign in again before uploading.");
  }

  const params = new URLSearchParams({ categoryId, filename: file.name });
  if (extras.title) params.set("title", extras.title);
  if (extras.artist) params.set("artist", extras.artist);
  if (extras.duration && Number.isFinite(extras.duration)) {
    params.set("duration", String(Math.round(extras.duration)));
  }

  let token = getStoredToken();
  const errorOf = (payload: unknown, status: number) =>
    payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `Upload failed (${status})`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { status, payload } = await xhrUpload(params, file, token, onProgress);

    if (status >= 200 && status < 300) {
      onProgress?.(100);
      return payload as SongDTO;
    }

    if (status === 401) {
      // Refresh the token once and resend rather than failing at 100%.
      if (await refreshSession()) {
        token = getStoredToken();
        continue;
      }
      throw new Error(errorOf(payload, status));
    }

    throw new Error(errorOf(payload, status));
  }

  throw new Error("Upload failed — please try again.");
}

/** Reads duration client-side so metadata is complete even for exotic codecs. */
export function probeLocalDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const cleanup = () => URL.revokeObjectURL(url);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const value = Number.isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(Math.round(value));
      };
      audio.onerror = () => {
        cleanup();
        resolve(0);
      };
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}
