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
  scheduleTimezone: string;
  updatedAt: Date;
}): SystemConfigDTO {
  return {
    allowGuestUpload: row.allowGuestUpload,
    cafeName: row.cafeName,
    scheduleTimezone: row.scheduleTimezone,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /api/config -> SystemConfig */
export const GET = withErrorHandling(async () => {
  await ensureBootstrap();
  return jsonOk(serialize(await getSystemConfig()));
});

/** PATCH /api/config (Admin) -> Body: { allowGuestUpload, cafeName?, scheduleTimezone? } */
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
  if (typeof body.scheduleTimezone === "string" && body.scheduleTimezone.trim()) {
    const timezone = body.scheduleTimezone.trim().slice(0, 64);
    if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(timezone)) {
      throw badRequest(
        'scheduleTimezone must be "LOCAL" or a valid IANA timezone name (e.g. Asia/Tehran)',
      );
    }
    patch.scheduleTimezone = timezone;
  }
  if (Object.keys(patch).length === 1) {
    throw badRequest(
      "Provide allowGuestUpload (boolean), cafeName (string) and/or scheduleTimezone (string)",
    );
  }

  await getSystemConfig();
  const [row] = await db
    .update(systemConfig)
    .set(patch)
    .where(eq(systemConfig.id, 1))
    .returning();

  return jsonOk(serialize(row));
});
