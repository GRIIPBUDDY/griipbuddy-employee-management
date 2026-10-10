import { apiError, requestIdentity } from "@/lib/http";
import { attendanceHistory } from "@/features/time/data";

type Context = { params: Promise<{ employeeId: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await attendanceHistory(await requestIdentity(false, true), (await context.params).employeeId, Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}

