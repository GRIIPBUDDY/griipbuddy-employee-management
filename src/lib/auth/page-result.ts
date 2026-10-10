import "server-only";
import { redirect, notFound, forbidden } from "next/navigation";
import { AppError } from "@/lib/utils/errors";
export async function pageResult<T>(operation: Promise<T>): Promise<T> {
  try { return await operation; } catch (error) {
    if (error instanceof AppError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "PASSWORD_CHANGE_REQUIRED") redirect("/change-password");
      if (error.status === 404 || error.status === 400) notFound();
      if (error.status === 403) forbidden();
    }
    throw error;
  }
}
