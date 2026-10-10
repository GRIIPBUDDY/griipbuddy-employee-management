import { parentPort, workerData } from "node:worker_threads";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
try {
  const pdf = await PDFDocument.load(workerData, { throwOnInvalidObject: true, updateMetadata: false });
  if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw new Error("Invalid PDF");
  const objects = pdf.context.enumerateIndirectObjects();
  if (objects.length > 50000) throw new Error("PDF too complex");
  const denied = new Set(["JavaScript", "JS", "OpenAction", "AA", "Launch", "EmbeddedFiles", "EmbeddedFile", "RichMedia", "XFA", "AcroForm", "SubmitForm", "ImportData", "GoToR", "URI"]);
  const visited = new Set();
  function inspect(object) {
    if (!object || visited.has(object)) return;
    visited.add(object);
    if (object instanceof PDFName && denied.has(object.decodeText())) throw new Error("Active PDF");
    if (object instanceof PDFDict) for (const [key, value] of object.entries()) { inspect(key); inspect(value); }
    else if (object.dict) inspect(object.dict);
    else if (typeof object.asArray === "function") for (const value of object.asArray()) inspect(value);
  }
  for (const [, object] of objects) inspect(object);
  parentPort.postMessage(true);
} catch { parentPort.postMessage(false); }
