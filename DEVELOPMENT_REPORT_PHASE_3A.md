# Phase 3A development report

**Status: Phase 3A complete.** Application, security, database and Docker acceptance checks passed. No VPS was inspected or changed. Phase 3B was not started.

1. **Implemented:** Next.js App Router/TypeScript project; Tailwind and shadcn/ui source components; responsive authenticated shell; role-aware navigation; dashboard; safe employee profiles/directory; administrator account creation/security/reset controls; forced password change; settings; feature access examples; health endpoints; validation, friendly errors and security audit foundation. Future business modules are placeholders only.

2. **Files/folders:** `src/app`, `src/components`, `src/features`, `src/lib`, `src/types`; `prisma/schema.prisma` and `prisma/migrations/202610090001_foundation`; `scripts`, `tests`, `docker`; Dockerfile and main/development/tools Compose files; `.env.example`, project/lint/test configs, exact dependency lockfile, `.gitignore`, `.dockerignore`, and README. `ARCHITECTURE.md` remains unchanged.

3. **Tables:** `users`, `employees`, `employment_periods`, `organization_settings`, `audit_logs`, plus Prisma migration metadata. UUIDs, timestamps, restrict-delete FKs, unique normalized emails/employee numbers, employment overlap/open-period guards, immutable ownership links, role/grant checks and audit guards. Department/position labels and role enum follow the freeze; no catalog or generic RBAC tables.

4. **Authentication:** pinned Auth.js Credentials with encrypted JWT cookies, Argon2id (19 MiB / 2 iterations / parallelism 1), bounded hashing concurrency, generic login failures and database account lockouts. Fixed absolute 12-hour sessions; live account/version checks also invalidate the Auth.js session endpoint. Temporary passwords expire after 24 hours and require a change before private data. Password/security changes revoke prior sessions. CSRF and canonical-origin validation are active. HTTPS cookies are Secure; explicit loopback testing uses HTTP.

5. **Permissions:** centralized live actor/role/ownership helpers, scoped database reads and safe DTOs. Admin manages accounts/settings; HR reads company employee records; Employee reads only their own account. Separate employee commission flag and HR commission-management grant; disabled direct feature URLs fail with 403. Sensitive mutations reauthorize inside locked transactions and audit atomically. Last-admin changes serialize. Database runtime is non-owner, cannot rewrite audit history or perform DDL. Repeated operational denial events are suppressed for a minute.

6. **Validation results (Node 24.21.0 / PostgreSQL 18.4):**

   | Check | Result |
   |---|---|
   | TypeScript / Prisma generation | Passed |
   | ESLint | Passed, no warnings |
   | Unit suite | **10 passed** |
   | PostgreSQL server-operation suite | **13 passed** |
   | Production Next.js build | Passed |
   | Production HTTP/Auth.js smoke | **26 checks passed** |
   | Bootstrap and runtime-grant CLI scripts | Passed through integration setup |
   | Browser login, profile-menu logout, desktop/mobile shell | Passed with synthetic local accounts; mobile width 390px |
   | Dependency audit | **0 vulnerabilities reported** |
   | Main, development and tools Compose configuration | Passed official Compose 5.6.0 validation |
   | Compose DB-port / internal-network / runtime-credential checks | Passed |
   | Official Node/PostgreSQL image tag and digest lookup | Verified |
   | Production Docker image build | Passed, including Next.js build and dependency pruning |
   | Docker PostgreSQL migration / runtime grants / bootstrap | Passed using ephemeral owner tools |
   | Production Compose startup | Both app and database healthy |
   | Production Docker HTTP/Auth.js checks | **18 passed**; includes bootstrap password gate, three roles, ownership and feature denial |
   | Production runtime restrictions | UID 1000, read-only app, writable bounded tmp, no owner secrets, restricted audit/schema privileges |
   | Development image / Compose / HTTP | Healthy; **13 checks passed**, zero compiler restarts after memory adjustment |
   | Development source/credential isolation | Passed; generated client and writable volumes owned by UID 1000; no environment files or local tooling mounted |
   | Database persistence after restart | Passed; all **13** role/ownership HTTP checks passed again in production |

   Integration tests ran committed migrations on fresh **real PostgreSQL**, then used the restricted runtime role. Coverage includes unauthenticated rejection, tampered IDs, role/feature denial, safe DTOs, live grants, wrong-password lockout, forced change, reset expiry, disabled/revoked/ended-employment identities, concurrent last-admin preservation, database overlap/ownership/grant constraints and audit UPDATE/DELETE/TRUNCATE/DDL denial. HTTP tests used real Credentials login, CSRF and cookies rather than invented session headers. Tests used disposable clusters; no real employee accounts were created.

7. **Docker status:** production image built and both production/development Compose configurations ran successfully on an isolated local arm64 Docker engine. PostgreSQL 18.4, committed migration, runtime grants, bootstrap, health checks and persistent volume were verified. Exactly two persistent services; database has no published port. Runtime is non-root and holds no owner/bootstrap credentials; migrations remain one-off tools. Development mounts exclude environment files and use separate writable generated-client/build volumes. Disposable test containers/volumes were removed and the isolated engine stopped after validation. Existing VM profiles and the VPS were untouched. README documents initialization and local use.

8. **Decisions/limits:** compatible versions are pinned; Auth.js remains its explicitly tested prerelease, while Prisma uses stable 7.10 rather than the registry's Prisma 8 release candidate. Patched tooling overrides are verified. Actual Docker testing required Debian OpenSSL for Prisma and a development-only 1.5 GiB compiler budget; production remains at 768 MiB. Production ingress trusted-IP limits, target-host Argon2/resource benchmarking, backup/restore and deployment remain for the authorized deployment phase. No secrets or `.env` are included in source; generated test/tooling artifacts are ignored. Directory/account lists are capped at 100. No architecture revision was needed.

9. **Phase 3B recommendation:** implement dated normal/temporary schedules, calendar/leave and timezone boundaries in the frozen order, with employment-range/overlap/concurrency and ownership tests. Attendance, overtime and salary calculations follow their prerequisites. Await the separate Phase 3B request.
