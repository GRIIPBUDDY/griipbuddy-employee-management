import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { employeeProfile } from "@/features/people/data";
import { updateEmployee, deactivateEmployee } from "@/features/people/service";
type Context = { params: Promise<{ employeeId: string }> };
export async function GET(_: Request, context: Context) {
  try { return Response.json(await employeeProfile(await requestIdentity(), (await context.params).employeeId)); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const identity = await requestIdentity(true, true);
    await updateEmployee(identity, { ...await jsonBody(request), employeeId: (await context.params).employeeId });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const identity = await requestIdentity(true, true);
    await deactivateEmployee(identity, { ...await jsonBody(request), employeeId: (await context.params).employeeId });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
