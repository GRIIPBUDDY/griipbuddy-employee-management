import type { Role } from "@/generated/prisma/client";
export type Identity = { userId: string; sessionVersion: number; issuedAt: number; absoluteExpiresAt: number };
export type Actor = Identity & {
  role: Role;
  isActive: boolean;
  accountStatus?: "ACTIVE" | "ON_HOLD" | "SUSPENDED";
  name: string;
  email: string;
  mustChangePassword: boolean;
  employeeId: string | null;
  employmentActive: boolean;
  preorderCommissionEnabled: boolean;
  canManageCommissions: boolean;
};
export type ActionState = { error?: string; success?: string };
