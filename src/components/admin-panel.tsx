"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import { Button, Field, Modal, Switch, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import { en } from "@/lib/i18n";
import type {
  BotRuntimeDTO,
  SessionUserDTO,
  SystemConfigDTO,
  TelegramStatusDTO,
} from "@/lib/types";

export function AdminPanel({
  open,
  onClose,
  config,
  onConfigChange,
  user,
  onUserChange,
  notify,
  stats,
}: {
  open: boolean;
  onClose: () => void;
  config: SystemConfigDTO;
  onConfigChange: (next: SystemConfigDTO) => void;
  user: SessionUserDTO;
  onUserChange: (next: SessionUserDTO) => void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
  stats: { songCount: number; categoryCount: number };
}) {
  const [telegram, setTelegram] = useState<TelegramStatusDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [botRuntime, setBotRuntime] = useState<BotRuntimeDTO | null>(null);
  const [botBusy, setBotBusy] = useState(false);
  /** Green / red banner shown right under the connect button. */
  const [botBanner, setBotBanner] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [telegramId, setTelegramId] = useState("");
  const [label, setLabel] = useState("");
  const [cafeName, setCafeName] = useState(config.cafeName);
  const [profileUsername, setProfileUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const loadTelegram = useCallback(async () => {
    setLoading(true);
    try {
      setTelegram(await api.telegramStatus());
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadBotRuntime = useCallback(async () => {
    try {
      setBotRuntime(await api.botRuntime());
    } catch {
      /* status is best-effort; the button stays usable */
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadTelegram();
      void loadBotRuntime();
    }
  }, [open, loadTelegram, loadBotRuntime]);

  /**
   * The one-click bot launcher (requirement #3): does exactly what `npm run bot`
   * does, but inside the running web server, and reports the outcome as a green
   * or red banner instead of terminal output.
   */
  const connectBot = useCallback(async () => {
    setBotBusy(true);
    setBotBanner(null);
    try {
      const result = await api.setBotRuntime("start");
      setBotRuntime(result);
      if (result.active) {
        setBotBanner({ tone: "success", text: result.message });
        notify(en.telegramConnectedBanner, "success");
      } else {
        setBotBanner({ tone: "error", text: result.message });
        notify(en.telegramFailedBanner, "error");
      }
      void loadTelegram();
    } catch (error) {
      const text = error instanceof Error ? error.message : en.telegramFailedBanner;
      setBotBanner({ tone: "error", text });
      notify(text, "error");
    } finally {
      setBotBusy(false);
    }
  }, [notify, loadTelegram]);

  const disconnectBot = useCallback(async () => {
    setBotBusy(true);
    try {
      const result = await api.setBotRuntime("stop");
      setBotRuntime(result);
      setBotBanner(null);
      notify(result.message, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setBotBusy(false);
    }
  }, [notify]);

  useEffect(() => setCafeName(config.cafeName), [config.cafeName]);
  useEffect(() => setProfileUsername(user.username), [user.username]);

  const toggleGuestUpload = async (next: boolean) => {
    try {
      const updated = await api.updateConfig({ allowGuestUpload: next });
      onConfigChange(updated);
      notify(next ? "Guest uploads enabled" : "Guest uploads locked", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const saveName = async () => {
    if (!cafeName.trim() || cafeName === config.cafeName) return;
    try {
      const updated = await api.updateConfig({ cafeName: cafeName.trim() });
      onConfigChange(updated);
      notify(en.settingsSaved, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const saveProfile = async () => {
    if (!currentPassword) {
      notify(en.currentPassword, "error");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      notify(en.passwordsMismatch, "error");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      notify(en.passwordTooShort, "error");
      return;
    }

    setProfileBusy(true);
    try {
      const result = await api.updateProfile({
        username: profileUsername.trim(),
        currentPassword,
        newPassword: newPassword || undefined,
      });
      onUserChange(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify(en.profileUpdated, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setProfileBusy(false);
    }
  };

  const addContact = async () => {
    if (!telegramId.trim()) return;
    try {
      const result = await api.addTelegramContact(
        telegramId.trim(),
        label.trim() || "Staff",
      );
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      setTelegramId("");
      setLabel("");
      notify(en.whitelistAdded, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const removeContact = async (id: string) => {
    try {
      const result = await api.removeTelegramContact(id);
      setTelegram((prev) => (prev ? { ...prev, whitelist: result.whitelist } : prev));
      notify(en.whitelistRemoved, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={en.adminTitle}
      subtitle={en.adminSubtitle}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Tracks", value: stats.songCount },
            { label: "Playlists", value: stats.categoryCount },
            { label: "Storage", value: "Local disk" },
            { label: "Cloud deps", value: "Zero" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/8 bg-black/25 p-3.5"
            >
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-cafe-ink">{item.value}</p>
            </div>
          ))}
        </div>

        <Switch
          checked={config.allowGuestUpload}
          onChange={(next) => void toggleGuestUpload(next)}
          label={en.allowGuestUpload}
          description={en.allowGuestUploadHint}
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={en.cafeName}>
            <input
              className={inputClass}
              value={cafeName}
              onChange={(event) => setCafeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
              }}
            />
          </Field>
          <Button variant="ghost" onClick={() => void saveName()}>
            {en.save}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-cafe-ink">{en.credentials}</p>
              <p className="text-xs text-white/45">
                Change your login. Current password is always required.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={en.username}>
              <input
                className={inputClass}
                value={profileUsername}
                autoComplete="username"
                onChange={(event) => setProfileUsername(event.target.value)}
              />
            </Field>
            <Field label={en.currentPassword}>
              <input
                className={inputClass}
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                placeholder="Required to save"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label={en.newPassword} hint="Leave blank to keep your current password.">
              <input
                className={inputClass}
                type="password"
                value={newPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field label={en.confirmPassword}>
              <input
                className={inputClass}
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                placeholder="Repeat new password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveProfile();
                }}
              />
            </Field>
          </div>

          <Button
            variant="ghost"
            onClick={() => void saveProfile()}
            disabled={profileBusy || !currentPassword || !profileUsername.trim()}
          >
            {newPassword ? <KeyRound className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {profileBusy ? en.loading : en.updateProfile}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-300" />
              <div>
                <p className="text-sm font-medium text-cafe-ink">
                  {en.telegramSection}
                  {telegram?.botUsername ? (
                    <span className="ml-1 text-white/40">@{telegram.botUsername}</span>
                  ) : null}
                </p>
                <p className="text-xs text-white/45">
                  {botRuntime?.message ?? telegram?.message ?? en.loading}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadTelegram()}
              aria-label={en.refresh}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10"
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>

          {/* One-click bot launcher — replaces running `npm run bot` in a terminal. */}
          <div className="space-y-2.5 rounded-xl border border-white/8 bg-black/25 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    botRuntime?.active
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/12 bg-white/5 text-white/55",
                  )}
                >
                  {botRuntime?.active ? (
                    <Wifi className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" />
                  )}
                  {botRuntime?.configured
                    ? botRuntime.active
                      ? en.telegramActive
                      : en.telegramInactive
                    : en.telegramNotConfigured}
                </span>
                <span className="text-white/40">{en.telegramHint}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void connectBot()}
                  disabled={botBusy || !botRuntime?.configured || botRuntime?.active}
                  title={en.telegramConnect}
                >
                  {botBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  {botBusy ? en.telegramConnecting : en.telegramConnect}
                </Button>

                {botRuntime?.active ? (
                  <Button
                    variant="ghost"
                    onClick={() => void disconnectBot()}
                    disabled={botBusy}
                    title={en.telegramDisconnect}
                    className="!px-3"
                  >
                    <PowerOff className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Green on success, red on failure — the requested feedback. */}
            {botBanner ? (
              <p
                role="status"
                aria-live="polite"
                className={clsx(
                  "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed",
                  botBanner.tone === "success"
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-100",
                )}
              >
                {botBanner.tone === "success" ? (
                  <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-px h-4 w-4 shrink-0" />
                )}
                {botBanner.text}
              </p>
            ) : botRuntime && !botRuntime.active && botRuntime.configured ? (
              <p className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <WifiOff className="h-4 w-4 shrink-0" />
                {en.telegramStandby}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={inputClass}
              placeholder={en.telegramId}
              value={telegramId}
              inputMode="numeric"
              onChange={(event) => setTelegramId(event.target.value.replace(/\D/g, ""))}
            />
            <input
              className={inputClass}
              placeholder="Label (e.g. Sara — barista)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button variant="ghost" onClick={() => void addContact()}>
              <Plus className="h-4 w-4" />
              {en.addToWhitelist}
            </Button>
          </div>

          <div className="space-y-2">
            {telegram && telegram.whitelist.length > 0 ? (
              telegram.whitelist.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cafe-ink">{contact.label}</p>
                    <p className="text-xs text-white/40">ID {contact.telegramId}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={en.remove}
                    onClick={() => void removeContact(contact.id)}
                    className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="flex items-center gap-2 text-xs text-white/40">
                <Send className="h-3.5 w-3.5" />
                {en.whitelistEmpty} users can run /whoami in the bot to find theirs.
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
