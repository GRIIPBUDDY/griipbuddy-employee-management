import { apiError, requestIdentity } from "@/lib/http";
import { ownTimeline } from "@/features/people/timeline";
export async function GET() {
  try { return Response.json(await ownTimeline(await requestIdentity())); } catch (error) { return apiError(error); }
}
