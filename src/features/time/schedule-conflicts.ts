const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export function isScheduleConflict(error: unknown): boolean {
 if (!object(error)) return false;
 if (["P2002", "P2004"].includes(String(error.code))) return true;
 if (error.code !== "P2039" || !object(error.meta)) return false;
 const adapter = error.meta.driverAdapterError;
 if (!object(adapter) || !object(adapter.cause)) return false;
 // Prisma 7 reports an otherwise-unmapped PostgreSQL exclusion violation as P2039.
 return adapter.cause.originalCode === "23P01" && typeof adapter.cause.originalMessage === "string" && adapter.cause.originalMessage.includes('"schedules_no_overlap"');
}
