import "server-only";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect, notFound, forbidden } from "next/navigation";
import { securityBoundary } from "@/lib/authorization/actor";
import { AppError } from "@/lib/utils/errors";
export async function getIdentity() { return (await auth())?.identity ?? null; }
export async function pageActor(allowPasswordChange = false) {
  try { return await securityBoundary(await getIdentity(), async actor => actor, allowPasswordChange); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    if (error instanceof AppError && error.code === "PASSWORD_CHANGE_REQUIRED") redirect("/change-password");
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403) forbidden();
    throw error;
  }
}
export async function assertMutationOrigin() {
  const origin = (await headers()).get("origin");
  const canonical = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").origin;
  if (!origin || origin !== canonical) throw new AppError(403, "ORIGIN_DENIED", "Request origin is not permitted.");
}
