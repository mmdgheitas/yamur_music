"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SongDTO } from "@/lib/types";
import { en } from "@/lib/i18n";

export type RepeatMode = "OFF" | "ALL" | "ONE";

/** Non-repeating Fisher–Yates shuffle. */
export function fisherYates<T>(input: T[]): T[] {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export type PlayerState = {
  currentSong: SongDTO | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isBuffering: boolean;
  error: string | null;
  /**
   * True when the browser rejected an automatic play() because of the autoplay
   * policy (no user gesture yet). The track stays loaded and selected; one tap
   * anywhere or on the dock's play button starts it.
   */
  autoplayBlocked: boolean;
  queue: SongDTO[];
};

export function useAudioPlayer(
  initialPlaylist: SongDTO[],
  audioRef: RefObject<HTMLAudioElement | null>,
) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [queue, setQueueState] = useState<SongDTO[]>(initialPlaylist);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("ALL");
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentSongRef = useRef<SongDTO | null>(null);
  const playAttemptRef = useRef(0);
  /**
   * When a scheduled playlist fires while a track is playing, we do NOT interrupt
   * the track: the schedule is parked here and taken over as soon as the current
   * track naturally ends (`ended` event). `null` = no pending schedule.
   */
  const pendingScheduleRef = useRef<SongDTO[] | null>(null);

  const currentSong = useMemo(() => {
    const fromQueue = queue.find((song) => song.id === currentId);
    if (fromQueue) {
      return fromQueue;
    }
    if (currentId && currentSongRef.current?.id === currentId) {
      return currentSongRef.current;
    }
    return null;
  }, [queue, currentId]);

  const setQueue = useCallback((songs: SongDTO[]) => {
    setQueueState(songs);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsBuffering(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
      setError(null);
      setAutoplayBlocked(false);
    };
    const onPause = () => setIsPlaying(false);
    const onErr = () => {
      setIsBuffering(false);
      setIsPlaying(false);
      setError(en.playbackError);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onErr);
    };
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [audioRef, volume, muted]);

  useEffect(() => {
    if (!shuffle) {
      setShuffleOrder([]);
      return;
    }
    const ids = queue.map((song) => song.id);
    const shuffled = fisherYates(ids);
    if (currentId && shuffled.includes(currentId)) {
      setShuffleOrder([currentId, ...shuffled.filter((id) => id !== currentId)]);
    } else {
      setShuffleOrder(shuffled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffle, queue.map((s) => s.id).join("|")]);

  const orderedIds = useMemo(() => {
    if (shuffle && shuffleOrder.length > 0) {
      const valid = new Set(queue.map((song) => song.id));
      return shuffleOrder.filter((id) => valid.has(id));
    }
    return queue.map((song) => song.id);
  }, [shuffle, shuffleOrder, queue]);

  const loadAndPlay = useCallback(
    async (song: SongDTO, autoplay = true) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.dataset.songId !== song.id) {
        audio.src = song.url;
        audio.dataset.songId = song.id;
        audio.load();
        setCurrentTime(0);
        setDuration(song.duration || 0);
      }
      // Do not mutate currentId/currentSong until playback actually starts.
      if (!autoplay) {
        // Keep src loaded but do not mark as active yet.
        return;
      }

      const attempt = ++playAttemptRef.current;
      try {
        setIsBuffering(true);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          // If the play promise rejects it will be handled below.
          await playPromise;
        }

        // If another play attempt started after this one, abort committing state.
        if (playAttemptRef.current !== attempt) {
          // A newer play was requested; don't override the active track state.
          return;
        }

        setCurrentId(song.id);
        currentSongRef.current = song;
        setError(null);
        setIsBuffering(false);
        setIsPlaying(true);
      } catch (err) {
        const name = (err as DOMException | undefined)?.name;

        if (name === "NotAllowedError") {
          // The browser blocked autoplay: play() was called without a user
          // gesture (e.g. a scheduled playlist fired while nobody interacted
          // with the page). This is NOT a playback failure — keep the track
          // loaded and selected so one tap (dock button, Space, or anywhere
          // on the page) starts it. Nothing is logged to the console.
          setIsBuffering(false);
          setIsPlaying(false);
          if (playAttemptRef.current === attempt) {
            setCurrentId(song.id);
            currentSongRef.current = song;
          }
          setAutoplayBlocked(true);
          setError(null);
          return;
        }

        // Ensure audio is stopped and do not auto-advance the index.
        try {
          audio.pause();
        } catch {}
        setIsBuffering(false);
        setIsPlaying(false);
        if (name !== "AbortError") {
          console.error("[player] playback failed:", err);
          setError(en.playbackError);
        }
      }
    },
    [audioRef],
  );

  const playTrack = useCallback(
    (song?: SongDTO) => {
      if (!song || song.id === currentId) return;
      // Cancel any pending automated transitions or previous play attempts.
      playAttemptRef.current += 1;
      // The user picked a track — drop any parked schedule so it cannot hijack
      // the queue later.
      pendingScheduleRef.current = null;
      void loadAndPlay(song, true);
    },
    [currentId, loadAndPlay],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Starting playback from an already-loaded source: ensure state is only
    // updated when play actually begins, and keep play attempts cancelable.
    const attempt = ++playAttemptRef.current;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (playAttemptRef.current !== attempt) return;
          setIsPlaying(true);
          setError(null);
          setAutoplayBlocked(false);
          // If currentId wasn't set (e.g. autoplay blocked earlier), sync it
          // with the actually loaded source.
          if (!currentId && audio.dataset.songId) {
            setCurrentId(audio.dataset.songId);
            // currentSongRef can't be reconstructed here reliably; leave it
            // to other code paths that set it on successful load+play.
          }
        })
        .catch((err) => {
          // A play() triggered by a real user gesture should not be blocked,
          // but if the browser still refuses, don't surface it as an error.
          if ((err as DOMException)?.name === "NotAllowedError") return;
          console.warn("Playback error:", err);
        });
    }
  }, [audioRef, currentSong, currentId]);

  /**
   * Autoplay-policy workaround: when the browser rejected an automatic play()
   * (e.g. a scheduled playlist fired with no user interaction yet), the track is
   * loaded but paused. Any click on the page counts as a user gesture, so retry
   * playback then — one tap anywhere in the cafe starts the music.
   *
   * `click` is used instead of `pointerdown` so a fast-starting local file cannot
   * race the dock/banner button's own toggle (which would pause it right back).
   * Interactive controls are skipped — they have their own gesture-driven
   * handlers (the dock play button, the amber banner, Space in the key handler).
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const resume = (event: MouseEvent) => {
      if (!autoplayBlocked) return;
      if (!audio.dataset.songId || !audio.paused) return;
      const target = event.target as Element | null;
      if (target?.closest("button, a, input, select, textarea")) return;
      void audio.play().catch(() => undefined);
    };
    window.addEventListener("click", resume);
    return () => window.removeEventListener("click", resume);
  }, [audioRef, autoplayBlocked]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [audioRef]);

  const toggle = useCallback(
    (song?: SongDTO) => {
      if (song && song.id !== currentId) {
        playTrack(song);
        return;
      }
      if (currentSong) {
        togglePlay();
      }
    },
    [currentId, currentSong, playTrack, togglePlay],
  );

  const step = useCallback(
    (direction: 1 | -1, userInitiated = true) => {
      const ids = orderedIds;
      if (ids.length === 0) return;
      // Use the actual audio element's loaded source id first to avoid
      // index drift when state hasn't been committed yet.
      const audio = audioRef.current;
      const activeId = audio?.dataset.songId ?? currentId ?? currentSongRef.current?.id ?? null;
      const index = activeId ? ids.indexOf(activeId) : -1;

      if (!userInitiated && repeat === "ONE" && currentId) {
        const same = queueRef.current.find((song) => song.id === currentId);
        if (same) {
          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = 0;
            void audio.play().catch(() => undefined);
          }
          return;
        }
      }

      let nextIndex = index + direction;
      if (nextIndex >= ids.length) {
        if (repeat === "OFF" && !userInitiated) {
          pause();
          return;
        }
        nextIndex = 0;
      }
      if (nextIndex < 0) nextIndex = ids.length - 1;

      const nextId = ids[nextIndex];
      const nextSong = queueRef.current.find((song) => song.id === nextId);
      if (nextSong) {
        // Cancel any concurrent play attempts before auto-advancing.
        if (userInitiated) playAttemptRef.current += 1;
        void loadAndPlay(nextSong, true);
      }
    },
    [currentId, loadAndPlay, orderedIds, pause, repeat, audioRef],
  );

  const next = useCallback(() => step(1, true), [step]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    // Cancel pending automated transitions when user explicitly moves.
    playAttemptRef.current += 1;
    step(-1, true);
  }, [step, audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      // A parked schedule takes over the moment the current track ends: swap the
      // whole queue to the scheduled playlist, loop it, and start from its top.
      const pending = pendingScheduleRef.current;
      if (pending && pending.length > 0) {
        pendingScheduleRef.current = null;
        setShuffle(false);
        setQueue(pending);
        setRepeat("ALL");
        if (audio) audio.currentTime = 0;
        void loadAndPlay(pending[0], true);
        return;
      }
      // When the element naturally ends, advance using the live audio dataset
      // to compute the next track and start it.
      step(1, false);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audioRef, step, loadAndPlay, setQueue]);

  /**
   * Scheduled-playlist entry point: starts `categorySongs` right AFTER the track
   * currently playing (never interrupting it), or immediately when nothing is
   * playing. The scheduled playlist then repeats on itself.
   */
  const playCategoryAfterCurrent = useCallback(
    (categorySongs: SongDTO[]) => {
      if (!categorySongs || categorySongs.length === 0) return;
      const audio = audioRef.current;
      const active = currentSong ?? currentSongRef.current;
      const actuallyPlaying = audio ? !audio.paused : isPlaying;

      if (active && actuallyPlaying) {
        // Park the schedule — the `ended` listener above takes it over.
        pendingScheduleRef.current = categorySongs;
        return;
      }

      // Nothing is playing (or it's paused): take over immediately.
      pendingScheduleRef.current = null;
      setShuffle(false);
      setQueue(categorySongs);
      setRepeat("ALL");
      void loadAndPlay(categorySongs[0], true);
    },
    [currentSong, isPlaying, loadAndPlay, audioRef, setQueue],
  );

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const safe = Math.max(0, Math.min(seconds, audio.duration || seconds));
      audio.currentTime = safe;
      setCurrentTime(safe);
    },
    [audioRef],
  );

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((prev) => !prev), []);
  const toggleShuffle = useCallback(() => setShuffle((prev) => !prev), []);
  const cycleRepeat = useCallback(
    () => setRepeat((prev) => (prev === "OFF" ? "ALL" : prev === "ALL" ? "ONE" : "OFF")),
    [],
  );

  const state: PlayerState = {
    currentSong,
    isPlaying,
    currentTime,
    duration: duration || currentSong?.duration || 0,
    volume,
    muted,
    shuffle,
    repeat,
    isBuffering,
    error,
    autoplayBlocked,
    queue,
  };

  return {
    state,
    playTrack,
    pause,
    toggle,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    setQueue,
    playCategoryAfterCurrent,
  };
}
