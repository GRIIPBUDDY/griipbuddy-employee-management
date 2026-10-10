import { apiError, requestIdentity } from "@/lib/http";
import { ownAttendance } from "@/features/time/data";
export async function GET(request: Request) {
  try { return Response.json(await ownAttendance(await requestIdentity(), Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
