import { apiError, requestIdentity } from "@/lib/http";
import { loadActor } from "@/lib/authorization/actor";
import { listDocuments } from "@/features/people/documents";
export async function GET() {
  try { const identity = await requestIdentity(), actor = await loadActor(identity); return Response.json(actor.employeeId ? await listDocuments(identity, actor.employeeId, true) : []); }
  catch (error) { return apiError(error); }
}
