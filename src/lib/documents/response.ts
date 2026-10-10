import "server-only";
import { Readable } from "node:stream";
import { downloadDocument } from "@/features/people/documents";
import type { Identity } from "@/types/auth";
export async function privateDocumentResponse(request: Request, identity: Identity | null, employeeId: string, documentId: string, personal = false) {
  const document = await downloadDocument(identity, employeeId, documentId, personal);
  const extension = document.mimeType === "application/pdf" ? ".pdf" : document.mimeType === "image/png" ? ".png" : ".jpg";
  const name = document.displayName.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 150) + extension;
  const inline = new URL(request.url).searchParams.get("view") === "1" && document.mimeType !== "application/pdf";
  const headers = {
    "Content-Type": document.mimeType, "Content-Length": String(document.fileSize), "Cache-Control": "private, no-store",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="document${extension}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "X-Frame-Options": "DENY",
  };
  if (request.method === "HEAD") { await document.file.close(); return new Response(null, { headers }); }
  return new Response(Readable.toWeb(document.file.createReadStream({ autoClose: true })) as ReadableStream<Uint8Array>, { headers });
}
