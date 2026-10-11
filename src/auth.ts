import NextAuth, { type NextAuthConfig } from "next-auth";
import { headers } from "next/headers";
import { getToken, encode } from "next-auth/jwt";
import { rememberedSeconds } from "@/lib/auth/session-policy";
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

function configuration(lifetime: number): NextAuthConfig { return {
  secret: process.env.AUTH_SECRET,
  trustHost: true, // The HTTP handler below normalizes to the configured canonical origin.
  useSecureCookies: secure,
  session: { strategy: "jwt", maxAge: lifetime },
  jwt: { maxAge: lifetime, async encode(params) { const expires=params.token?.absoluteExpiresAt; return encode({...params,maxAge:typeof expires==="number"?Math.max(0,Math.floor((expires-Date.now())/1000)):lifetime}); } },
  pages: { signIn: "/login", error: "/login" },
  providers: [Credentials({ credentials: { email: {}, password: {}, remember: {} }, async authorize(credentials) {
    try { const user=await authenticateCredentials(credentials);return user?{...user,lifetime:credentials.remember==="true" || credentials.remember==="on"?rememberedSeconds():SESSION_SECONDS}:null; } catch { logUnexpected("credentials_failed"); return null; }
  } })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token = { userId: user.id, sessionVersion: user.sessionVersion, issuedAt: Date.now(), absoluteExpiresAt: Date.now() + (user.lifetime ?? SESSION_SECONDS) * 1000 };
        // Use the same immutable millisecond instant for the lifetime calculation.
        token.absoluteExpiresAt = token.issuedAt! + (user.lifetime ?? SESSION_SECONDS) * 1000;
      }
      if (!token.absoluteExpiresAt || token.absoluteExpiresAt <= Date.now()) return null;
      if (!token.userId || typeof token.sessionVersion !== "number") return null;
      const current = await db.user.findUnique({ where: { id: token.userId }, select: { isActive: true, accountStatus: true, sessionVersion: true, mustChangePassword: true, temporaryPasswordExpiresAt: true } });
      if (!current?.isActive || current.accountStatus === "SUSPENDED" || current.sessionVersion !== token.sessionVersion ||
        (current.mustChangePassword && (!current.temporaryPasswordExpiresAt || current.temporaryPasswordExpiresAt <= new Date()))) return null;
      return token;
    },
    session({ session, token }) {
      // No roles, grants or employee data in the browser-readable session endpoint.
      Reflect.deleteProperty(session, "user");
      if (token.userId && typeof token.sessionVersion === "number" && token.issuedAt && token.absoluteExpiresAt) {
        session.identity = { userId: token.userId, sessionVersion: token.sessionVersion, issuedAt: token.issuedAt, absoluteExpiresAt: token.absoluteExpiresAt };
      }
      Reflect.set(session, "expires", new Date(token.absoluteExpiresAt ?? 0).toISOString());
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
}; }

export const { handlers, auth, signIn, signOut } = NextAuth(async request => {
 let lifetime=SESSION_SECONDS;
 const h=request?.headers ?? await headers();
 const token=await getToken({req:{headers:h},secret:process.env.AUTH_SECRET!,secureCookie:secure});
 if(typeof token?.absoluteExpiresAt==="number")lifetime=Math.max(1,Math.floor((token.absoluteExpiresAt-Date.now())/1000));
 if(request?.method==="POST" && new URL(request.url).pathname.endsWith("/callback/credentials")){
  const form=await request.clone().formData();lifetime=["true","on"].includes(String(form.get("remember")))?rememberedSeconds():SESSION_SECONDS;
 }
 return configuration(lifetime);
});
export async function signInWithPolicy(input:{email:string;password:string},remember:boolean){
 return NextAuth(configuration(remember?rememberedSeconds():SESSION_SECONDS)).signIn("credentials",{...input,remember:String(remember),redirect:false});
}
