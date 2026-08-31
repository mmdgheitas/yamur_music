import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, songs, type CategoryRow } from "@/db/schema";
import type { CategoryDTO } from "@/lib/types";
import { badRequest, conflict, notFound, slugify } from "@/lib/http";
import { deleteStoredFile } from "@/lib/storage";

const ACCENTS = ["amber", "emerald", "violet", "sky", "rose", "teal"] as const;

export function serializeCategory(
  row: CategoryRow,
  songCount = 0,
  totalDuration = 0,
): CategoryDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    accent: row.accent,
    order: row.order,
    songCount,
    totalDuration,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const rows = await db
    .select({
      category: categories,
      songCount: sql<number>`cast(count(${songs.id}) as int)`,
      totalDuration: sql<number>`cast(coalesce(sum(${songs.duration}), 0) as int)`,
    })
    .from(categories)
    .leftJoin(songs, eq(songs.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.order), asc(categories.name));

  return rows.map((row) =>
    serializeCategory(row.category, row.songCount, row.totalDuration),
  );
}

export async function getCategoryById(id: string): Promise<CategoryRow> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!row) throw notFound("Category not found");
  return row;
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let candidate = slugify(base);
  let attempt = 1;
  // Loop until we find a free slug (bounded by attempts to avoid infinite loops).
  while (attempt < 50) {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);
    if (!existing || existing.id === ignoreId) return candidate;
    attempt += 1;
    candidate = `${slugify(base)}-${attempt}`;
  }
  throw conflict("Could not generate a unique category slug");
}

export async function createCategory(input: {
  name: string;
  description?: string | null;
  accent?: string;
}): Promise<CategoryDTO> {
  const name = input.name.trim();
  if (!name) throw badRequest("Category name is required");

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`cast(coalesce(max(${categories.order}), -1) as int)` })
    .from(categories);

  const accent =
    input.accent && (ACCENTS as readonly string[]).includes(input.accent)
      ? input.accent
      : ACCENTS[(maxOrder + 1) % ACCENTS.length];

  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug: await uniqueSlug(name),
      description: input.description?.trim() || null,
      accent,
      order: maxOrder + 1,
    })
    .returning();

  return serializeCategory(row, 0, 0);
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null; accent?: string; order?: number },
): Promise<CategoryDTO> {
  const current = await getCategoryById(id);
  const patch: Partial<typeof categories.$inferInsert> = {};

  if (typeof input.name === "string" && input.name.trim()) {
    patch.name = input.name.trim();
    if (patch.name !== current.name) {
      patch.slug = await uniqueSlug(patch.name, id);
    }
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.accent && (ACCENTS as readonly string[]).includes(input.accent)) {
    patch.accent = input.accent;
  }
  if (typeof input.order === "number" && Number.isFinite(input.order)) {
    patch.order = Math.max(0, Math.trunc(input.order));
  }

  if (Object.keys(patch).length === 0) {
    return serializeCategory(current);
  }

  const [row] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, id))
    .returning();
  return serializeCategory(row);
}

export async function deleteCategory(id: string): Promise<{ deletedSongs: number }> {
  await getCategoryById(id);
  const files = await db
    .select({ filePath: songs.filePath })
    .from(songs)
    .where(eq(songs.categoryId, id));

  await db.delete(categories).where(eq(categories.id, id)); // cascades songs
  await Promise.all(files.map((file) => deleteStoredFile(file.filePath)));

  return { deletedSongs: files.length };
}

export async function reorderCategories(
  orders: { id: string; order: number }[],
): Promise<CategoryDTO[]> {
  await db.transaction(async (tx) => {
    for (const item of orders) {
      await tx
        .update(categories)
        .set({ order: Math.max(0, Math.trunc(item.order)) })
        .where(eq(categories.id, item.id));
    }
  });
  return listCategories();
}

export { ACCENTS };
