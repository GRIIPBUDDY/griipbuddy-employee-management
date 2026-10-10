# DEVELOPMENT AND PRODUCTION-READINESS REPORT — Phase 3H

Reviewed 11 October 2026 (Asia/Shanghai). This phase ends at testing and production preparation. **The live Hostinger VPS, existing databases, DNS, reverse proxy, firewall and server services were not accessed or modified.**

Status vocabulary: **Passed** = actually verified locally; **Failed** = reproduced failure, with disposition stated; **Not tested** = no supporting execution; **Blocked** = launch prerequisite requiring owner/external work. Local QA evidence does not certify the real VPS or encrypted offsite recovery.

## 1. Overall system status

**Passed — local Phase 3H review and preparation. Production launch remains blocked by the prerequisites below.** The application retains one Next.js app, one PostgreSQL database, one Compose project per installation and private persistent document storage. No new persistent service or approved business-formula change was introduced. Previous evidence was rerun independently. Verified privacy and startup defects were fixed, regression tests added, and actual isolated recovery completed twice, including the final image.

The [initial assessment](INITIAL_ASSESSMENT_PHASE_3H.md) records the starting gaps. The previous report is preserved in [DEVELOPMENT_REPORT_PHASE_3G.md](DEVELOPMENT_REPORT_PHASE_3G.md), alongside earlier phase reports. No Git repository or remote exists in this checkout; private GitHub source-control/release integration is an outstanding architecture prerequisite.

## 2. Modules inspected

Inspection covered the architecture and three approved revisions, prior reports, source/module and route inventory, Prisma schema and all eight migrations, Docker/environment configuration, operational instructions and the existing automated tests. Manual review concentrated on authorization, domain calculations/transactions, source visibility, storage and operational boundaries; a supplemental pattern scan covered 288 non-generated source/script/test/schema files.

| Area | Evidence and result |
|---|---|
| Accounts, credentials, sessions and role/feature updates | Passed: security integration plus production Auth.js HTTP tests |
| Profiles, employment, catalogs and timeline | Passed: ownership, edit conflicts, deactivation/history and new legacy-salary regression |
| Documents and profile photos | Passed: private storage, bounded validation, live parent permissions and download/retention tests |
| Schedules and actual attendance | Passed: effective versions, eligibility/timezone, injection and concurrency tests |
| Corrections, leave/holiday exceptions and overtime | Passed: reviewed workflows, authoritative intervals, stale decisions, notifications and audit |
| Compensation, salary and reconciliation | Passed: explicit Decimal expectations, approval, immutable snapshots and later corrections |
| Pre-orders and commissions | Passed: earning evidence, independent permissions, decimal rounding, deduplication and inclusion |
| Leave, performance, warnings and assets | Passed: publication/privacy, receipt, revision/history and assignment integrity |
| Dashboards, notifications, reports/CSV and audit review | Passed: permissions, filters, authoritative calculations, redaction and deduplication |
| Schema, migrations, grants and Docker | Passed: clean initialization, populated upgrades and real container checks |
| Backup/recovery and deployment materials | Passed locally: executable recovery drill and runbooks; external launch gates remain |

The structural scan found no non-health/non-auth API route missing the shared identity helper (80 total routes), no server-action file missing origin enforcement (eight files), and no unsafe raw-SQL/eval/HTML-injection pattern hit. These checks supplement domain tests; they are not an exhaustive penetration test or proof against every vulnerability.

## 3. Defects found

1. **Failed before fix — high-priority historical salary privacy:** timeline filtering trusted an optional `commissionRelated` truthy value. A legacy salary source missing that classification, paired with a historically unrestricted activity row, could reveal commission-bearing text to ordinary HR or an employee without the feature. The new test reproduced the HR leak (`expected false, received true`) before application repair.
2. **Failed before fix — production configuration separation:** startup validation did not require the non-owner database login, did not reject all owner/bootstrap inputs, and the local-host exception could accept a non-HTTP URL protocol. These were configuration-hardening gaps, not evidence of a deployed credential compromise.
3. **Failed before fix — startup rejection did not terminate Next.js:** the actual container kept running and repeatedly retried a throwing instrumentation hook. Invalid configuration needed an explicit process exit to fail promptly and produce one safe diagnostic.

The first attempt at the historical regression had a missing `eventTime` fixture field; that fixture error was corrected before the genuine privacy failure was reproduced. Tests were not weakened to accept the leak.

## 4. Defects fixed

**Passed.** The timeline now reuses the established `commissionRestricted` helper: missing/unknown classifications fail closed; Admin and independently granted HR retain authorized access; own finalized aggregate salary remains accessible under the frozen policy. No historical records or calculation formulas were rewritten.

A shared, testable runtime validator now requires `employee_runtime`, canonical/matching origins, HTTPS or explicit loopback HTTP, a suitable session secret, and separation of owner/bootstrap settings. URL/parser failures name settings without echoing values. Production instrumentation explicitly exits with status 1 after a redacted diagnostic. The final Docker negative check confirmed one diagnostic, natural exit 1 and no supplied secret value in output.

Regression additions: seven runtime/startup unit tests, four explicit requested check-in-time cases, three recovery tests, one historical timeline integration test and one Admin-only backup-status integration test. Admin settings now shows missing/current/stale recorded offsite-backup evidence, while local backup tooling leaves success unrecorded.

## 5. Critical unresolved issues

**No known unresolved critical application access-control, money, data-integrity or migration defect was found in the executed checks.** This is a bounded review, not a security guarantee. Production release is **Blocked** by missing private GitHub/release identity, uninspected shared VPS/target architecture, real ingress/SSL acceptance, production secrets and verified encrypted offsite recovery. Section 17 lists owner actions. The application is not declared unconditionally production-ready.

## 6. Type-check, lint and build results

| Check | Actual result |
|---|---|
| `npm ls --all` | Passed, exit 0; optional platform dependencies remain optional |
| `npm run typecheck` | Passed after final source/test changes |
| `npm run lint` | Passed after final changes |
| `npm run build -- --webpack` | Passed, native production standalone build |
| Production Docker build (`npm ci`, default Turbopack build, production prune) | Passed, including final startup fix |
| Release/base/tools Compose `config --quiet` | Passed with explicit image; missing required image was rejected |

There was no dependency upgrade or lockfile/formula change in this phase. Docker clean installation and production pruning each reported zero known vulnerabilities. Native webpack and Linux Turbopack were both exercised; native HTTP and Docker app acceptance use the corresponding production builds.

## 7. Unit, integration and end-to-end results

| Suite | Result |
|---|---|
| `npm test` | Passed: **72 unit tests / eight files** |
| `npm run test:integration` | Passed: **195 PostgreSQL integration tests / eight files** |
| `npm run test:http` | Passed: **298 checks** against production Next.js, disposable PostgreSQL and real Auth.js cookies; rerun after final startup change |
| Docker recovery fixture creation | Passed: ten real HTTP setup checks |
| Restored app acceptance | Passed: 17 checks on both initial and final-image restores |
| Docker production hygiene | Passed: 17 checks, repeated on final running image |
| Real recovery CLI negative cases | Passed: production project, nonempty target, corrupted copy and incomplete copy rejected |

The HTTP smoke is the configured automated end-to-end harness; no separate Playwright/browser E2E framework was added. Full browser/device/accessibility matrix, sustained production-scale load and live HTTPS testing are **Not tested**. Existing pg transaction tests emit a deprecation notice about concurrent queries queued on one client; they pass on pinned pg 8.23.1. Future pg 9 adoption must review this behavior.

## 8. Security-test results

**Passed locally:** real login/logout, generic wrong-credential failures, account lockout, temporary-password expiry/change/reset, disabled/expired/revoked identities, live role/grant changes and concurrent last-Admin protection. Employee identity comes from the server session/account link. Role/grant data is reread, not trusted from browser state.

Origin-protected mutations, body allowlists/bounds, safe application errors, HttpOnly/SameSite cookies, header checks, private source projections, redacted structured audits and append-only DB permissions were exercised. The runtime login cannot update/delete/truncate audit, delete employee rows, create schema objects or read migration metadata. The final normal container has no owner/bootstrap environment inputs and rejects their accidental injection.

Document tests cover PDF/JPEG/PNG validation, invalid/active/encrypted PDFs, size/pixel/concurrency limits, unsafe key/path and symlink behavior, cross-owner IDs, private warning parents, authenticated downloads, visibility changes and soft deletion with bytes retained. No public private-file route exists. Actual HTTPS Secure-cookie behavior and proxy-level rate limiting still need target ingress validation; account lockout is not a distributed ingress throttle.

## 9. Employee data-isolation results

**Passed:** Admin, plain HR, separately commission-granted HR, eligible Alice and ineligible Bob were covered. URL/query/body/record-ID tampering and direct APIs were tested across profiles, schedules, attendance, corrections, leave, documents, compensation/salary, performance, warnings, assets, notifications, pre-orders/commissions and reports/exports. Rejected requests return scoped errors; hiding navigation was not used as security evidence.

Live revocation covers own commission pages/history, dashboard, timeline and notification source visibility; salary components and exports honor independent HR grants. Historical final aggregate salary remains available as approved, without restricted component/history disclosure. The new legacy timeline regression now passes alongside existing fail-closed historical audit/report/salary checks. Employees cannot use company-wide reports or audit review. HR cannot administer accounts/settings or approve/finalize salary periods, and self-review/publication restrictions remain enforced.

## 10. Salary and commission calculation results

**Passed; approved formulas retained.** Arithmetic uses Decimal precision 40 and half-up two-decimal component rounding, with the final amount summing displayed components. Explicit automated expectations include:

| Controlled case | Expected and actual |
|---|---|
| Full calendar month at 15,000 | 15,000.00 |
| 31-day month: first 15 days at 15,000, remaining 16 at 18,000 | 16,548.39 |
| Six hourly hours at 10, no approved overtime premium | Base 60.00, premium 0.00 |
| Same work, one hour approved at multiplier 1.5 | Base 50.00 + overtime 15.00 = 65.00 |
| Daily 100, half scheduled coverage across two intervals | 50.00 |
| Fixed commission 12.345 | 12.35 |
| 2.5% commission on 123.45 | 3.09 |
| Production HTTP closeout: 3,100 + 100 commission + 50 bonus | 3,250.00 |
| Docker recovery closeout: 3,100 + rounded 12.345 commission | **3,112.35**, unchanged after actual restore |

Effective compensation ranges, paid eligible absence, allowances/bonuses/deductions, signed corrections, pending/unapproved sources, duplicate claims, unique employee-period calculations and Admin closeout were covered. Finalized rows remain immutable when later sources change; subsequent reviewed reconciliation/refund adjustments preserve prior history and prevent duplicate settlement. Unapproved excess work does not earn an overtime premium under the frozen formula; ordinary hourly base treatment remains unchanged.

Schedule tests explicitly reject 08:49 and permit 08:50, 08:55 and 09:00 for a 09:00 start with ten-minute allowance. Exact second/cutoff boundaries, organization dates/DST, multiple/overnight sessions, overlapping intervals, active-session concurrency and browser timestamp rejection pass. Corrections/leave can invalidate overtime approval and require review; incomplete sessions receive no invented checkout or silent payable premium.

## 11. Database migration results

**Passed:** fresh embedded PostgreSQL and fresh Docker PostgreSQL applied all eight migrations in order. Populated upgrade tests preserve earlier employment/catalog labels, document and audit history, attendance/correction/overtime/leave data, finalized compensation/claims and Phase 3F warning/notification state. Migration 008 adds query indexes; **Phase 3H adds no schema migration**.

Schema/SQL review verified foreign-key ownership constraints, half-open interval exclusions, one open attendance/asset assignment, idempotency/reference uniqueness, unique employee salary period, monetary checks, revision/history triggers, finalized-salary guards and append-only audit. Mutations reuse existing authorization/transaction locks; recovery reuses the existing file-deletion lock. The runtime role has access to 25 mutable domain tables plus SELECT/INSERT on audit, without DDL or migration metadata.

Safe pre-backup, maintenance-window, owner-only migrate/grant and failure-handling procedures are in [DEPLOYMENT.md](DEPLOYMENT.md). No reset, schema push, down migration or production SQL was run.

## 12. Docker validation results

**Passed locally:** the final production image is ARM64, runs as `node`, has a read-only root, dropped capabilities, no-new-privileges, bounded resources/logs and a writable persistent private-documents volume. PostgreSQL has persistent storage and no published port; only the app's port is bound to loopback. The backend network is internal and isolated by project. Normal startup contains no owner/bootstrap inputs and applies no migrations.

Both source containers were recreated with volumes retained; all 26 table digests stayed identical and authorized document/salary checks passed afterward. The daily job was rerun without increasing notifications (21 before/after). With the QA database stopped, readiness returned generic 503 and liveness 200; readiness recovered after restarting the same persisted DB. Image inspection found no environment files, local tooling, Git directory, backup directories or tests in the runtime root.

Final tested image ID: `sha256:03717efe5a4ee6b21d235e8addd03b79c248ff8241ef480f684835699a8731a3`. This is local QA identity, not a GitHub production release. VPS architecture compatibility/resource headroom and actual proxy integration are **Not tested/Blocked**; do not transfer the ARM64 image blindly to an x86 VPS.

## 13. Backup/restore verification results

**Passed — actual local recovery, including the final image.** The protected host tool produced a custom PostgreSQL dump, deployment/migration/image metadata, a document manifest and SHA-256 checksums outside the source checkout. Artifact directory is 0700, files 0600. Shared recovery locking blocked exclusive physical cleanup while allowing a real concurrent HTTP upload. All retained references, including deleted/private documents, were included.

The final set contains 95 domain rows in 13 populated tables; the remaining tables were empty in this controlled fixture. It preserves 44 audit rows, 21 notification rows/read state, finalized salary/commission and four document files. All **26** domain-table counts and SHA-256 row digests matched exactly before restored logins. Every restored document reference/file hash matched. Restored production HTTP acceptance verified the 3,112.35 statement, released file hash, foreign/private/deleted denials, private warning and feature restrictions. No real employee data was used.

Final snapshot: `2026-10-10T19:12:41.009Z` UTC. Final protected synthetic set: `/private/tmp/griipbuddy-phase3h-final-recovery-0227167f-4622-4262-8a58-594aaf9f3bb5`. First and final sets remain local; old backups were not automatically deleted. Tests damaged only disposable copies and rejected them; a nonempty restore target and ordinary production project were refused. The tool never resets/replaces an existing DB or overwrites a file key. Post-restore grants and ANALYZE ran; no ingress/jobs were started before integrity checks.

**Not tested/Blocked for launch:** real authenticated encryption, off-server upload/decrypt roundtrip, operational key recovery and target-host RTO/RPO. Local sets remain `LOCAL_VALIDATED`, `offsiteVerified=false`; the verified-offsite timestamp was deliberately not advanced. Admin settings correctly shows no recorded verified offsite recovery set. [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) covers protected configuration, offsite verification, session invalidation and an owner-approved manual retention proposal; no automated deletion or production scheduler was installed.

## 14. Dependency review results

**Passed:** installed dependency graph exits 0; full-lock `npm audit --json` reports **zero known vulnerabilities** across all severities, as does the production `--omit=dev` advisory check. Clean Docker `npm ci` and production prune succeeded with zero known advisories. This is point-in-time registry evidence, not proof that every package is safe.

Exact versions/lock and existing compatible overrides were preserved. Prisma/tsx remain production tooling dependencies because the same reviewed image supplies one-off migration/grant/bootstrap/job operations. No demonstrated unused dependency was removed merely to reduce counts. Auth.js is a pinned prerelease; its real Next.js/React production credentials/session compatibility passed HTTP and Docker tests. npm reports install-script policy notices for Prisma engines/Argon2/esbuild; actual generation, migration, password hashing and runtime succeeded. Blind major/prerelease upgrades were avoided.

Supplemental source scanning found no private-key/AWS/GitHub-token/JWT-pattern hit in the reviewed files. Protected local QA env files used only generated synthetic values; production templates contain placeholders. **Git history and repository secret scanning: Not tested/Blocked**, since there is no Git repository/remote. If later history review finds credentials, rotate them; deleting a current file is insufficient.

## 15. Production-readiness checklist

| Gate | Status |
|---|---|
| Domain service/ownership/security regressions | Passed locally |
| Decimal salary/commission and immutable history checks | Passed locally |
| Type/lint/native build/HTTP and Linux Docker build | Passed |
| Fresh migration and populated upgrade/grant checks | Passed locally |
| Database/document persistence and actual recovery | Passed locally |
| Protected backups, corruption/nonempty-target refusal | Passed locally |
| Deployment, migration, rollback, health, proxy/SSL and recovery procedures | Prepared |
| Private GitHub source/reviewed commit/history and immutable target-architecture release | Blocked |
| Existing shared VPS ports/proxy/capacity/network inspection | Not tested; launch gate |
| Real secrets, initial account/configuration and operator handover | Blocked |
| Real HTTPS/domain/certificate renewal and ingress acceptance | Not tested; launch gate |
| Verified encrypted off-server storage, keys and restore objectives | Blocked |
| Approved daily scheduling, backup alerts and manual retention | Prepared, not installed |
| Owner shadow payroll/acceptance and deployment authorization | Outstanding |

## 16. Files created or changed

Application/security: `src/features/people/timeline.ts`, `src/instrumentation.ts`, new `src/lib/validation/runtime-environment.ts`, `src/features/settings/service.ts`, `src/app/(protected)/manage/settings/page.tsx`.

Regression tests: `tests/integration/insights.test.ts`, `tests/integration/security.test.ts`, `tests/unit/time.test.ts`, new `tests/unit/runtime-environment.test.ts`, new `tests/unit/recovery.test.ts`.

Operations: new `scripts/operations/recovery.mjs`, `recovery-session.mjs`, `recovery-manifest.mjs`; new `docker-compose.release.yml`, `.env.production.example`, [DEPLOYMENT.md](DEPLOYMENT.md), [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md); amended `.env.example`, `.gitignore`, `.dockerignore` and [README.md](README.md).

Evidence: new [INITIAL_ASSESSMENT_PHASE_3H.md](INITIAL_ASSESSMENT_PHASE_3H.md), archived [DEVELOPMENT_REPORT_PHASE_3G.md](DEVELOPMENT_REPORT_PHASE_3G.md), replaced this current report. Actual detailed logs/QA scripts remain ignored under `.local/phase3h-*`; generated source is ignored. No migration, package/lock or approved architecture/formula changed. QA credential files and only this phase's disposable resources are cleaned after verification; protected synthetic recovery sets are retained outside the checkout.

## 17. Deployment prerequisites still outstanding

Owner must establish/review the private GitHub source and immutable release; inspect the shared Hostinger VPS read-only; validate the correct CPU architecture and capacity with realistic workload; select the existing proxy/ingress path and a free project port; provision protected secrets and initial Admin; verify domain/TLS/cookies/origin/download behavior through actual ingress; arrange encrypted off-server recovery/key access and agree tested RTO/RPO; approve retention, monitoring and daily scheduling; and complete shadow salary acceptance.

These are external launch gates, not silently assumed completed. No live host credentials, repository destination or offsite storage account was supplied or used. Do not deploy while these prerequisites and owner review remain outstanding.

## 18. Recommended next action

**Stop here for owner review of this report and the two runbooks.** Resolve the listed external prerequisites and then request a separately authorized deployment phase. That phase should inspect the existing shared VPS first, preserve other applications, take and verify a pre-change recovery set, validate the release/migrations/rollback plan and perform scoped HTTPS acceptance. Do not deploy, change server configuration or install scheduling automatically from Phase 3H.
