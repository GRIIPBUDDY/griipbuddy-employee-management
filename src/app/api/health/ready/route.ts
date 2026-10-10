import { db } from "@/lib/db/client";
import { assertStorageReady } from "@/lib/documents/files";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const settings = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { id: true } });
    await assertStorageReady();
    return Response.json({ status: settings ? "ready" : "initialization_required" }, { status: settings ? 200 : 503 });
  } catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
}
