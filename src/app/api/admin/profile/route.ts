import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureBootstrap } from "@/db/bootstrap";
import {
  hashPassword,
  requireAdmin,
  setSessionCookie,
  signToken,
  verifyPassword,
} from "@/lib/auth";
import { badRequest, conflict, forbidden, jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileBody = {
  username?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
};

/** GET /api/admin/profile — confirms the current admin session. */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const user = await requireAdmin(request);
  return jsonOk({ user });
});

/**
 * PATCH /api/admin/profile
 * Body: { username?, currentPassword, newPassword? }
 *
 * Every credential change requires the existing password. After the DB update a fresh
 * token is returned and installed as the HttpOnly cookie so neither a username nor a
 * password change invalidates subsequent admin requests.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const session = await requireAdmin(request); // auth happens before reading the body
  const body = (await request.json().catch(() => ({}))) as ProfileBody;

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) throw badRequest("Current password is required");

  const [account] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!account || !(await verifyPassword(currentPassword, account.password))) {
    throw forbidden("Current password is incorrect");
  }

  const nextUsername =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : account.username;
  if (!/^[a-z0-9._-]{3,40}$/.test(nextUsername)) {
    throw badRequest(
      "Username must be 3–40 characters and use only letters, numbers, dot, dash or underscore",
    );
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword && newPassword.length < 8) {
    throw badRequest("New password must be at least 8 characters");
  }
  if (newPassword.length > 200) throw badRequest("New password is too long");

  if (nextUsername === account.username && !newPassword) {
    throw badRequest("Enter a new username and/or a new password");
  }

  if (nextUsername !== account.username) {
    const [duplicate] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, nextUsername), ne(users.id, account.id)))
      .limit(1);
    if (duplicate) throw conflict("That username is already in use");
  }

  const [updated] = await db
    .update(users)
    .set({
      username: nextUsername,
      ...(newPassword ? { password: await hashPassword(newPassword) } : {}),
    })
    .where(eq(users.id, account.id))
    .returning({ id: users.id, username: users.username, role: users.role });

  const user = { id: updated.id, username: updated.username, role: updated.role };
  const token = await signToken(user);
  await setSessionCookie(token, request);

  return jsonOk({ success: true, token, user });
});
