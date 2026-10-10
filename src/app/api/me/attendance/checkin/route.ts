import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { checkIn } from "@/features/time/attendance";
export async function POST(request: Request) {
  try {
    const identity = await requestIdentity(true), result = await checkIn(identity, await jsonBody(request));
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return apiError(error); }
}
