"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { PlayerDock } from "@/components/player-dock";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import type { ReactNode } from "react";
import type { SongDTO } from "@/lib/types";
import type { PlayerState } from "@/hooks/use-audio-player";

type AudioPlayerContextValue = {
  state: PlayerState;
  play: (song?: SongDTO) => void;
  pause: () => void;
  playTrack: (song?: SongDTO) => void;
  pauseTrack: () => void;
  toggle: (song?: SongDTO) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (songs: SongDTO[]) => void;
  setCategoryName: (name: string) => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const player = useAudioPlayer([], audioRef);
  const [categoryName, setCategoryName] = useState("Library");

  const value = useMemo(
    () => ({
      state: player.state,
      play: player.playTrack,
      pause: player.pause,
      playTrack: player.playTrack,
      pauseTrack: player.pause,
      toggle: player.toggle,
      togglePlay: player.togglePlay,
      next: player.next,
      previous: player.previous,
      seek: player.seek,
      setVolume: player.setVolume,
      toggleMute: player.toggleMute,
      toggleShuffle: player.toggleShuffle,
      cycleRepeat: player.cycleRepeat,
      setQueue: player.setQueue,
      setCategoryName,
    }),
    [player],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <PlayerDock
        state={player.state}
        onToggle={player.togglePlay}
        onNext={player.next}
        onPrevious={player.previous}
        onSeek={player.seek}
        onVolume={player.setVolume}
        onToggleMute={player.toggleMute}
        onToggleShuffle={player.toggleShuffle}
        onCycleRepeat={player.cycleRepeat}
        categoryName={categoryName}
      />
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayerContext must be used within AudioPlayerProvider");
  }
  return context;
}
