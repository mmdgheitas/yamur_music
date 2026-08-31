"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button, Field, inputClass } from "@/components/ui";
import { api } from "@/lib/client-api";
import { en } from "@/lib/i18n";
import { resolveTimezone, wallClockParts } from "@/lib/schedule";
import type { CategoryDTO, ScheduleEntryDTO, SystemConfigDTO } from "@/lib/types";

/**
 * The "Scheduled playlists" settings section (rendered inside the Admin panel).
 *
 * Each entry is a daily wall-clock time ("HH:MM") that, when hit, starts the chosen
 * playlist right after the currently playing track ends (then loops it). The whole
 * section is admin-only; the engine itself runs on every open client.
 */
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "LOCAL", label: en.scheduleTimezoneLocal },
  { value: "Asia/Tehran", label: "Asia/Tehran (UTC+3:30)" },
  { value: "Asia/Baghdad", label: "Asia/Baghdad (UTC+3)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+4)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "UTC", label: "UTC" },
];

function timezoneDisplayName(value: string): string {
  const option = TIMEZONE_OPTIONS.find((entry) => entry.value === value);
  return option?.label ?? value;
}

export function ScheduleManager({
  config,
  onConfigChange,
  categories,
  schedules,
  setSchedules,
  notify,
}: {
  config: SystemConfigDTO;
  onConfigChange: (next: SystemConfigDTO) => void;
  categories: CategoryDTO[];
  schedules: ScheduleEntryDTO[];
  setSchedules: (next: ScheduleEntryDTO[]) => void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [tzBusy, setTzBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Live "current time in the selected timezone" clock so the admin can trust
  // the scheduler without guessing.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const changeTimezone = async (next: string) => {
    if (next === config.scheduleTimezone) return;
    setTzBusy(true);
    try {
      const updated = await api.updateConfig({ scheduleTimezone: next });
      onConfigChange(updated);
      notify(`Schedule timezone set to ${timezoneDisplayName(next)}`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setTzBusy(false);
    }
  };

  const addEntry = async () => {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      notify('Enter the time in 24-hour "HH:MM" format', "error");
      return;
    }
    if (!categoryId) {
      notify("Pick a playlist first", "error");
      return;
    }
    setBusy(true);
    try {
      const entry = await api.createSchedule({
        time: time.trim(),
        label: label.trim() || undefined,
        categoryId,
      });
      setSchedules([...schedules, entry]);
      setTime("");
      setLabel("");
      notify(en.scheduleAdded, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleEntry = async (entry: ScheduleEntryDTO) => {
    try {
      const updated = await api.updateSchedule(entry.id, { enabled: !entry.enabled });
      setSchedules(schedules.map((item) => (item.id === entry.id ? updated : item)));
    } catch (error) {
      notify(error instanceof Error ? error.message : en.scheduleToggleError, "error");
    }
  };

  const removeEntry = async (entry: ScheduleEntryDTO) => {
    try {
      await api.deleteSchedule(entry.id);
      setSchedules(schedules.filter((item) => item.id !== entry.id));
      notify(en.scheduleRemoved, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.errorGeneric, "error");
    }
  };

  const clock = wallClockParts(now, config.scheduleTimezone);
  const clockLabel = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const tzName = timezoneDisplayName(config.scheduleTimezone);

  return (
    <div className="space-y-4 rounded-2xl border border-white/8 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-violet-300" />
          <div>
            <p className="text-sm font-medium text-cafe-ink">{en.scheduleSection}</p>
            <p className="text-xs text-white/45">{en.scheduleHint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs tabular-nums text-white/60">
          <Clock className="h-3.5 w-3.5 text-amber-300" />
          <span>{clockLabel}</span>
          <span className="text-white/35">· {tzName}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label={en.scheduleTimezone}>
          <select
            className={inputClass}
            value={config.scheduleTimezone}
            disabled={tzBusy}
            onChange={(event) => void changeTimezone(event.target.value)}
          >
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-cafe-900">
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-end">
        <Field label={en.scheduleTime}>
          <input
            className={inputClass}
            placeholder="09:30"
            inputMode="numeric"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addEntry();
            }}
          />
        </Field>
        <Field label={en.schedulePlaylist}>
          <select
            className={inputClass}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.length === 0 ? (
              <option value="" className="bg-cafe-900">
                No playlists yet
              </option>
            ) : (
              categories.map((category) => (
                <option key={category.id} value={category.id} className="bg-cafe-900">
                  {category.name}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label={en.scheduleLabel}>
          <input
            className={inputClass}
            placeholder="e.g. Lunch hours"
            maxLength={80}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Button
          onClick={() => void addEntry()}
          disabled={busy || categories.length === 0}
          className="!px-3"
        >
          <Plus className="h-4 w-4" />
          {en.scheduleAdd}
        </Button>
      </div>

      <div className="space-y-2">
        {schedules.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-white/40">
            <CalendarClock className="h-3.5 w-3.5" />
            {en.scheduleEmpty}
          </p>
        ) : (
          schedules.map((entry) => (
            <div
              key={entry.id}
              className={clsx(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                entry.enabled
                  ? "border-white/8 bg-black/30"
                  : "border-white/5 bg-black/20 opacity-60",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={clsx(
                    "shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums",
                    entry.enabled
                      ? "bg-violet-500/15 text-violet-200"
                      : "bg-white/5 text-white/40",
                  )}
                >
                  {entry.time}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-cafe-ink">
                    {entry.label || entry.categoryName}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {entry.label ? entry.categoryName : "Playlist"}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={entry.enabled}
                  aria-label={`Enable schedule ${entry.time}`}
                  onClick={() => void toggleEntry(entry)}
                  className={clsx(
                    "relative h-6 w-11 rounded-full transition",
                    entry.enabled ? "bg-emerald-500/80" : "bg-white/12",
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      entry.enabled ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>
                <button
                  type="button"
                  aria-label={en.remove}
                  onClick={() => void removeEntry(entry)}
                  className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
