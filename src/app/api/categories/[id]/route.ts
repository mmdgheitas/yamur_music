import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { deleteCategory, updateCategory } from "@/server/categories-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/categories/:id (Admin) */
export const PATCH = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const category = await updateCategory(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    accent: typeof body.accent === "string" ? body.accent : undefined,
    order: typeof body.order === "number" ? body.order : undefined,
  });
  return jsonOk(category);
});

/** DELETE /api/categories/:id (Admin) — cascades songs + purges local files */
export const DELETE = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  const result = await deleteCategory(id);
  return jsonOk({ success: true, ...result });
});
