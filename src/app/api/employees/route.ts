import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { searchEmployees } from "@/features/people/data";
import { createEmployee } from "@/features/people/service";
export async function GET(request: Request) {
  try { return Response.json(await searchEmployees(await requestIdentity(false, true), Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const identity = await requestIdentity(true, true); return Response.json({ id: await createEmployee(identity, await jsonBody(request)) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
