import { ensureBootstrap } from "@/db/bootstrap";
import { getSessionUser, setSessionCookie, signToken } from "@/lib/auth";
import { jsonOk, unauthorized, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/refresh
 * Issues a fresh JWT (and HttpOnly cookie) for an already-valid session. The client
 * calls this when it gets a 401 mid-stream, then transparently retries the upload
 * with the new token — so an expiring session never breaks a large file transfer.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();

  // Reads the Bearer header OR the async HttpOnly cookie — the same code path the
  // upload route uses, so there is never an auth mismatch between the two.
  const user = await getSessionUser(request);
  if (!user) throw unauthorized("Session expired — please sign in again.");

  const token = await signToken(user);
  await setSessionCookie(token, request);

  return jsonOk({ token, user });
});
