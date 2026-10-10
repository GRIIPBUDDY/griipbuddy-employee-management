import "server-only";
import { z } from "zod";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { AppError } from "@/lib/utils/errors";
import { validated } from "@/lib/validation/schemas";
import type { Identity } from "@/types/auth";
const moduleSchema = z.enum(["attendance", "schedule", "leave", "salary", "documents", "performance", "work-records", "assets"]);
export async function placeholderTitle(identity: Identity | null, input: unknown, management: boolean) {
  return securityBoundary(identity, async actor => {
    if (management) assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    else if (!actor.employeeId || !actor.employmentActive) throw new AppError(403, "EMPLOYMENT_INACTIVE", "No active employee profile is available.");
    const feature = validated(moduleSchema, input);
    return feature === "work-records" ? "Work records" : feature[0].toUpperCase() + feature.slice(1);
  });
}
