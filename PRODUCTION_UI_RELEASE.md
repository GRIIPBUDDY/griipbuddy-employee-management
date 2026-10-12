# Production release — overtime rejection and workspace UI

Published on 12 October 2026 after the owner explicitly authorized production deployment and preservation of all existing data.

URL: https://griipbuddy.cloud. Docker Manager project: `griipbuddy-employee`.

## Release identity

- Application source: `0835b9b43e6fe34733b7998cfe3b2c2bf171bbe0`.
- Immutable AMD64 image: `sha256:f5bb36a40e5b7774c2af750b5bd01bd4e0d4f6c74c4364ad90a06c618bf71dbd`.
- Active source directory: `/srv/griipbuddy-employee/releases/0835b9b43e6f`, selected by `current`.
- Previous source/image retained: `655691b1a7cb` and `sha256:104c866530f3be279ecf65209036873d07fee9d04dc5a5746b28ea6afe894aaf`.

The new image was built separately on the VPS with a builder limited to one CPU and 2.5 GiB RAM. Production stayed on its prior image during the build and initial restore acceptance. The application container alone was recreated during cutover.

## Existing data preserved

The production database was not reset, bootstrapped, seeded, restored over, or migrated. Schema, all migration files, dependency manifests, Hostinger Compose storage/security settings and database initializer were checked byte for byte against the previous release and were unchanged.

During a brief hostname-only maintenance window, this application's notification timer was paused and its old application stopped gracefully. A fresh consistent database/document recovery set was captured before changing the image. Every public database table was fingerprinted in a read-only repeatable-read transaction using row counts and sorted complete-row digests.

**All 32 table counts and content digests matched exactly after the new image started, before the public site reopened.** The PostgreSQL container identity and private document volume were unchanged. All runtime/operator settings other than `EMPLOYEE_APP_IMAGE` matched the preserved configuration, including database passwords, `AUTH_SECRET`, origins and delivery settings. Existing user password hashes, roles, permission grants, session versions, employee records, attendance, overtime decisions, audit and financial history therefore remained intact.

At the checked snapshot, the database contained six user accounts, five employee profiles, two attendance sessions and one overtime review. The document manifest contained no uploaded files. Verification covered every table, rather than only those nonempty examples.

The exact original Nginx hostname route was restored and the dedicated notification timer resumed. Other application projects and the existing `griipbuddy.com` site were preserved.

## Backups and rollback

Fresh recovery set: `/srv/griipbuddy-recovery/20261012-ui-cutover-0835b9b`.

Authenticated encrypted archive: `/srv/griipbuddy-recovery/20261012-ui-cutover-0835b9b.enc`. AES-256-GCM encryption was verified by a full decrypt-and-hash roundtrip. The key, prior protected environment, prior route, rollback image/source and private integrity receipt are retained under `/srv/griipbuddy-config/rollback-20261012-ui-attempt2` with private operator permissions. No private production records or keys were exported to the Mac or GitHub.

The fresh recovery set was restored into a separate `griipbuddy-restore-ui-final-0835b9b` database using distinct credentials, volumes and session secret, with no public app ingress or scheduled jobs. All 32 restored table digests matched the exact cutover snapshot. The earlier recovery set was also successfully restored, and the new image was checked against that isolated copy before production cutover.

The first maintenance readiness probe observed Nginx's previous route while reload was taking effect. The guarded script aborted before stopping the application and restored the previous route/image configuration. The successful retry waited for the origin maintenance response before proceeding. No data was changed by that abort.

Rollback is application-only: restore the retained operator environment and prior `current` pointer, then recreate only `employee-app` using the previous Hostinger Compose file and image; verify health before reopening. Preserve all database/document volumes. No schema rollback is needed for this release.

Backups are verified **on this VPS**. Automated off-server backup storage remains unconfigured; the organization's offsite-backup timestamp was not falsely marked successful. Server-loss recovery would require a separately verified off-server copy.

Temporary restore containers/networks and this release's builder were removed after verification. Their volumes, both release images and all recovery sets were retained. No production volume removal or global Docker cleanup was performed.

## Acceptance and limits

Local acceptance: type checking, lint and production webpack build passed; 91 unit tests, 218 PostgreSQL integration tests and 331 real Auth.js/standalone HTTP checks passed. The actual local browser verified rejection, optional reason, confirmation cancellation, persisted status after refresh/recalculation, employee notification/history, zero active approved overtime, stale submission protection with preserved form values, queue search/filtering, mobile sizing and keyboard tabs. See `CRITICAL_FIX_UI_REPORT.md` for the root cause and changed files.

Production acceptance: public HTTPS login, all observed login script assets, liveness/readiness, guest redirects for private pages, private overtime API rejection, Secure/HttpOnly/SameSite authentication cookie flags and the application's configured response headers were verified. Runtime remained UID 1000 without owner/bootstrap/migration credentials. The public login page rendered in the actual browser with no captured errors or warnings. App and database health checks passed, the notification timer was active, and `griipbuddy.com` still returned success.

Authenticated salary finalization, attendance changes, overtime decisions and password changes were not executed against real production accounts during acceptance. Those mutations were tested only with disposable fixtures. Refresh already-open tabs once to load the newer client assets; existing accounts and passwords were retained.
