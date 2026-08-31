import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureBootstrap } from "@/db/bootstrap";
import {
  clearSessionCookie,
  getSessionUser,
  setSessionCookie,
  signToken,
  verifyPassword,
} from "@/lib/auth";
import { jsonOk, requireString, unauthorized, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = requireString(body.username, "username", 60).toLowerCase();
  const password = requireString(body.password, "password", 200);

  const [row] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.username})`, username))
    .limit(1);

  if (!row || !(await verifyPassword(password, row.password))) {
    throw unauthorized("Invalid username or password");
  }

  const user = { id: row.id, username: row.username, role: row.role };
  const token = await signToken(user);
  await setSessionCookie(token, request);

  return jsonOk({ token, user });
});

export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const user = await getSessionUser(request);
  return jsonOk({ user });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  await clearSessionCookie(request);
  return jsonOk({ success: true });
});
