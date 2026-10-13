# Production deployment — release 58fd7afc3c23 (monthly payroll, configurable settings, payslips)

Deployed 2026-10-13 17:56 UTC to `griipbuddy.cloud` (Docker Compose project `griipbuddy-employee`). Previous release `84d8ebc96917`.
Legend: **PASSED** · **FAILED** · **NOT TESTED**. No secret, credential, connection string or personal data appears here.

| Item | Result |
|---|---|
| Private GitHub branch `feature/2026-10-14-monthly-configurable`, PR #2 (no force push; `main` untouched) | PASSED |
| Typecheck, lint · unit 105/105 · PostgreSQL integration 245/245 · HTTP acceptance 338 checks | PASSED |
| Brave E2E on a webpack production build (same bundler as the image): 31 passed, 2 skipped by design, 0 failed | PASSED |
| Previous release's own integration suite on the migrated schema (rollback compatibility): 234/236, the 2 differences are migration-count assertions only | PASSED |
| Image `griipbuddy-employee:58fd7afc3c23` = `sha256:957580760115…`, linux/amd64, built on the VPS with the memory-capped builder | PASSED |
| Pre-release backup `20261014-pre-58fd7af` (live, quiescent, 32 tables, 10 migrations); encrypted off-server copy verified (sha256 prefix `03d5809f63c2b2c7`) | PASSED |
| Restore drill into isolated project `griipbuddy-restore-58fd7af`: 32/32 digests equal live; migration rehearsed; 31/31 existing tables identical after migration; new image ready/login 200; previous image ready/login 200 on the migrated schema | PASSED |
| Cutover backup `20261014-cutover-58fd7af` (app stopped); encrypted off-server copy verified (sha256 prefix `e586610b35e6e8bd`) | PASSED |
| Migration `202610140011_dynamic_settings` applied atomically (10 → 11 migrations); runtime grants applied | PASSED |
| Data preservation: every existing table (31) has identical rows and values for all pre-existing columns, after migration and after app start | PASSED |
| Database container, documents volume and all non-image settings unchanged | PASSED |
| Live checks: `/login` 200, readiness ready, guest dashboard 307, guest API 401, `/brand/logo` 200, branded sign-in rendered in a browser | PASSED |
| Other hosted sites unchanged (all 200; `rental.innovgig.com` fails as before — its DNS does not point at this VPS) · 18 containers up · `nginx -t` OK | PASSED |
| Signed-in production acceptance | NOT TESTED — no production credentials or designated test records |

## What the migration did
Added columns with defaults (branding, rules, modules), two tables (`option_items`, `leave_allowances`), a nullable `salary_adjustments.category`, seeded the editable lists with every existing code, replaced fixed-value CHECKs with code-format CHECKs, converted `employee_documents.type` from enum to text (the enum type is kept for compatibility) and allowed open weekly-ledger months to move to the monthly method. No row was deleted or rewritten.

## Rollback
The previous release runs on the migrated schema (rehearsed), so rollback is application-only — no database restore:
```bash
R=/srv/griipbuddy-config/rollback-20261014-58fd7af
cp -p "$R/operator.env" /srv/griipbuddy-config/employee.env
ln -sfn "$(cat "$R/previous-release.txt")" /srv/griipbuddy-employee/current
cd /srv/griipbuddy-employee/current && docker compose --env-file /srv/griipbuddy-config/employee.env -p griipbuddy-employee -f docker-compose.hostinger.yml up -d --no-deps --no-build --wait employee-app
```

## Kept for the owner to decide
Stopped disposable restore projects `griipbuddy-restore-84d8ebc` and `griipbuddy-restore-58fd7af` (with their volumes), the stopped builder, the unused image `griipbuddy-employee:9188094262f9` and its release directory.
