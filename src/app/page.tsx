import { CafeApp } from "@/components/cafe-app";
import { ensureBootstrap, getSystemConfig } from "@/db/bootstrap";
import { getSessionUser } from "@/lib/auth";
import { ensureUploadDirs } from "@/lib/storage";
import { listCategories } from "@/server/categories-service";
import { listSongs } from "@/server/songs-service";
import type { SessionUserDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureBootstrap();
  ensureUploadDirs();

  const [categories, config, session] = await Promise.all([
    listCategories(),
    getSystemConfig(),
    getSessionUser(),
  ]);

  const activeCategoryId = categories[0]?.id ?? "";
  const songs = activeCategoryId ? await listSongs(activeCategoryId) : [];

  const user: SessionUserDTO | null = session
    ? { id: session.id, username: session.username, role: session.role }
    : null;

  return (
    <CafeApp
      initialUser={user}
      initialCategories={categories}
      initialCategoryId={activeCategoryId}
      initialSongs={songs}
      initialConfig={{
        allowGuestUpload: config.allowGuestUpload,
        cafeName: config.cafeName,
        scheduleTimezone: config.scheduleTimezone,
        updatedAt: config.updatedAt.toISOString(),
      }}
    />
  );
}
