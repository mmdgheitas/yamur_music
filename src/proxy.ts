import { NextResponse, type NextRequest } from "next/server";

/**
 * Authentication is intentionally NOT decided in the Edge proxy.
 *
 * Why:
 *  - Node route handlers are the single source of truth and verify the signed JWT,
 *    current DB user and role via `requireUser` / `requireAdmin`.
 *  - A proxy cookie-presence check can reject a valid Bearer-authenticated request,
 *    or vice versa, causing global false 401s in iframe/proxy deployments.
 *  - Upload bodies must never be parsed, cloned or transformed here. Doing so forces
 *    buffering and can drop auth headers or cause large requests to time out.
 *
 * `NextResponse.next()` preserves Authorization, Cookie, Content-Type and the streaming
 * body exactly as received. Each protected API route performs full auth before reading
 * its payload.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
