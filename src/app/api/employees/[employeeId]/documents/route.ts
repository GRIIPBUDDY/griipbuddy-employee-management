import { apiError, requestIdentity, boundedBody } from "@/lib/http";
import { listDocuments, uploadDocument } from "@/features/people/documents";
import { MAX_MULTIPART_BYTES } from "@/lib/documents/files";
import { AppError } from "@/lib/utils/errors";
type Context = { params: Promise<{ employeeId: string }> };
let bodies = 0;
export async function GET(_: Request, context: Context) {
  try { return Response.json(await listDocuments(await requestIdentity(), (await context.params).employeeId)); }
  catch (error) { return apiError(error); }
}
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
    const keys = new Set(["file", "type", "displayName", "issuedOn", "expiresOn", "employeeVisible", "profilePhoto", "employmentPeriodId"]);
    for (const key of form.keys()) if (!keys.has(key) || form.getAll(key).length !== 1) throw new AppError(400, "VALIDATION", "Upload fields are invalid.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "VALIDATION", "Choose a file.");
    const id = await uploadDocument(identity, { employeeId: (await context.params).employeeId, type: form.get("type"), displayName: form.get("displayName"),
      issuedOn: form.get("issuedOn") ?? "", expiresOn: form.get("expiresOn") ?? "", employmentPeriodId: form.get("employmentPeriodId") ?? "",
      employeeVisible: form.get("employeeVisible") === "on", profilePhoto: form.get("profilePhoto") === "on" }, file);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return apiError(error); }
  finally { if (acquired) bodies--; }
}
