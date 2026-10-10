# Deployment preparation — Phase 3H

This is a reviewed procedure for a later, explicitly authorized deployment to the existing Hostinger KVM 2 VPS. **No live deployment, host inspection, DNS, proxy, firewall or scheduler change was performed in Phase 3H.** Read the [readiness report](DEVELOPMENT_REPORT.md) and [recovery procedure](BACKUP_RECOVERY.md) before proceeding.

## Release and shared-host prerequisites

1. Establish the owner's private GitHub repository and reviewed release. Phase 4A initialized local `main` and created the reviewed source commit; see [the release setup report](RELEASE_SETUP_REPORT_PHASE_4A.md) for its identity, secret review and remaining access gates. GitHub visibility, permissions and push remain blocked until owner authentication is available. Do not invent a remote release or push credentials/employee data. Ignore rules cover local tooling, environment files, private files and recovery artifacts.
2. Build and validate the image from that exact commit away from production. Keep the image digest, commit, lockfile, Compose files, eight migration names, PostgreSQL major and operator approval in the release record. The production override requires `EMPLOYEE_APP_IMAGE`; use a registry digest, or a locally loaded immutable release tag with its recorded image ID. The local ARM64 QA image does not prove compatibility with the VPS CPU architecture. Build/test the correct target architecture before launch.
3. Inspect the existing VPS read-only: available disk/RAM/CPU, Docker/Compose version, CPU architecture, published ports, container names/projects, existing reverse proxy, certificate manager, networks, storage and backup arrangement. Do not stop or reconfigure other applications. Set an explicit dedicated project name; do not use `--remove-orphans` across projects, global pruning, `down -v`, database reset or schema push.
4. Select a free loopback application port after inspection. The sample 3100 is not a reservation. PostgreSQL has no published port. Only the application joins the frontend network; the database is on an internal backend network. Compose service DNS resolves `employee-db` within its project network. [Docker networking documentation](https://docs.docker.com/compose/how-tos/networking/).
5. Reserve enough resources for the other services: the current app cap is 768 MiB/1 CPU and DB 512 MiB/1 CPU; build/migration/backup tools consume additional resources. Validate capacity with realistic employee/report/document load. These limits are configuration, not a VPS load-test result.

## Protected configuration

Copy `.env.production.example` to an absolute operator-owned file **outside the checkout**, for example `/srv/griipbuddy-config/employee.env`, in a 0700 directory with file mode 0600. Replace all placeholders. Generate different random hex secrets for owner DB password, runtime DB password and `AUTH_SECRET` (e.g. `openssl rand -hex 32`). Hex passwords avoid URL-encoding errors. Store configuration and encryption/recovery keys in an approved encrypted vault, separately from recovery sets.

- `APP_BASE_URL=https://hr.griipbuddy.com` must be the actual canonical browser origin. `ALLOW_LOCAL_HTTP=false` in production. Compose sets `AUTH_URL` to the same origin. The approved domain still needs owner/DNS/certificate verification.
- `APP_PORT` is the selected loopback port; `COMPOSE_PROJECT_NAME` identifies only this application. `EMPLOYEE_APP_IMAGE` is the reviewed image identity.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_APP_PASSWORD` are Compose/operator inputs. The normal app receives only `DATABASE_URL` using `employee_runtime`; it never receives owner or bootstrap variables.
- `BOOTSTRAP_ADMIN_*` is for a fresh first installation only. Remove the temporary values after the first password change. Bootstrap refuses existing users.
- App runtime also receives `NODE_ENV=production`, UTC process time and `/app/private/documents`. Private bytes persist in the dedicated document volume; database bytes persist in the PostgreSQL volume. Changing process UTC does not change organization-local business dates.
- Normal startup fails on weak session secrets, noncanonical/mismatched origins, non-HTTPS nonlocal origins, an owner database URL, or injected owner/bootstrap settings. One-off tools use `docker-compose.tools.yml` and bypass the app entrypoint intentionally. **Never use the tools override with `up`.**
- Initializer credentials only affect a new empty PostgreSQL volume. Editing the environment file does not rotate passwords in an existing database. Rotation needs coordinated owner `ALTER ROLE`, protected configuration replacement, app restart and verification. Rotating `AUTH_SECRET` logs out existing sessions.

## Commands for a later authorized release

Run from the reviewed checkout using a privileged operator account. Define nonsecret paths and a command wrapper; do not print resolved Compose configuration because it includes secrets.

```sh
employee_env=/srv/griipbuddy-config/employee.env
employee_project=griipbuddy-employee
employee_compose() {
  docker compose --env-file "$employee_env" --project-name "$employee_project" \
    -f docker-compose.yml -f docker-compose.release.yml "$@"
}
employee_compose config --quiet
```

Before changing an existing installation, create a consistent database/document recovery set, encrypt it, verify offsite transfer and perform the restore drill in [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md). Record its snapshot time, image and migration version. Schedule a quiet maintenance window; stop this application's writers and daily job while changing schema. Do not stop the shared proxy or another project. Inspect pending migration SQL and compare the existing `_prisma_migrations` history with the release. Never edit an already-applied migration or auto-resolve a failed migration.

For first installation only, start the dedicated database and wait for its health check. An existing installation keeps its volume and database.

```sh
employee_compose up -d --no-build --wait employee-db
employee_compose -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:migrate
employee_compose -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:runtime-grants
# Fresh user table only; omit on every upgrade:
employee_compose -f docker-compose.tools.yml run --rm --no-deps employee-app npm run db:bootstrap
employee_compose up -d --no-build --wait employee-app
employee_compose ps
```

Migration and grant commands must succeed before the app starts. Runtime does not migrate automatically. Fresh migrations and populated upgrades have local automated coverage; Phase 3H adds no migration. For an unexpected failed migration, leave the app isolated, preserve logs and the pre-change recovery set, and investigate with the owner; do not reset/drop the database.

## Existing proxy, domain and SSL checklist

Inspect before selecting a proxy method. A host-based proxy can route to the chosen loopback port. A container proxy cannot reach the host via its own `127.0.0.1`; after inspection, an operator may attach **only the app** to the existing designated ingress network under a reviewed override and use its project-specific alias on port 3000. Do not attach PostgreSQL to ingress, publish PostgreSQL, start another proxy on occupied 80/443, or replace global proxy configuration.

The later operator must verify domain ownership and A/AAAA records, route only this hostname, preserve the browser Host and trusted forwarded protocol/host, use HTTPS and redirect HTTP, renew certificates with the existing certificate manager, and bypass proxy/CDN caching for authenticated pages/API/downloads. Configure an upload body allowance compatible with the 10 MiB file limit plus multipart overhead; application validation still enforces it. Bound request timeouts/concurrency and add proxy rate limits if required by host policy. Test security headers, Secure/HttpOnly/SameSite cookies, origin-protected mutations and downloads through the **actual HTTPS proxy**. Add HSTS only after the owner confirms hostname/subdomain policy and working HTTPS. No proxy/domain assumptions have been executed here.

## Health, acceptance and scheduling

`/api/health/live` checks the running process. `/api/health/ready` checks DB connectivity and writable private storage and returns no internal configuration. Compose waits for DB health; app checks readiness every 15 seconds after a 30-second start period. Test both endpoints through loopback and the final HTTPS origin, login/logout/password change, each role, one authorized document download, rejected foreign/private downloads, one schedule/attendance workflow and report export. Do not use the destructive disposable HTTP smoke script on production.

Confirm the first Admin password change, company timezone, employment dates and mandatory overtime approval policy. Run a shadow salary closeout with explicit expected monetary values and owner sign-off before issuing real payroll. Production volumes, approved schedules and finalized salaries require the documented retention rules. Monitor app/DB health, disk, backup age and redacted errors. Rotation of Docker logs is configured (three 10 MiB files per service).

After separate owner approval, schedule a nonoverlapping daily one-off job with normal runtime credentials:

```sh
employee_compose run --rm --no-deps employee-app npm run notifications:due
```

It uses a DB advisory lock and event-key deduplication. Schedule the recovery tool separately with protected operator privileges and alert on failures or stale offsite backup status. Do not put secrets in cron command arguments or capture resolved environment output. No scheduler is installed in this phase.

## Rollback and disaster recovery

Keep the previous tested image digest and configuration. Application-only rollback is permitted only after verifying the current schema and data remain compatible with that image. Set its image identity in protected configuration and recreate **employee-app only** with `up -d --no-build --wait employee-app`; preserve all volumes. Verify readiness and role/document acceptance again. Do not guess that an older image supports newer records or constraints. Do not run migration down, database reset, `down -v` or global cleanup.

An incompatible schema or corrupted data requires a separately approved disaster-recovery decision. Preserve the current incident state; choose a verified encrypted recovery set; quantify writes after its snapshot; restore to a new isolated project and prove integrity before proposing cutover. The provided tool intentionally refuses restoration into the existing production project. Production cutover is an owner-authorized later procedure. Rotate `AUTH_SECRET` and invalidate restored sessions before reopening any restored production instance, coordinate DB/config credentials, verify every role and file, and ensure only one writable live instance and one scheduled job. Local restore timing is not a guaranteed production RTO/RPO.

## Launch gates

- [ ] Private GitHub repository, reviewed commit, secret-history check and immutable target-architecture image.
- [ ] Owner review of Phase 3H results, business rules and shadow payroll.
- [ ] Read-only shared VPS capacity/port/proxy/network inspection.
- [ ] Protected real configuration, account and credential handover.
- [ ] Verified encrypted off-server backup plus isolated restore using the release image.
- [ ] Reviewed migration plan and compatible previous-image rollback or approved DR plan.
- [ ] Working domain, SSL renewal and real proxy security acceptance.
- [ ] Health/backup monitoring, approved daily job and manual retention policy.
- [ ] Explicit authorization for the deployment phase.

Stop at preparation until these gates and owner approval are satisfied.
