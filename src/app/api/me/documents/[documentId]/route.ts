import { apiError, requestIdentity } from "@/lib/http";
import { loadActor } from "@/lib/authorization/actor";
import { AppError } from "@/lib/utils/errors";
import { privateDocumentResponse } from "@/lib/documents/response";
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const identity = await requestIdentity(), actor = await loadActor(identity);
    if (!actor.employeeId) throw new AppError(404, "NOT_FOUND", "Document not found.");
    return await privateDocumentResponse(request, identity, actor.employeeId, (await context.params).documentId, true);
  } catch (error) { return apiError(error); }
}
