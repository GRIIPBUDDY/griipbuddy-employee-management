import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { employeeSchedule } from "@/features/time/data";
import { publishSchedule } from "@/features/time/schedules";
import { AppError } from "@/lib/utils/errors";
type Context = { params: Promise<{ employeeId: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await employeeSchedule(await requestIdentity(false, true), (await context.params).employeeId, Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const identity = await requestIdentity(true, true), body = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError(400, "VALIDATION", "Send a schedule object.");
    if ("employeeId" in body) throw new AppError(400, "VALIDATION", "Employee is selected by the authorized path.");
    const id = await publishSchedule(identity, { ...body, employeeId: (await context.params).employeeId });
    return Response.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
}
