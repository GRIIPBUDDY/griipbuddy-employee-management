import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { correctWorkRecord, deleteWorkRecord } from "@/features/people/timeline";
type Context = { params: Promise<{ employeeId: string; recordId: string }> };
export async function PATCH(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true); await correctWorkRecord(identity, { ...await jsonBody(request), ...await context.params }); return Response.json({ success: true }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true); await deleteWorkRecord(identity, { ...await jsonBody(request), ...await context.params }); return Response.json({ success: true }); }
  catch (error) { return apiError(error); }
}
