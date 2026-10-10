import { handlers } from "@/auth";
import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function canonicalRequest(request: NextRequest) {
  const canonical = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
  const origin = request.headers.get("origin");
  if (request.method === "POST" && origin !== canonical.origin) return null;
  const url = new URL(request.url);
  url.protocol = canonical.protocol; url.host = canonical.host;
  const headers = new Headers(request.headers);
  headers.set("host", canonical.host);
  headers.delete("x-forwarded-host"); headers.delete("x-forwarded-proto"); headers.delete("x-forwarded-port");
  return new NextRequest(url, { method: request.method, headers, body: request.body });
}
export async function GET(request: NextRequest) {
  return handlers.GET(canonicalRequest(request)!);
}
export async function POST(request: NextRequest) {
  const canonical = canonicalRequest(request);
  if (!canonical) return Response.json({ error: "Request origin is not permitted." }, { status: 403 });
  return handlers.POST(canonical);
}
