export class AppError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503, public readonly code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}
export function logUnexpected(event: string) {
  // Deliberately exclude exception objects, request bodies, URLs and SQL parameters.
  console.error(JSON.stringify({ level: "error", event, time: new Date().toISOString() }));
}
export function safeMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  logUnexpected("operation_failed");
  return "Something went wrong. Please try again.";
}
