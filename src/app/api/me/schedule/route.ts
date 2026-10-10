import { apiError, requestIdentity } from "@/lib/http";
import { ownSchedule } from "@/features/time/data";
export async function GET(request: Request) {
  try { return Response.json(await ownSchedule(await requestIdentity(), Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
