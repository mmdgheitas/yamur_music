"use client";

import { useEffect, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, ListMusic, Pause, Play, Send, Trash2 } from "lucide-react";
import clsx from "clsx";
import { EqualizerIcon } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { en } from "@/lib/i18n";
import type { SessionUserDTO, SongDTO } from "@/lib/types";

export function PlaylistBoard({
  songs,
  currentSongId,
  isPlaying,
  user,
  loading,
  onSelect,
  onReorder,
  onDelete,
}: {
  songs: SongDTO[];
  currentSongId: string | null;
  isPlaying: boolean;
  user: SessionUserDTO | null;
  loading: boolean;
  onSelect: (song: SongDTO) => void;
  onReorder: (ordered: SongDTO[]) => void;
  onDelete: (song: SongDTO) => void;
}) {
  const isAdmin = user?.role === "ADMIN";
  const [dndReady, setDndReady] = useState(false);

  // @hello-pangea/dnd needs the DOM; mount it only on the client.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDndReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = Array.from(songs);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-[68px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]"
          />
        ))}
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-16 text-center">
        <ListMusic className="h-9 w-9 text-white/25" />
        <p className="text-sm font-medium text-white/70">{en.emptyBoardTitle}</p>
        <p className="max-w-sm text-xs text-white/40">
          {en.emptyBoardHint}
        </p>
      </div>
    );
  }

  const rows = songs.map((song, index) => (
    <SongRow
      key={song.id}
      song={song}
      index={index}
      active={song.id === currentSongId}
      isPlaying={isPlaying && song.id === currentSongId}
      isAdmin={isAdmin}
      draggable={false}
      onSelect={onSelect}
      onDelete={onDelete}
    />
  ));

  if (!isAdmin || !dndReady) {
    return <div className="space-y-2">{rows}</div>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="playlist">
        {(droppableProvided, droppableSnapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={clsx(
              "space-y-2 rounded-3xl transition",
              droppableSnapshot.isDraggingOver && "bg-amber-500/[0.04] ring-1 ring-amber-400/20",
            )}
          >
            {songs.map((song, index) => (
              <Draggable key={song.id} draggableId={song.id} index={index}>
                {(draggableProvided, draggableSnapshot) => (
                  <div
                    ref={draggableProvided.innerRef}
                    {...draggableProvided.draggableProps}
                    style={draggableProvided.draggableProps.style}
                    className={clsx(draggableSnapshot.isDragging && "opacity-95")}
                  >
                    <SongRow
                      song={song}
                      index={index}
                      active={song.id === currentSongId}
                      isPlaying={isPlaying && song.id === currentSongId}
                      isAdmin
                      draggable
                      dragging={draggableSnapshot.isDragging}
                      dragHandleProps={draggableProvided.dragHandleProps ?? undefined}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

function SongRow({
  song,
  index,
  active,
  isPlaying,
  isAdmin,
  draggable,
  dragging,
  dragHandleProps,
  onSelect,
  onDelete,
}: {
  song: SongDTO;
  index: number;
  active: boolean;
  isPlaying: boolean;
  isAdmin: boolean;
  draggable: boolean;
  dragging?: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps;
  onSelect: (song: SongDTO) => void;
  onDelete: (song: SongDTO) => void;
}) {
  return (
    <div
      className={clsx(
        "group flex items-center gap-3 rounded-2xl border px-3 py-3 transition sm:px-4",
        active
          ? "border-amber-400/40 bg-amber-500/10 shadow-lg shadow-amber-500/5"
          : "border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]",
        dragging && "border-amber-400/60 bg-cafe-800 shadow-2xl",
      )}
    >
      {draggable ? (
        <span
          {...(dragHandleProps ?? {})}
          aria-label={en.reorderAria}
          className="cursor-grab touch-none rounded-lg p-1.5 text-white/25 transition hover:bg-white/5 hover:text-white/70 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      ) : (
        <span className="w-7 text-center text-xs tabular-nums text-white/30">
          {index + 1}
        </span>
      )}

      <button
        type="button"
        onClick={() => onSelect(song)}
        aria-label={en.playAria(song.title)}
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
          active
            ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
            : "border-white/10 bg-black/30 text-white/60 group-hover:text-white",
        )}
      >
        {active && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={() => onSelect(song)}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={clsx(
            "truncate text-sm font-medium",
            active ? "text-amber-100" : "text-cafe-ink",
          )}
        >
          {song.title}
        </p>
        <p className="truncate text-xs text-white/40">
          {song.artist}
          {song.source === "TELEGRAM" ? en.viaTelegram : ""}
        </p>
      </button>

      {song.source === "TELEGRAM" ? (
        <Send className="hidden h-3.5 w-3.5 text-sky-300/70 sm:block" />
      ) : null}

      {active ? <EqualizerIcon active={isPlaying} /> : null}

      <span className="w-10 text-right text-xs tabular-nums text-white/35">
        {formatTime(song.duration)}
      </span>

      {isAdmin ? (
        <button
          type="button"
          onClick={() => onDelete(song)}
          aria-label={en.deleteAria(song.title)}
          className="rounded-lg p-2 text-white/25 opacity-0 transition hover:bg-white/5 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
