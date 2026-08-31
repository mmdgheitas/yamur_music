"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /**
         * The player dock is `position: fixed` at the bottom, so it used to cover the
         * last rows of a tall dialog (the upload queue's buttons) with no way to scroll
         * them into view. Reserving the measured dock height as bottom padding lets the
         * content scroll clear of it without resizing or restyling the dialog itself.
         */
        style={{
          paddingBottom: "calc(var(--player-dock-height, 7rem) + 1.5rem)",
        }}
        className={clsx(
          "glass animate-rise relative z-10 max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl sm:p-6",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-cafe-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/50">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    primary:
      "bg-amber-500 text-cafe-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 font-semibold",
    ghost: "border border-white/12 bg-white/5 text-white/80 hover:bg-white/10",
    danger: "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    subtle: "text-white/60 hover:text-white",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-white/45">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-xs text-white/35">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-cafe-ink outline-none transition placeholder:text-white/25 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/25 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-cafe-ink">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-white/45">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50",
          checked ? "bg-emerald-500/80" : "bg-white/12",
        )}
      >
        <span
          className={clsx(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-6" : "left-1",
          )}
        />
      </button>
    </div>
  );
}

export type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-32">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={clsx(
            "animate-rise pointer-events-auto rounded-2xl border px-4 py-3 text-left text-sm shadow-xl backdrop-blur",
            toast.tone === "success" &&
              "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
            toast.tone === "error" && "border-rose-400/30 bg-rose-500/15 text-rose-100",
            toast.tone === "info" && "border-white/12 bg-black/70 text-white/80",
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function EqualizerIcon({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 w-4 items-end gap-[2px]">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={clsx(
            "w-[3px] rounded-sm bg-amber-400",
            active ? "eq-bar" : "opacity-40",
          )}
          style={{
            height: `${[10, 16, 12][index]}px`,
            animationDelay: `${index * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}
