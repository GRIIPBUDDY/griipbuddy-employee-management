import { it, expect } from "vitest";
import { hashPassword, verifyUnknown } from "@/lib/auth/passwords";
it("bounds password work and recovers unknown-account verification after saturation", async () => {
  const work = Array.from({ length: 4 }, () => hashPassword("Bounded-test-password-2026"));
  await expect(verifyUnknown("Unknown-test-password-2026")).rejects.toMatchObject({ status: 429 });
  await Promise.all(work);
  await expect(verifyUnknown("Unknown-test-password-2026")).resolves.toBeUndefined();
});
