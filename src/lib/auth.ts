import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { config } from "@/lib/config";
import { forbidden, unauthorized } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";

export { hashPassword, verifyPassword };

export type Role = "ADMIN" | "GUEST";

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
};

const secretKey = new TextEncoder().encode(config.jwtSecret);

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(config.jwtIssuer)
    .setAudience("cafe-web")
    .setIssuedAt()
    .setExpirationTime(`${config.sessionMaxAgeSeconds}s`)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: config.jwtIssuer,
      audience: "cafe-web",
      algorithms: ["HS256"],
      // Small tolerance handles clocks on self-hosted VPS machines that differ slightly.
      clockTolerance: 15,
    });
    if (!payload.sub || typeof payload.username !== "string") return null;
    const role: Role = payload.role === "ADMIN" ? "ADMIN" : "GUEST";
    return { id: payload.sub, username: payload.username, role };
  } catch {
    return null;
  }
}

function bearerToken(request?: Request): string | null {
  const header = request?.headers.get("authorization")?.trim();
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

/**
 * Reads and verifies auth from BOTH supported transports.
 *
 * Important: an invalid/stale Bearer token must NOT mask a valid HttpOnly cookie.
 * Older code selected the Bearer string first and returned 401 immediately if it was
 * stale; because localStorage survives deployments, that broke every admin action even
 * while the browser held a valid cookie. We now verify Bearer and cookie independently.
 *
 * Next.js 16's `cookies()` helper is asynchronous, so it is always awaited here.
 */
export async function getSessionUser(request?: Request): Promise<SessionUser | null> {
  const store = await cookies();
  const candidates = [bearerToken(request), store.get(config.cookieName)?.value].filter(
    (value): value is string => Boolean(value),
  );

  let session: SessionUser | null = null;
  for (const token of new Set(candidates)) {
    session = await verifyToken(token);
    if (session) break;
  }
  if (!session) return null;

  // Ensure the account still exists and pick up username/role changes immediately.
  const [row] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role };
}

export async function requireUser(request?: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw unauthorized("Authentication required. Please sign in again.");
  return user;
}

export async function requireAdmin(request?: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") throw forbidden("Admin privileges are required");
  return user;
}

/**
 * HTTPS incl. cross-site preview iframe -> SameSite=None + Secure.
 * Plain HTTP local/intranet VPS          -> SameSite=Lax (Secure cookies are invalid).
 * Path=/ guarantees the cookie is sent to every `/api/*` route.
 */
function cookieFlags(request?: Request): { sameSite: "none" | "lax"; secure: boolean } {
  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProto = request ? new URL(request.url).protocol.replace(":", "") : "";
  const isHttps = (forwardedProto || requestProto) === "https";
  return isHttps ? { sameSite: "none", secure: true } : { sameSite: "lax", secure: false };
}

export async function setSessionCookie(token: string, request?: Request): Promise<void> {
  const store = await cookies();
  const { sameSite, secure } = cookieFlags(request);
  store.set({
    name: config.cookieName,
    value: token,
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: config.sessionMaxAgeSeconds,
    expires: new Date(Date.now() + config.sessionMaxAgeSeconds * 1000),
    priority: "high",
  });
}

export async function clearSessionCookie(request?: Request): Promise<void> {
  const store = await cookies();
  const { sameSite, secure } = cookieFlags(request);
  store.set({
    name: config.cookieName,
    value: "",
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    priority: "high",
  });
}
