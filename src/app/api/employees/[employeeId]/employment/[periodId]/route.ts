import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { updateEmployment } from "@/features/people/service";
export async function PATCH(request: Request, context: { params: Promise<{ employeeId: string; periodId: string }> }) {
  try { const identity = await requestIdentity(true, true); await updateEmployment(identity, { ...await jsonBody(request), ...await context.params }); return Response.json({ success: true }); }
  catch (error) { return apiError(error); }
}
