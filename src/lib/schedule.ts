/**
 * Wall-clock helpers for the scheduled-playlist engine.
 *
 * The engine compares the CURRENT wall-clock minute (in the configured timezone)
 * against each entry's "HH:MM". Comparing wall-clock parts directly (instead of
 * epoch math) means a schedule fires exactly when the clock in that timezone
 * shows the set time — including across DST transitions, where the absolute
 * "when" of e.g. 09:00 shifts but the displayed time stays the same.
 */

export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** "LOCAL" (or empty/null) = the device's own clock; anything else = an IANA zone. */
export function resolveTimezone(timezone: string | null | undefined): string | null {
  if (!timezone || timezone === "LOCAL") return null;
  try {
    // Throws RangeError for unknown zone names — treat those as device-local.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

export function wallClockParts(
  date: Date,
  timezone: string | null | undefined,
): WallClock {
  const tz = resolveTimezone(timezone);

  if (!tz) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : NaN;
  };

  // Some engines report midnight as "24" with hour12:false — normalize to 0.
  let hour = get("hour");
  if (hour === 24) hour = 0;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
}

/** Parses a validated "HH:MM" string into { hour, minute }. */
export function parseScheduleTime(time: string): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}
