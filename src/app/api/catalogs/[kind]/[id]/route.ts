import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { updateCatalog } from "@/features/organization/catalogs";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function PATCH(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true); const { kind, id } = await context.params;
    await updateCatalog(identity, kind, { ...await jsonBody(request), id }); return Response.json({ success: true }); }
  catch (error) { return apiError(error); }
}
