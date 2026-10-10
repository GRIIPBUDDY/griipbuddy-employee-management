import { validateRuntimeEnvironment } from "@/lib/validation/runtime-environment";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    try { validateRuntimeEnvironment(process.env); }
    catch (error) {
      // Next can retry a rejected instrumentation hook while keeping its server alive.
      // Configuration diagnostics contain setting names only, never secret values.
      console.error(JSON.stringify({ level: "error", event: "runtime_configuration_invalid", reason: error instanceof Error ? error.message : "Invalid runtime configuration." }));
      process.exit(1);
    }
  }
}
export function onRequestError() {
  console.error(JSON.stringify({ level: "error", event: "request_failed", time: new Date().toISOString() }));
}
