import "next-auth";
import "next-auth/jwt";
import type { Identity } from "./auth";
declare module "next-auth" {
  interface User { sessionVersion: number; lifetime?: number }
  interface Session { identity?: Identity }
}
declare module "next-auth/jwt" {
  interface JWT { userId?: string; sessionVersion?: number; issuedAt?: number; absoluteExpiresAt?: number }
}
