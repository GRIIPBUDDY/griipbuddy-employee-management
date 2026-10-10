import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { employeeTimeline, createWorkRecord } from "@/features/people/timeline";
type Context = { params: Promise<{ employeeId: string }> };
export async function GET(_: Request, context: Context) {
  try { return Response.json(await employeeTimeline(await requestIdentity(), (await context.params).employeeId)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true); return Response.json({ id: await createWorkRecord(identity, { ...await jsonBody(request), employeeId: (await context.params).employeeId }) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
