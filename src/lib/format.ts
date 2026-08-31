/** Client-safe formatting helpers. */

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatDurationLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} h ${mins % 60} min`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const ACCENT_CLASSES: Record<string, { chip: string; ring: string; glow: string; text: string }> = {
  amber: {
    chip: "bg-amber-500/15 text-amber-200 border-amber-400/40",
    ring: "ring-amber-400/60",
    glow: "from-amber-500/30",
    text: "text-amber-300",
  },
  emerald: {
    chip: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
    ring: "ring-emerald-400/60",
    glow: "from-emerald-500/30",
    text: "text-emerald-300",
  },
  violet: {
    chip: "bg-violet-500/15 text-violet-200 border-violet-400/40",
    ring: "ring-violet-400/60",
    glow: "from-violet-500/30",
    text: "text-violet-300",
  },
  sky: {
    chip: "bg-sky-500/15 text-sky-200 border-sky-400/40",
    ring: "ring-sky-400/60",
    glow: "from-sky-500/30",
    text: "text-sky-300",
  },
  rose: {
    chip: "bg-rose-500/15 text-rose-200 border-rose-400/40",
    ring: "ring-rose-400/60",
    glow: "from-rose-500/30",
    text: "text-rose-300",
  },
  teal: {
    chip: "bg-teal-500/15 text-teal-200 border-teal-400/40",
    ring: "ring-teal-400/60",
    glow: "from-teal-500/30",
    text: "text-teal-300",
  },
};

export function accentClasses(accent: string) {
  return ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.amber;
}
