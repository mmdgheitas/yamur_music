import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { ensureBootstrap, getSystemConfig } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { badRequest, jsonOk, withErrorHandling } from "@/lib/http";
import type { SystemConfigDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(row: {
  allowGuestUpload: boolean;
  cafeName: string;
  updatedAt: Date;
}): SystemConfigDTO {
  return {
    allowGuestUpload: row.allowGuestUpload,
    cafeName: row.cafeName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /api/config -> SystemConfig */
export const GET = withErrorHandling(async () => {
  await ensureBootstrap();
  return jsonOk(serialize(await getSystemConfig()));
});

/** PATCH /api/config (Admin) -> Body: { allowGuestUpload: boolean, cafeName?: string } */
export const PATCH = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Partial<typeof systemConfig.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.allowGuestUpload === "boolean") {
    patch.allowGuestUpload = body.allowGuestUpload;
  }
  if (typeof body.cafeName === "string" && body.cafeName.trim()) {
    patch.cafeName = body.cafeName.trim().slice(0, 60);
  }
  if (Object.keys(patch).length === 1) {
    throw badRequest("Provide allowGuestUpload (boolean) and/or cafeName (string)");
  }

  await getSystemConfig();
  const [row] = await db
    .update(systemConfig)
    .set(patch)
    .where(eq(systemConfig.id, 1))
    .returning();

  return jsonOk(serialize(row));
});
