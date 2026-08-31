import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, scheduleEntries, type ScheduleEntryRow } from "@/db/schema";
import { badRequest, notFound } from "@/lib/http";
import type { ScheduleEntryDTO } from "@/lib/types";

/** 24-hour "HH:MM" — the only accepted schedule time format. */
export function isValidScheduleTime(time: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

export function serializeSchedule(
  row: ScheduleEntryRow,
  categoryName: string,
): ScheduleEntryDTO {
  return {
    id: row.id,
    label: row.label,
    time: row.time,
    categoryId: row.categoryId,
    categoryName,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertCategoryExists(categoryId: string): Promise<string> {
  if (!UUID_RE.test(categoryId)) throw notFound("Target playlist does not exist");
  const [row] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!row) throw notFound("Target playlist does not exist");
  return row.name;
}

export async function listScheduleEntries(): Promise<ScheduleEntryDTO[]> {
  const rows = await db
    .select({ entry: scheduleEntries, categoryName: categories.name })
    .from(scheduleEntries)
    .leftJoin(categories, eq(categories.id, scheduleEntries.categoryId))
    .orderBy(asc(scheduleEntries.time), asc(scheduleEntries.createdAt));
  return rows.map((row) => serializeSchedule(row.entry, row.categoryName ?? ""));
}

export async function createScheduleEntry(input: {
  label?: string | null;
  time: string;
  categoryId: string;
  enabled?: boolean;
}): Promise<ScheduleEntryDTO> {
  if (!isValidScheduleTime(input.time)) {
    throw badRequest('Schedule time must be in 24-hour "HH:MM" format');
  }
  const categoryName = await assertCategoryExists(input.categoryId);

  const [row] = await db
    .insert(scheduleEntries)
    .values({
      label: input.label?.trim().slice(0, 80) ?? "",
      time: input.time.trim(),
      categoryId: input.categoryId,
      enabled: input.enabled ?? true,
    })
    .returning();

  return serializeSchedule(row, categoryName);
}

export async function updateScheduleEntry(
  id: string,
  patch: {
    label?: string | null;
    time?: string;
    categoryId?: string;
    enabled?: boolean;
  },
): Promise<ScheduleEntryDTO> {
  const [current] = await db
    .select()
    .from(scheduleEntries)
    .where(eq(scheduleEntries.id, id))
    .limit(1);
  if (!current) throw notFound("Schedule entry not found");

  const values: Partial<typeof scheduleEntries.$inferInsert> = {};
  if (patch.time !== undefined) {
    if (!isValidScheduleTime(patch.time)) {
      throw badRequest('Schedule time must be in 24-hour "HH:MM" format');
    }
    values.time = patch.time.trim();
  }
  if (patch.label !== undefined) values.label = patch.label?.trim().slice(0, 80) ?? "";
  if (patch.categoryId !== undefined) {
    await assertCategoryExists(patch.categoryId);
    values.categoryId = patch.categoryId;
  }
  if (patch.enabled !== undefined) values.enabled = patch.enabled;

  if (Object.keys(values).length === 0) {
    return serializeSchedule(current, (await assertCategoryExists(current.categoryId)) || "");
  }

  const [row] = await db
    .update(scheduleEntries)
    .set(values)
    .where(eq(scheduleEntries.id, id))
    .returning();
  const categoryName = await assertCategoryExists(row.categoryId);
  return serializeSchedule(row, categoryName);
}

export async function deleteScheduleEntry(id: string): Promise<{ success: true; id: string }> {
  const [existing] = await db
    .select({ id: scheduleEntries.id })
    .from(scheduleEntries)
    .where(eq(scheduleEntries.id, id))
    .limit(1);
  if (!existing) throw notFound("Schedule entry not found");
  await db.delete(scheduleEntries).where(eq(scheduleEntries.id, id));
  return { success: true, id };
}
