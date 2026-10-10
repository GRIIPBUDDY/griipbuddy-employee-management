import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateCredentials } from "@/lib/auth/credentials";
import { SESSION_SECONDS } from "@/lib/authorization/policy";
import { logUnexpected } from "@/lib/utils/errors";
import { db } from "@/lib/db/client";
import { loadActor } from "@/lib/authorization/actor";
import { audit } from "@/lib/db/audit";

const production = process.env.NODE_ENV === "production";
const secure = process.env.APP_BASE_URL?.startsWith("https://") ?? production;
if (production && !secure && process.env.ALLOW_LOCAL_HTTP !== "true") throw new Error("Production requires HTTPS; local Compose may explicitly allow loopback HTTP.");

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true, // The HTTP handler below normalizes to the configured canonical origin.
  useSecureCookies: secure,
  session: { strategy: "jwt", maxAge: SESSION_SECONDS },
  jwt: { maxAge: SESSION_SECONDS },
  pages: { signIn: "/login", error: "/login" },
  providers: [Credentials({ credentials: { email: {}, password: {} }, async authorize(credentials) {
    try { return await authenticateCredentials(credentials); } catch { logUnexpected("credentials_failed"); return null; }
  } })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token = { userId: user.id, sessionVersion: user.sessionVersion, issuedAt: Date.now(), absoluteExpiresAt: Date.now() + SESSION_SECONDS * 1000 };
        // Use the same immutable millisecond instant for the lifetime calculation.
        token.absoluteExpiresAt = token.issuedAt! + SESSION_SECONDS * 1000;
      }
      if (!token.absoluteExpiresAt || token.absoluteExpiresAt <= Date.now()) return null;
      if (!token.userId || typeof token.sessionVersion !== "number") return null;
      const current = await db.user.findUnique({ where: { id: token.userId }, select: { isActive: true, sessionVersion: true, mustChangePassword: true, temporaryPasswordExpiresAt: true } });
      if (!current?.isActive || current.sessionVersion !== token.sessionVersion ||
        (current.mustChangePassword && (!current.temporaryPasswordExpiresAt || current.temporaryPasswordExpiresAt <= new Date()))) return null;
      return token;
    },
    session({ session, token }) {
      // No roles, grants or employee data in the browser-readable session endpoint.
      Reflect.deleteProperty(session, "user");
      if (token.userId && typeof token.sessionVersion === "number" && token.issuedAt && token.absoluteExpiresAt) {
        session.identity = { userId: token.userId, sessionVersion: token.sessionVersion, issuedAt: token.issuedAt, absoluteExpiresAt: token.absoluteExpiresAt };
      }
      return session;
    },
    redirect({ url }) {
      const canonical = process.env.APP_BASE_URL ?? "http://localhost:3000";
      try { const target = new URL(url, canonical); return target.origin === new URL(canonical).origin ? target.href : canonical; } catch { return canonical; }
    },
  },
  events: { async signOut(message) {
    if (!("token" in message)) return;
    const token = message.token;
    if (!token?.userId || typeof token.sessionVersion !== "number" || !token.issuedAt || !token.absoluteExpiresAt) return;
    try {
      const actor = await loadActor({ userId: token.userId, sessionVersion: token.sessionVersion, issuedAt: token.issuedAt, absoluteExpiresAt: token.absoluteExpiresAt }, undefined, true);
      await audit({ actorUserId: actor.userId, action: "LOGOUT", entity: "users", entityId: actor.userId });
    } catch { /* Revoked identities must still clear their cookies. */ }
  } },
  logger: { error() { logUnexpected("auth_failed"); }, warn(code) { if (code !== "debug-enabled") logUnexpected("auth_warning"); } },
});
