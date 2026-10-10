import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { deleteDocument, updateDocumentVisibility } from "@/features/people/documents";
import { privateDocumentResponse } from "@/lib/documents/response";
type Context = { params: Promise<{ employeeId: string; documentId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { employeeId, documentId } = await context.params;
    return await privateDocumentResponse(request, await requestIdentity(), employeeId, documentId);
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const identity = await requestIdentity(true, true);
    await deleteDocument(identity, { ...await jsonBody(request), ...await context.params });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true);
    await updateDocumentVisibility(identity, { ...await jsonBody(request), ...await context.params });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
