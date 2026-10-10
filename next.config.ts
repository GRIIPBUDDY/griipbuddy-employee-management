import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["argon2", "sharp", "pdf-lib"],
  outputFileTracingExcludes: { "/*": ["./private/**/*", "./.local/**/*", "./.env", "./.env.*"] },
  outputFileTracingIncludes: { "/api/*": ["./src/lib/documents/pdf-worker.mjs"] },
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "32kb" } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
};
export default nextConfig;
