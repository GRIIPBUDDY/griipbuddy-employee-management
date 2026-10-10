import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { validateRuntimeEnvironment } from "@/lib/validation/runtime-environment";
const valid = { AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters", DATABASE_URL: "postgresql://employee_runtime:synthetic@employee-db/app", APP_BASE_URL: "https://hr.example.test", AUTH_URL: "https://hr.example.test" };
describe("production runtime configuration", () => {
  it("accepts canonical HTTPS and the dedicated runtime role", () => expect(() => validateRuntimeEnvironment(valid)).not.toThrow());
  it("accepts only explicitly permitted loopback HTTP", () => {
    expect(() => validateRuntimeEnvironment({...valid, APP_BASE_URL:"http://localhost:3100", AUTH_URL:"http://localhost:3100", ALLOW_LOCAL_HTTP:"true"})).not.toThrow();
    for (const url of ["http://hr.example.test", "ftp://localhost", "file://localhost", "http://localhost"]) expect(() => validateRuntimeEnvironment({...valid, APP_BASE_URL:url, AUTH_URL:url, ALLOW_LOCAL_HTTP:url==="http://localhost"?"false":"true"})).toThrow();
  });
  it("rejects owner, superuser and unrelated database URLs", () => {
    for (const url of ["postgresql://employee_owner:synthetic@db/app", "postgresql://postgres:synthetic@db/app", "https://employee_runtime:synthetic@db/app"]) expect(() => validateRuntimeEnvironment({...valid,DATABASE_URL:url})).toThrow();
  });
  it("rejects owner/bootstrap environment even when the runtime URL is safe", () => {
    for (const name of ["MIGRATION_DATABASE_URL", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_NAME", "BOOTSTRAP_ADMIN_PASSWORD", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_APP_PASSWORD"]) expect(() => validateRuntimeEnvironment({...valid,[name]:"synthetic-sensitive-value"})).toThrow(new RegExp(name));
  });
  it("rejects mismatched auth origins and decorated canonical URLs", () => {
    expect(() => validateRuntimeEnvironment({...valid,AUTH_URL:"https://other.example.test"})).toThrow();
    for (const url of ["https://user:password@hr.example.test", "https://hr.example.test/path", "https://hr.example.test?secret=synthetic", "https://hr.example.test#fragment"]) expect(() => validateRuntimeEnvironment({...valid,APP_BASE_URL:url,AUTH_URL:url})).toThrow();
  });
  it("does not disclose configuration secrets in validation errors", () => {
    try { validateRuntimeEnvironment({...valid,BOOTSTRAP_ADMIN_PASSWORD:"synthetic-sensitive-value"}); throw new Error("Expected rejection"); } catch (error) { expect(String(error)).not.toContain("synthetic-sensitive-value"); }
    for (const secret of ["", "short", "replace-"+"x".repeat(40)]) expect(() => validateRuntimeEnvironment({...valid,AUTH_SECRET:secret})).toThrow();
  });
  it("terminates the production startup hook on invalid configuration without retrying or leaking values", () => {
    const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e","await import('./src/instrumentation.ts').then(m=>m.register());process.stdout.write('unexpected-running');"],{
      encoding:"utf8",timeout:10000,env:{...process.env,...valid,NEXT_RUNTIME:"nodejs",NODE_ENV:"production",POSTGRES_PASSWORD:"synthetic-private-owner-value"},
    });
    expect(result.status).toBe(1);expect(result.stdout).toBe("");
    expect(result.stderr).toContain("runtime_configuration_invalid");expect(result.stderr).toContain("POSTGRES_PASSWORD");
    expect(result.stderr).not.toContain("synthetic-private-owner-value");
  });
});
