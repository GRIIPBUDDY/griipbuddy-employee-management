import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { listCatalog, createCatalog } from "@/features/organization/catalogs";
type Context = { params: Promise<{ kind: string }> };
export async function GET(_: Request, context: Context) {
  try { const identity = await requestIdentity(false, true); return Response.json(await listCatalog(identity, (await context.params).kind)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { const identity = await requestIdentity(true, true); return Response.json({ id: await createCatalog(identity, (await context.params).kind, await jsonBody(request)) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
