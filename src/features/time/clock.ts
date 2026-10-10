import "server-only";
import type { Database } from "@/lib/db/audit";
// No browser timestamp, environment override or test API can change official time.
// Tests replace this module's function, never the production database clock.
export async function databaseNow(tx: Database): Promise<Date> {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT date_trunc('second', clock_timestamp()) AT TIME ZONE 'UTC' AS now`)[0].now;
}

// Pre-order eligibility audits have millisecond precision; keep their server instant equally precise.
export async function databaseOrderNow(tx: Database): Promise<Date> {
 return (await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`)[0].now;
}
