"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coffee,
  LogIn,
  LogOut,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { PlaylistBoard } from "@/components/playlist-board";
import { LoginModal } from "@/components/login-modal";
import { UploadModal } from "@/components/upload-modal";
import { CategoryManager } from "@/components/category-manager";
import { AdminPanel } from "@/components/admin-panel";
import { Button, Toaster, inputClass, type Toast } from "@/components/ui";
import { useAudioPlayerContext } from "@/contexts/audio-player-context";
import { api, getStoredToken, setStoredToken } from "@/lib/client-api";
import { accentClasses, formatDurationLong } from "@/lib/format";
import { en } from "@/lib/i18n";
import { fisherYates } from "@/hooks/use-audio-player";
import { parseScheduleTime, wallClockParts } from "@/lib/schedule";
import type {
  CategoryDTO,
  ScheduleEntryDTO,
  SessionUserDTO,
  SongDTO,
  SystemConfigDTO,
} from "@/lib/types";

export function CafeApp({
  initialUser,
  initialCategories,
  initialCategoryId,
  initialSongs,
  initialConfig,
}: {
  initialUser: SessionUserDTO | null;
  initialCategories: CategoryDTO[];
  initialCategoryId: string;
  initialSongs: SongDTO[];
  initialConfig: SystemConfigDTO;
}) {
  const [user, setUser] = useState<SessionUserDTO | null>(initialUser);
  const [categories, setCategories] = useState<CategoryDTO[]>(initialCategories);
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId);
  const [songs, setSongs] = useState<SongDTO[]>(initialSongs);
  const [config, setConfig] = useState<SystemConfigDTO>(initialConfig);
  const [schedules, setSchedules] = useState<ScheduleEntryDTO[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [query, setQuery] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [loginOpen, setLoginOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const isAdmin = user?.role === "ADMIN";
  const canUpload = Boolean(user && (isAdmin || config.allowGuestUpload));

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4200);
    },
    [],
  );

  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    [],
  );

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        song.artist.toLowerCase().includes(needle),
    );
  }, [songs, query]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId);
  const audioPlayer = useAudioPlayerContext();
  /**
   * `audioPlayer` is the player context value, which is re-created on every render
   * (the provider memoises on the player object, and the player returns a fresh
   * object each render). While music plays, `timeupdate` re-renders several times a
   * second, so anything that lists `audioPlayer` in a dependency array is torn down
   * and rebuilt constantly. The schedule engine below reads the player through this
   * ref so its 1-second interval is never destroyed mid-playback.
   */
  const audioPlayerRef = useRef(audioPlayer);
  useEffect(() => {
    audioPlayerRef.current = audioPlayer;
  });

  const refreshCategories = useCallback(async () => {
    try {
      const next = await api.categories();
      setCategories(next);
      if (next.length > 0 && !next.some((category) => category.id === activeCategoryId)) {
        setActiveCategoryId(next[0].id);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : en.couldNotLoadPlaylists, "error");
    }
  }, [activeCategoryId, notify]);

  const lastKnownSongCountRef = useRef(initialSongs.length);
  /**
   * True while the visible list is in a locally shuffled order. The background poll
   * respects this so a shuffle is never silently reverted to the stored DB order.
   * Cleared when the user switches playlist or explicitly reloads the list.
   */
  const shuffledRef = useRef(false);

  const loadSongs = useCallback(
    async (categoryId: string, silent = false) => {
      if (!categoryId) {
        setSongs([]);
        lastKnownSongCountRef.current = 0;
        shuffledRef.current = false;
        return;
      }
      if (!silent) {
        setLoadingSongs(true);
      }
      try {
        const nextSongs = await api.songs(categoryId);
        setSongs(nextSongs);
        lastKnownSongCountRef.current = nextSongs.length;
        shuffledRef.current = false;
      } catch (error) {
        notify(error instanceof Error ? error.message : en.couldNotLoadTracks, "error");
      } finally {
        if (!silent) {
          setLoadingSongs(false);
        }
      }
    },
    [notify],
  );

  /**
   * Background poll that picks up tracks added elsewhere (Telegram bot, another admin).
   *
   * Two things matter here:
   *  - Compare the playlist's OWN count, not the library-wide total. The old code
   *    compared `stats.songCount` (whole library) against the current playlist length,
   *    so as soon as a second playlist held any track the condition was permanently
   *    true and the list was silently refetched every 5 s.
   *  - Never refetch while the user is looking at a locally shuffled order, otherwise
   *    that refetch overwrites the shuffle with the stored DB order a few seconds later.
   */
  const refreshSongsIfNeeded = useCallback(
    async (categoryId: string) => {
      if (!categoryId) return;
      if (shuffledRef.current) return;

      try {
        const snapshot = await api.songsSnapshot(categoryId);
        const remoteCount =
          snapshot.categoryStats?.songCount ?? snapshot.songs.length;
        if (remoteCount === lastKnownSongCountRef.current) return;
        if (shuffledRef.current) return; // user shuffled while the request was in flight
        await loadSongs(categoryId, true);
      } catch (error) {
        notify(error instanceof Error ? error.message : en.couldNotCheckUpdates, "error");
      }
    },
    [loadSongs, notify],
  );

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (audioPlayer.state.queue.length > 0) return;
    audioPlayer.setQueue(songs);
  }, [audioPlayer, audioPlayer.state.queue.length, songs]);

  useEffect(() => {
    audioPlayer.setCategoryName(activeCategory?.name ?? "Library");
  }, [audioPlayer, activeCategory]);

  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    void loadSongs(activeCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId]);

  useEffect(() => {
    if (!activeCategoryId) return;
    const interval = window.setInterval(() => {
      void refreshSongsIfNeeded(activeCategoryId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeCategoryId, refreshSongsIfNeeded]);

  // Load the daily playlist schedule once; the engine below runs on every client.
  useEffect(() => {
    let cancelled = false;
    void api
      .schedules()
      .then((next) => {
        if (!cancelled) setSchedules(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Scheduled-playlists engine.
   *
   * Every second, the current wall-clock time (in the configured timezone) is
   * compared with each enabled entry. When the set time is hit (with a small
   * catch-up window so throttled background tabs still fire), the chosen playlist
   * is fetched and handed to the player, which starts it right after the current
   * track ends and then loops it. Entries never fire twice on the same day.
   */
  const firedScheduleKeysRef = useRef<Set<string>>(new Set());
  const lastPruneDayRef = useRef("");

  useEffect(() => {
    if (schedules.length === 0) return;
    const tz = config.scheduleTimezone;

    const check = () => {
      const now = new Date();
      const clock = wallClockParts(now, tz);
      const dayKey = `${clock.year}-${clock.month}-${clock.day}`;
      if (lastPruneDayRef.current !== dayKey) {
        lastPruneDayRef.current = dayKey;
        firedScheduleKeysRef.current.clear();
      }

      const nowMinutes = clock.hour * 60 + clock.minute;
      const due = schedules.filter((entry) => {
        if (!entry.enabled) return false;
        const parsed = parseScheduleTime(entry.time);
        if (!parsed) return false;
        const elapsed = nowMinutes - (parsed.hour * 60 + parsed.minute);
        // Only fire at/after the set time, within a 2-minute catch-up window,
        // and never more than once per day per entry.
        if (elapsed < 0 || elapsed > 2) return false;
        const key = `${entry.id}:${dayKey}`;
        return !firedScheduleKeysRef.current.has(key);
      });
      if (due.length === 0) return;

      // Mark every due entry as fired today; the newest created one wins the minute.
      for (const entry of due) {
        firedScheduleKeysRef.current.add(`${entry.id}:${dayKey}`);
      }
      const target = due.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));

      void (async () => {
        try {
          const targetSongs = await api.songs(target.categoryId);
          const displayName = target.label || target.categoryName;
          if (targetSongs.length === 0) {
            notify(en.scheduleEmptyPlaylist(displayName), "info");
            return;
          }
          audioPlayerRef.current.playCategoryAfterCurrent(targetSongs);
          notify(en.scheduleFired(displayName, target.time), "info");
        } catch {
          /* transient network failure — a later poll re-evaluates */
        }
      })();
    };

    const interval = window.setInterval(check, 1000);
    return () => window.clearInterval(interval);
  }, [schedules, config.scheduleTimezone, notify]);

  // Restore the session from the stored Bearer token when the cookie is unavailable
  // (e.g. the app is embedded in a cross-site iframe that blocks third-party cookies).
  useEffect(() => {
    if (initialUser || !getStoredToken()) return;
    let cancelled = false;
    void api
      .me()
      .then((result) => {
        if (!cancelled && result.user) setUser(result.user);
        if (!cancelled && !result.user) setStoredToken(null);
      })
      .catch(() => setStoredToken(null));
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  /**
   * Header "Shuffle" button: reshuffles the visible playlist and the playback queue for
   * this browser only. Nothing is written to the database, so it works for guests and
   * never disturbs the order other people (or the Telegram bot) see.
   */
  const handleShuffleAll = useCallback(() => {
    if (songs.length < 2) {
      notify(en.shuffleNeedsTracks, "info");
      return;
    }
    const shuffled = fisherYates(songs);
    shuffledRef.current = true;
    setSongs(shuffled);
    audioPlayer.setQueue(shuffled);
    setQuery("");
    notify(en.shuffleDone, "success");
  }, [songs, audioPlayer, notify]);

  const handleReorder = async (ordered: SongDTO[]) => {
    const previous = songs;
    const withOrder = ordered.map((song, index) => ({ ...song, order: index }));
    setSongs(withOrder);
    try {
      await api.reorder(
        activeCategoryId,
        withOrder.map((song) => ({ id: song.id, order: song.order })),
      );
      shuffledRef.current = false;
      notify(en.orderSaved, "success");
    } catch (error) {
      setSongs(previous);
      notify(error instanceof Error ? error.message : en.reorderFailed, "error");
    }
  };

  const handleDelete = async (song: SongDTO) => {
    const previous = songs;
    const previousCount = lastKnownSongCountRef.current;
    setSongs((prev) => prev.filter((entry) => entry.id !== song.id));
    // Keep the polled baseline in step with the optimistic update, otherwise the
    // next poll sees a mismatch and refetches (which would drop a local shuffle).
    lastKnownSongCountRef.current = Math.max(0, previousCount - 1);
    try {
      await api.deleteSong(song.id);
      notify(en.removed(song.title), "success");
      void refreshCategories();
    } catch (error) {
      setSongs(previous);
      lastKnownSongCountRef.current = previousCount;
      notify(error instanceof Error ? error.message : en.deleteFailed, "error");
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      notify(en.signedOut, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : en.logoutFailed, "error");
    }
  };

  const totalTracks = categories.reduce((sum, category) => sum + category.songCount, 0);

  return (
    <div className="relative z-10 min-h-screen pb-44">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-cafe-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/30 to-cafe-800">
              <Coffee className="h-5 w-5 text-amber-200" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-cafe-ink">
                {config.cafeName}
              </h1>
              <p className="truncate text-[11px] text-white/40">
                {en.appTagline(totalTracks, categories.length)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleShuffleAll}
              className="!px-3"
              title={en.shuffleAllTitle}
            >
              <Shuffle className="h-4 w-4" />
              <span className="hidden md:inline">{en.shuffleAll}</span>
            </Button>

            {canUpload ? (
              <Button onClick={() => setUploadOpen(true)} className="!px-3 sm:!px-4">
                <UploadCloud className="h-4 w-4" />
                <span className="hidden sm:inline">{en.upload}</span>
              </Button>
            ) : null}

            {isAdmin ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setCategoryOpen(true)}
                  className="!px-3"
                  title={en.playlists}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden md:inline">{en.playlists}</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setAdminOpen(true)}
                  className="!px-3"
                  title={en.adminTitle}
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden md:inline">{en.admin}</span>
                </Button>
              </>
            ) : null}

            {user ? (
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs sm:flex",
                    isAdmin
                      ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                      : "border-white/12 bg-white/5 text-white/60",
                  )}
                >
                  {isAdmin ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <UserRound className="h-3.5 w-3.5" />
                  )}
                  {user.username}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => void handleLogout()}
                  className="!px-3"
                  title={en.signOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setLoginOpen(true)} className="!px-3">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">{en.staff}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => {
              const accents = accentClasses(category.accent);
              const active = category.id === activeCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={clsx(
                    "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                    active
                      ? `${accents.chip} ring-1 ${accents.ring}`
                      : "border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  {category.name}
                  <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {category.songCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70">
              {en.nowCuring}
            </p>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-cafe-ink">
              {activeCategory?.name ?? en.noPlaylist}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/45">
              {activeCategory?.description ?? en.emptyPlaylistHint}
            </p>
            <p className="mt-2 text-xs text-white/35">
              {en.trackCount(
                songs.length,
                formatDurationLong(songs.reduce((sum, song) => sum + song.duration, 0)),
              )}
              {isAdmin ? en.dragHint : ""}
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              className={clsx(inputClass, "pl-9")}
              placeholder={en.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </section>

        {!user ? (
          <p className="mb-4 rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-xs text-white/45">
            {en.guestNotice}{" "}
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              {en.guestSignIn}
            </button>
            {en.guestUploadHint(config.allowGuestUpload)}
          </p>
        ) : null}

        <PlaylistBoard
          songs={visibleSongs}
          currentSongId={audioPlayer.state.currentSong?.id ?? null}
          isPlaying={audioPlayer.state.isPlaying}
          user={user}
          loading={loadingSongs}
          onSelect={(song) => {
            if (song.id === audioPlayer.state.currentSong?.id) {
              audioPlayer.togglePlay();
              return;
            }

            const queueIds = new Set(audioPlayer.state.queue.map((item) => item.id));
            if (!queueIds.has(song.id)) {
              audioPlayer.setQueue(songs);
            }
            audioPlayer.playTrack(song);
          }}
          onReorder={(ordered) => void handleReorder(ordered)}
          onDelete={(song) => void handleDelete(song)}
        />
      </main>

      

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={(nextUser) => {
          setUser(nextUser);
          notify(en.welcomeBack(nextUser.username), "success");
          void refreshCategories();
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        categories={categories}
        defaultCategoryId={activeCategoryId}
        onUploaded={(song) => {
          if (song.categoryId === activeCategoryId) {
            setSongs((prev) => [...prev, song]);
            lastKnownSongCountRef.current += 1;
          }
          void refreshCategories();
          notify(en.added(song.title), "success");
        }}
      />

      <CategoryManager
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        categories={categories}
        notify={notify}
        onChanged={async () => {
          await refreshCategories();
          await loadSongs(activeCategoryId);
        }}
      />

      {user?.role === "ADMIN" ? (
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          config={config}
          onConfigChange={setConfig}
          user={user}
          onUserChange={setUser}
          notify={notify}
          stats={{ songCount: totalTracks, categoryCount: categories.length }}
          categories={categories}
          schedules={schedules}
          setSchedules={setSchedules}
        />
      ) : null}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
