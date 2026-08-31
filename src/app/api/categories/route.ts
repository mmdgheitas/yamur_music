import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, requireString, withErrorHandling } from "@/lib/http";
import { createCategory, listCategories, reorderCategories } from "@/server/categories-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/categories -> Array<Category> */
export const GET = withErrorHandling(async () => {
  await ensureBootstrap();
  return jsonOk(await listCategories());
});

/** POST /api/categories (Admin) -> Category */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = requireString(body.name, "name", 60);
  const category = await createCategory({
    name,
    description: typeof body.description === "string" ? body.description : null,
    accent: typeof body.accent === "string" ? body.accent : undefined,
  });
  return jsonOk(category, 201);
});

/** PUT /api/categories -> reorder tabs. Body: { categoryOrders: [{ id, order }] } */
export const PUT = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as {
    categoryOrders?: { id: string; order: number }[];
  };
  const orders = Array.isArray(body.categoryOrders) ? body.categoryOrders : [];
  return jsonOk(await reorderCategories(orders));
});
