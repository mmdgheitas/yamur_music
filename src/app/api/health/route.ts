import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureBootstrap } from "@/db/bootstrap";
import { config } from "@/lib/config";
import { ensureUploadDirs } from "@/lib/storage";
import { libraryStats } from "@/server/songs-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureBootstrap();
    ensureUploadDirs();
    const stats = await libraryStats();
    return Response.json({
      ok: true,
      service: "autonomous-cafe-audio",
      database: "connected",
      storage: config.uploadRoot,
      telegram: config.telegram.token ? "configured" : "disabled",
      library: stats,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] failure:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
