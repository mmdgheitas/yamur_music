import { clearSessionCookie } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (request: Request) => {
  await clearSessionCookie(request);
  return jsonOk({ success: true });
});
