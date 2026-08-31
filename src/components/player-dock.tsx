"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Disc3,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import clsx from "clsx";
import { formatTime } from "@/lib/format";
import { en } from "@/lib/i18n";
import type { PlayerState } from "@/hooks/use-audio-player";

export function PlayerDock({
  state,
  onToggle,
  onNext,
  onPrevious,
  onSeek,
  onVolume,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  categoryName,
}: {
  state: PlayerState;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  categoryName: string;
}) {
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const { currentSong, duration } = state;
  const displayTime = scrubbing ?? state.currentTime;
  const progress = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;

  // Global keyboard transport controls.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === " ") {
        event.preventDefault();
        onToggle();
      } else if (event.key === "ArrowRight" && event.shiftKey) {
        onNext();
      } else if (event.key === "ArrowLeft" && event.shiftKey) {
        onPrevious();
      } else if (event.key === "ArrowRight") {
        onSeek(state.currentTime + 5);
      } else if (event.key === "ArrowLeft") {
        onSeek(state.currentTime - 5);
      } else if (event.key.toLowerCase() === "m") {
        onToggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, onNext, onPrevious, onSeek, onToggleMute, state.currentTime]);

  /**
   * Publish the dock's real height so overlaying surfaces (modals) can reserve room
   * for it and stay fully scrollable. Recomputed on resize because the dock reflows
   * between the mobile (stacked) and desktop (single row) layouts.
   */
  useEffect(() => {
    const node = dockRef.current;
    if (!node) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        "--player-dock-height",
        `${node.offsetHeight}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    window.addEventListener("resize", publish);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  const VolumeIcon = useMemo(() => {
    if (state.muted || state.volume === 0) return VolumeX;
    return state.volume < 0.5 ? Volume1 : Volume2;
  }, [state.muted, state.volume]);

  return (
    <div
      ref={dockRef}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-cafe-950/85 backdrop-blur-xl"
    >
      <div
        className="h-[3px] w-full bg-white/8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
        {/* Track identity */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={clsx(
              "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/25 to-cafe-800",
              state.isPlaying && "shadow-lg shadow-amber-500/20",
            )}
          >
            {state.isBuffering ? (
              <Loader2 className="h-5 w-5 animate-spin text-amber-200" />
            ) : (
              <Disc3
                className={clsx(
                  "h-6 w-6 text-amber-200",
                  state.isPlaying && "animate-[spin_6s_linear_infinite]",
                )}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-cafe-ink">
              {currentSong ? currentSong.title : en.nothingPlaying}
            </p>
            <p className="truncate text-xs text-white/45">
              {currentSong ? (
                <>
                  {currentSong.artist}
                  <span className="mx-1.5 text-white/20">•</span>
                  <span className="inline-flex items-center gap-1">
                    <ListMusic className="h-3 w-3" />
                    {categoryName}
                  </span>
                </>
              ) : (
                en.pickTrack
              )}
            </p>
          </div>
        </div>

        {/* Transport */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <ControlButton
              label={en.shuffle}
              active={state.shuffle}
              onClick={onToggleShuffle}
              icon={<Shuffle className="h-4 w-4" />}
            />
            <ControlButton
              label={en.previous}
              onClick={onPrevious}
              icon={<SkipBack className="h-5 w-5" />}
            />
            <button
              type="button"
              onClick={onToggle}
              aria-label={state.isPlaying ? en.pause : en.play}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-cafe-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400 active:scale-95"
            >
              {state.isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" />
              )}
            </button>
            <ControlButton
              label={en.next}
              onClick={onNext}
              icon={<SkipForward className="h-5 w-5" />}
            />
            <ControlButton
              label={en.repeatLabel(state.repeat)}
              active={state.repeat !== "OFF"}
              onClick={onCycleRepeat}
              icon={
                state.repeat === "ONE" ? (
                  <Repeat1 className="h-4 w-4" />
                ) : (
                  <Repeat className="h-4 w-4" />
                )
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="w-10 text-right text-[11px] tabular-nums text-white/40">
              {formatTime(displayTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={displayTime}
              aria-label={en.seek}
              disabled={!currentSong}
              onChange={(event) => setScrubbing(Number(event.target.value))}
              onMouseUp={(event) => {
                onSeek(Number((event.target as HTMLInputElement).value));
                setScrubbing(null);
              }}
              onTouchEnd={(event) => {
                onSeek(Number((event.target as HTMLInputElement).value));
                setScrubbing(null);
              }}
              onKeyUp={(event) => {
                onSeek(Number((event.target as HTMLInputElement).value));
                setScrubbing(null);
              }}
              className="h-1.5 flex-1 disabled:opacity-40"
            />
            <span className="w-10 text-[11px] tabular-nums text-white/40">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume */}
        <div className="flex w-full items-center gap-2 lg:w-44">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={state.muted ? en.unmute : en.mute}
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.muted ? 0 : state.volume}
            aria-label={en.volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            className="h-1.5 flex-1"
          />
        </div>
      </div>

      {state.error ? (
        <p className="border-t border-rose-400/20 bg-rose-500/10 px-4 py-1.5 text-center text-[11px] text-rose-200">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        "rounded-xl p-2.5 transition hover:bg-white/8",
        active ? "text-amber-300" : "text-white/60 hover:text-white",
      )}
    >
      {icon}
    </button>
  );
}
