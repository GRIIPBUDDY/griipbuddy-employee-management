import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { checkOut } from "@/features/time/attendance";
export async function POST(request: Request) {
  try {
    const identity = await requestIdentity(true), result = await checkOut(identity, await jsonBody(request));
    return Response.json(result, { status: 200 });
  } catch (error) { return apiError(error); }
}
