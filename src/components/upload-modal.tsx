"use client";

import { useRef, useState } from "react";
import { FileAudio, Trash2, UploadCloud } from "lucide-react";
import clsx from "clsx";
import { Button, Field, Modal, inputClass } from "@/components/ui";
import { probeLocalDuration, uploadSong } from "@/lib/client-api";
import { formatBytes, formatTime } from "@/lib/format";
import { en } from "@/lib/i18n";
import type { CategoryDTO, SongDTO } from "@/lib/types";

type QueueItem = {
  id: string;
  file: File;
  title: string;
  artist: string;
  duration: number;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,audio/*";

export function UploadModal({
  open,
  onClose,
  categories,
  defaultCategoryId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDTO[];
  defaultCategoryId: string;
  onUploaded: (song: SongDTO) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((file) =>
      /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(file.name),
    );
    const prepared: QueueItem[] = [];
    for (const file of incoming) {
      const duration = await probeLocalDuration(file);
      prepared.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
        artist: "",
        duration,
        progress: 0,
        status: "pending",
      });
    }
    setQueue((prev) => [...prev, ...prepared]);
  };

  const patchItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const startUpload = async () => {
    if (!categoryId) return;
    setBusy(true);
    for (const item of queue) {
      if (item.status === "done") continue;
      patchItem(item.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const song = await uploadSong(
          item.file,
          categoryId,
          {
            title: item.title || undefined,
            artist: item.artist || undefined,
            duration: item.duration,
          },
          (percent) => patchItem(item.id, { progress: percent }),
        );
        patchItem(item.id, { status: "done", progress: 100 });
        onUploaded(song);
      } catch (error) {
        patchItem(item.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    setQueue([]);
    onClose();
  };

  const pendingCount = queue.filter((item) => item.status !== "done").length;

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={en.uploadTitle}
      subtitle={en.uploadSubtitle}
    >
      <div className="space-y-5">
        <Field label={en.destinationPlaylist}>
          <select
            className={inputClass}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id} className="bg-cafe-900">
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter") inputRef.current?.click();
          }}
          className={clsx(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-amber-400/70 bg-amber-500/10"
              : "border-white/12 bg-black/25 hover:border-amber-400/40 hover:bg-black/35",
          )}
        >
          <UploadCloud className="h-8 w-8 text-amber-300" />
          <p className="text-sm font-medium text-cafe-ink">
            {en.dropHere} — {en.browseFiles}
          </p>
          <p className="text-xs text-white/40">MP3 · WAV · M4A · FLAC · OGG — up to 60 MB each</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {queue.length > 0 ? (
          <div className="space-y-3">
            {queue.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/8 bg-black/30 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <FileAudio className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className={inputClass}
                        value={item.title}
                        placeholder={en.title}
                        onChange={(event) =>
                          patchItem(item.id, { title: event.target.value })
                        }
                      />
                      <input
                        className={inputClass}
                        value={item.artist}
                        placeholder={`${en.artist} (optional)`}
                        onChange={(event) =>
                          patchItem(item.id, { artist: event.target.value })
                        }
                      />
                    </div>
                    <p className="truncate text-xs text-white/40">
                      {item.file.name} · {formatBytes(item.file.size)}
                      {item.duration > 0 ? ` · ${formatTime(item.duration)}` : ""}
                    </p>
                    {item.status !== "pending" ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all",
                            item.status === "error" ? "bg-rose-400" : "bg-amber-400",
                          )}
                          style={{ width: `${item.status === "done" ? 100 : item.progress}%` }}
                        />
                      </div>
                    ) : null}
                    {item.error ? (
                      <p className="text-xs text-rose-300">{item.error}</p>
                    ) : null}
                    {item.status === "done" ? (
                      <p className="text-xs text-emerald-300">Added to playlist ✓</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={en.remove}
                    disabled={busy}
                    onClick={() =>
                      setQueue((prev) => prev.filter((entry) => entry.id !== item.id))
                    }
                    className="rounded-lg p-2 text-white/35 transition hover:bg-white/5 hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} disabled={busy}>
            {queue.some((item) => item.status === "done") ? en.close : en.cancel}
          </Button>
          <Button
            onClick={() => void startUpload()}
            disabled={busy || pendingCount === 0 || !categoryId}
          >
            <UploadCloud className="h-4 w-4" />
            {busy
              ? en.uploading
              : `${en.startUpload}${pendingCount ? ` (${pendingCount})` : ""}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
