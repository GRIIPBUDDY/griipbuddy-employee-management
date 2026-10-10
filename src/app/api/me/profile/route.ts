import { apiError, requestIdentity, jsonBody } from "@/lib/http";
import { ownProfile } from "@/features/people/data";
import { updateOwnContact } from "@/features/people/service";
export async function GET() {
  try { return Response.json(await ownProfile(await requestIdentity())); } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try { const identity = await requestIdentity(true); await updateOwnContact(identity, await jsonBody(request)); return Response.json({ success: true }); }
  catch (error) { return apiError(error); }
}
