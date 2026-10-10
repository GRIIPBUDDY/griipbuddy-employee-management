// Shared by production startup and tests. Errors name settings, never their values.
export function validateRuntimeEnvironment(env: Record<string, string | undefined>) {
  const url = (value: string, name: string) => {
    try { return new URL(value); } catch { throw new Error(`${name} must be a valid URL.`); }
  };
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || env.AUTH_SECRET.startsWith("replace-")) throw new Error("AUTH_SECRET must contain at least 32 random characters.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const database = url(env.DATABASE_URL, "DATABASE_URL");
  if (!["postgresql:", "postgres:"].includes(database.protocol) || database.username !== "employee_runtime") throw new Error("DATABASE_URL must use the non-owner employee_runtime account.");
  const origin = url(env.APP_BASE_URL ?? "", "APP_BASE_URL");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("APP_BASE_URL must be a canonical origin without credentials, a path or query.");
  if (env.AUTH_URL && url(env.AUTH_URL, "AUTH_URL").href !== origin.href) throw new Error("AUTH_URL must match APP_BASE_URL.");
  const localHttp = origin.protocol === "http:" && env.ALLOW_LOCAL_HTTP === "true" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !localHttp) throw new Error("APP_BASE_URL must be HTTPS, or explicitly allowed loopback HTTP.");
  for (const name of ["MIGRATION_DATABASE_URL", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_NAME", "BOOTSTRAP_ADMIN_PASSWORD", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_APP_PASSWORD"]) {
    if (env[name]) throw new Error(`Do not inject ${name} into the application runtime.`);
  }
}
