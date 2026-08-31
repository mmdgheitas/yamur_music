import { ensureBootstrap } from "@/db/bootstrap";
import { getSessionUser } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const user = await getSessionUser(request);
  return jsonOk({ user });
});
