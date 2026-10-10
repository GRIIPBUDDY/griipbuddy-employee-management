# Phase 3B development report

**Status: complete — Employee Profiles, Documents & Timeline.** Phase 3C has not started. No production VPS or real employee data was accessed or changed. All acceptance checks used disposable local databases, containers and synthetic accounts/files.

1. **Features implemented**

   Employee directory with name/ID search, department/status filters, protected photo thumbnails and 25-row pagination. Full personal, contact, employment, linked-account and approved feature information. Staff employee creation, optimistic edits, audited employment changes and immediate account deactivation preserving history. Admin can provision a new employee login; HR links a provisioned account. Employees have a session-derived contact-edit form and permitted own profile/documents/timeline.

   Simple department and position management supports creation, case-insensitive unique names, optimistic editing and deactivation. Existing assignments survive deactivation; inactive entries cannot be assigned to new employment. Historical employment labels remain intact when catalogs are renamed.

   Private PDF/JPEG/PNG upload, metadata listing, protected download/image viewing, issue/expiry dates, staff release/withdrawal, soft deletion and private profile photos. A unified newest-first timeline includes source-linked profile/employment/document events and six manual record categories. Staff corrections/removal require reasons and preserve audit history. Employees see only explicitly published own records and currently authorized sources.

2. **Files and database changes**

   Updated Prisma schema, additive migrations `202610090002_people` and `202610090003_catalogs`, runtime grants, API routes and management/self-service pages. Services and forms are in `src/features/people`, `src/features/organization`, `src/components/people`; private storage, bounded validation and the raw PDF worker are in `src/lib/documents`. Added integration/upgrade coverage and expanded `scripts/http-smoke.ts`. Updated Dockerfile, Compose private volume, environment example, ignore/tracing rules, README and pinned dependencies (`sharp` and `pdf-lib`). The Phase 3A report is preserved in `DEVELOPMENT_REPORT_PHASE_3A.md`.

   Added `employee_documents`, `employee_activities`, `departments` and `positions`; added personal/photo and employment/manager/probation/catalog fields to existing tables. There are nine domain tables plus Prisma metadata. Existing migration 001, identities, ownership, employment ranges and audit rows remain intact. Documents have same-employee stint constraints, immutable file identity and protected photo ownership. Documents/activities/catalogs cannot be hard-deleted through the runtime; database triggers additionally preserve provenance and prevent document/activity resurrection.

   `ARCHITECTURE.md` remains unchanged. `ARCHITECTURE_REVISION_PHASE_3B.md` records the narrow catalog revision required by the explicit Phase 3B request, including preserved label snapshots and compatibility with the existing administrator account form. No organizational chart or generic RBAC engine was added.

3. **Security and authorization changes**

   Reused live actor/role/ownership authorization, canonical-origin checks, strict server allowlists, the global mutation lock and atomic append-only audits. Ordinary employees cannot manage profiles, catalogs, documents or official records. Self-service identity derives from the authenticated account; injected employee IDs/security fields are rejected. Staff document IDs must match the authorized employee. Publication and source permissions are checked on every read; personal staff portals still enforce their own publication rules. Unknown future timeline sources fail closed. Employment/security changes and deactivation revoke existing sessions.

   Documents never enter a public directory, source control, image or browser DTO as raw storage identifiers. Generated UUID keys, exclusive 0600 writes, immutable durable publication before metadata commit, directory fsync and the shared physical-deletion lock protect private storage consistency. Downloads use no-follow file opens, checked size/type, private no-store headers, safe disposition, nosniff and sandbox policy. PDFs always download as attachments. Images are decoded/re-encoded with bounded dimensions and metadata removal. PDF parsing runs in a copied raw Node worker with memory/time limits and rejects active, encrypted, malformed, form-bearing and excessive-complexity input. Upload concurrency/body/file limits apply before publication.

   Runtime remains UID 1000 with a read-only production filesystem, writable bounded temporary space and a private persistent document volume. Its non-owner database role receives SELECT/INSERT/UPDATE on eight mutable tables and SELECT/INSERT on audits, without DELETE/TRUNCATE/DDL/migration-history access. No owner or bootstrap secrets are injected into normal production/development runtime.

4. **Tests run and actual results**

   | Check | Actual result |
   |---|---|
   | Prisma generation / TypeScript | Passed |
   | ESLint | Passed, no warnings |
   | Existing unit suite | **10 passed** |
   | PostgreSQL integration suites | **39 passed**: 13 foundation, 25 people/catalog/document/timeline, 1 populated migration upgrade |
   | Native production standalone build | Passed, no build warnings; cleared a cached sandbox worker failure before the successful build |
   | Standalone HTTP/Auth.js acceptance | **73 checks passed** with real credentials, CSRF and encrypted cookies; the normal `npm run test:http` command exited successfully |
   | Dependency audit, full and runtime tree | **0 vulnerabilities reported** |
   | Production Docker image | Built successfully |
   | Docker migrations / runtime grants / bootstrap | Passed; catalog migration applied to the existing populated QA database |
   | Production Docker HTTP | **5 bootstrap + 13 role/ownership + 23 Phase 3B checks passed** |
   | Production database restart / app recreation | **9 persistence checks passed**, including document byte hash, metadata, timeline, catalog state and soft deletion |
   | Production runtime / file permissions | Passed: UID 1000, read-only app, private directory 0700/files 0600, retained file hashes match metadata, least privileges and no owner secrets |
   | Production image hygiene | Passed: no environment files/local tooling/private documents; raw PDF worker present |
   | Development image / Compose health | Passed |
   | Development HTTP / role checks | **23 Phase 3B + 13 role/ownership checks passed** |
   | Development mounts / generated client | Passed: non-root, writable volume ownership, no environment files/local tools/owner secrets |
   | Browser forms | Passed: login, catalog creation, employee creation/edit, employee-ID search and published work-record creation |
   | Responsive browser check | Passed: profile at 390px with document width 390px; desktop catalog management verified |

   Tests include tampered URL/API identifiers, self-service field injection, cross-employee profile/files, staff-only publication, invalid/spoofed/oversized/active PDFs, stale edits, duplicate IDs and catalog names, inactive assignments, trusted catalog labels, historical preservation, live permission withdrawal, safe HEAD responses, audit facts and restricted database privileges. Existing tests were retained. Migration upgrade tests preserve populated Phase 3A accounts, hashes, bank data, periods, label snapshots and audit identities while backfilling catalog references.

5. **Known limitations and remaining work**

   Document/timeline lists show the latest 100 entries; account lists and profile account/manager selectors retain their existing caps. Catalogs are independent lists without an organizational chart. PDFs with forms, encryption, external actions or excessive complexity are intentionally rejected. Validation is not antivirus scanning. Manual records have no attachment field. No expiry notifications exist.

   Soft deletion retains document bytes and historical metadata. Failed metadata commits can leave private orphan bytes. Physical cleanup, backup/restore, production ingress/resource benchmarking and target-host deployment remain future work and must follow the existing storage lock/consistency rules. No unresolved acceptance failures remain for this phase. Disposable QA containers, networks, database/document/development volumes, native preview files and QA secrets were removed; the isolated QA engine and temporary browser tab were stopped. The temporary browser screenshot `.local/phase3b-catalogs.jpg` shows synthetic catalog proof and is ignored by source control.

6. **Scope confirmation**

   No schedules, attendance/check-in/out, overtime, salary calculation, pre-order commission workflows, leave workflows, performance reviews, warning management, asset management, expiry notifications or production VPS deployment were implemented. Existing later-module placeholders and feature-access examples remain placeholders. Development stopped after Phase 3B.

7. **Recommended next phase**

   Await a separate Phase 3C request. Implement the scheduling/calendar prerequisites in the approved architecture order, with dated employment boundaries, organization timezone, overlap/concurrency and ownership coverage before dependent attendance/pay calculations. Do not begin automatically.
