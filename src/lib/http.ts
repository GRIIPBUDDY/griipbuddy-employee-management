import "server-only";
import { AppError, safeMessage } from "@/lib/utils/errors";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";

export async function requestIdentity(mutation = false, staff = false) {
  if (mutation) await assertMutationOrigin();
  const identity = await getIdentity();
  await securityBoundary(identity, async actor => { if (staff) assertRole(actor, ["ADMIN", "HR_MANAGER"]); });
  return identity;
}
export function apiError(error: unknown) {
  return Response.json({ error: safeMessage(error) }, { status: error instanceof AppError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum) throw new AppError(400, "BODY_SIZE", "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "VALIDATION", "Request body is required.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) { await reader.cancel(); throw new AppError(400, "BODY_SIZE", "Request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}
export async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(400, "VALIDATION", "Send JSON form data.");
  try { return JSON.parse((await boundedBody(request, 32768)).toString("utf8")); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, "VALIDATION", "Request data is invalid."); }
}
