import "server-only";
import argon2 from "argon2";
import { AppError } from "@/lib/utils/errors";
const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
let inFlight = 0;
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  if (inFlight >= 4) throw new AppError(429, "AUTH_BUSY", "Please try again shortly.");
  inFlight++;
  try { return await operation(); } finally { inFlight--; }
}
export const hashPassword = (password: string) => bounded(() => argon2.hash(password, options));
export const verifyPassword = (hash: string, password: string) => bounded(() => argon2.verify(hash, password));
// Same work factor for unknown accounts; generated once, unrelated to any real account.
let dummyHash: Promise<string> | undefined;
export async function verifyUnknown(password: string) {
  dummyHash ??= hashPassword("unknown-account-dummy-password").catch(error => {
    dummyHash = undefined;
    throw error;
  });
  await verifyPassword(await dummyHash, password);
}
