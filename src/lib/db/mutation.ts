import "server-only";
import { db } from "./client";
import { loadActor } from "@/lib/authorization/actor";
import { assertIdentity } from "@/lib/authorization/policy";
import type { Identity, Actor } from "@/types/auth";
import type { Database } from "./audit";
import { validated, uuidSchema } from "@/lib/validation/schemas";

export async function authorizedMutation<T>(identity: Identity | null, operation: (actor: Actor, tx: Database) => Promise<T>, targetUserId?: string, allowPasswordChange = false): Promise<T> {
  assertIdentity(identity);
  validated(uuidSchema, identity.userId);
  if (targetUserId) validated(uuidSchema, targetUserId);
  return db.$transaction(async tx => {
    // Frozen lock order: global pay/permission lock, then stable user rows, then domain rows.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73102301)`;
    for (const id of [...new Set([identity.userId, ...(targetUserId ? [targetUserId] : [])])].sort()) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    }
    await tx.$executeRaw`SELECT set_config('app.actor_user_id', ${identity.userId}, true)`;
    const actor = await loadActor(identity, tx, allowPasswordChange);
    return operation(actor, tx);
  }, { timeout: 15000 });
}
