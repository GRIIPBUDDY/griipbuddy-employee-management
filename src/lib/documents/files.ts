import "server-only";
import sharp from "sharp";
import { Worker } from "node:worker_threads";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, open, link, unlink, lstat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";
import { AppError } from "@/lib/utils/errors";

export const MAX_FILE_BYTES = 10485760;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 65536;
let transfers = 0;
export async function withDocumentSlot<T>(operation: () => Promise<T>) {
  if (transfers >= 2) throw new AppError(429, "UPLOAD_BUSY", "Document processing is busy. Please retry shortly.");
  transfers++;
  try { return await operation(); } finally { transfers--; }
}
async function validPdf(bytes: Buffer) {
  return new Promise<boolean>((resolveResult) => {
    // Run the copied Node worker directly; framework worker bundling changes its data envelope.
    const worker = new Worker(/* turbopackIgnore: true */ resolve(/* turbopackIgnore: true */ process.cwd(), "src/lib/documents/pdf-worker.mjs"), { workerData: bytes, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 } });
    // Third-party parser diagnostics can include document bytes; never forward them to logs.
    worker.stdout.resume(); worker.stderr.resume();
    let finished = false;
    const finish = (value: boolean) => { if (finished) return; finished = true; clearTimeout(timer); void worker.terminate(); resolveResult(value); };
    const timer = setTimeout(() => finish(false), 8000);
    worker.once("message", value => finish(value === true));
    worker.once("error", () => finish(false));
    worker.once("exit", () => finish(false));
  });
}
export async function validateFile(file: File) {
  if (!file || file.size < 1 || file.size > MAX_FILE_BYTES) throw new AppError(400, "FILE_SIZE", "Choose a file between 1 byte and 10 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  let normalized: Buffer;
  let mimeType: string;
  try {
    if (extension === "pdf" && file.type === "application/pdf") {
      if (!/^%PDF-[12]\.\d[\r\n]/.test(bytes.subarray(0, 16).toString("ascii")) || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("ascii")) || /<script|<!doctype\s+html|<html\b/i.test(bytes.toString("latin1")) || !await validPdf(bytes)) throw new Error("Invalid PDF");
      normalized = bytes; mimeType = "application/pdf";
    } else if ((extension === "jpg" || extension === "jpeg") && file.type === "image/jpeg" || extension === "png" && file.type === "image/png") {
      const expected = extension === "png" ? "png" : "jpeg";
      const image = sharp(bytes, { limitInputPixels: 16000000, limitInputChannels: 4, failOn: "warning" });
      const meta = await image.metadata();
      if (meta.format !== expected || !meta.width || !meta.height || meta.width > 8000 || meta.height > 8000 || (meta.pages ?? 1) !== 1) throw new Error("Invalid image");
      const oriented = image.rotate();
      normalized = await (expected === "png" ? oriented.png() : oriented.jpeg({ quality: 90 })).toBuffer();
      mimeType = expected === "png" ? "image/png" : "image/jpeg";
    } else throw new Error("Unsupported format");
    if (normalized.length > MAX_FILE_BYTES) throw new Error("Normalized file too large");
  } catch { throw new AppError(400, "FILE_TYPE", "Upload a valid PDF, JPEG or PNG. Active/encrypted PDFs and oversized images are not supported."); }
  return { bytes: normalized, mimeType, fileSize: normalized.length, sha256: createHash("sha256").update(normalized).digest("hex") };
}
export function storageRoot() {
  // Runtime bytes must never become part of Next.js output-file tracing.
  const root = resolve(/* turbopackIgnore: true */ process.env.PRIVATE_DOCUMENTS_DIR ?? ".local/private/documents");
  for (const folder of ["public", "src", ".next"]) {
    const unsafe = resolve(/* turbopackIgnore: true */ folder);
    if (root === unsafe || root.startsWith(unsafe + "/")) throw new Error("Unsafe private storage configuration");
  }
  return root;
}
export async function assertStorageReady() {
  const root = storageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Private storage must not be a symlink");
  await access(root, constants.R_OK | constants.W_OK);
}
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/;
function filePath(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid private storage key");
  return join(/* turbopackIgnore: true */ storageRoot(), key);
}
export async function writePrivateFile(bytes: Buffer) {
  const root = storageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Private storage must not be a symlink");
  const key = `${randomUUID()}.bin`, temporary = join(root, `${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(bytes); await file.sync();
  } finally { await file.close(); }
  // Atomic publication without overwriting any prior key; bytes are durable before metadata.
  await link(temporary, filePath(key));
  await unlink(temporary);
  const directory = await open(/* turbopackIgnore: true */ root, "r");
  try { await directory.sync(); } finally { await directory.close(); }
  return key;
}
export async function openPrivateFile(key: string, size: number) {
  const file = await open(/* turbopackIgnore: true */ filePath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== size || stat.size > MAX_FILE_BYTES) throw new Error("Private file integrity check failed");
    return file;
  } catch (error) { await file.close(); throw error; }
}
