import { apiError, requestIdentity, boundedBody } from "@/lib/http";
import { uploadIncidentEvidence } from "@/features/people-operations/incidents";
import { MAX_MULTIPART_BYTES } from "@/lib/documents/files";
import { AppError } from "@/lib/utils/errors";
type Context = { params: Promise<{ id: string }> };
let bodies = 0;
// Private evidence upload for an incident record (staff only); the file is stored like any private employee document.
export async function POST(request: Request, context: Context) {
  let acquired = false;
  try {
    const identity = await requestIdentity(true, true);
    if (bodies >= 2) throw new AppError(429, "UPLOAD_BUSY", "Document processing is busy. Please retry shortly.");
    bodies++; acquired = true;
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data;")) throw new AppError(400, "VALIDATION", "Send a multipart file upload.");
    const bytes = await boundedBody(request, MAX_MULTIPART_BYTES);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } }).formData(); }
    catch { throw new AppError(400, "VALIDATION", "Upload data is invalid."); }
    for (const key of form.keys()) if (!["file", "displayName", "revision"].includes(key) || form.getAll(key).length !== 1) throw new AppError(400, "VALIDATION", "Upload fields are invalid.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "VALIDATION", "Choose a file.");
    const id = await uploadIncidentEvidence(identity, (await context.params).id, form.get("revision"), form.get("displayName"), file);
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
  finally { if (acquired) bodies--; }
}
