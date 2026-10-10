import { apiError, requestIdentity } from "@/lib/http";
import { ownAttendanceDetail } from "@/features/time/data";
export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  try { return Response.json(await ownAttendanceDetail(await requestIdentity(), (await context.params).sessionId)); }
  catch (error) { return apiError(error); }
}
