# Hostinger deployment record — griipbuddy.cloud

Source repository: https://github.com/nahianahmed3832/griipbuddy-employee-management (private).

The server is 72.60.107.88, Ubuntu 24.04, x86_64, with Docker 29.1.3 and Compose 5.0.1. Inspection found 16 existing application containers and host Nginx/Certbot on ports 80/443. This deployment adds only the dedicated `griipbuddy-employee` Compose project and its own hostname route.

## Isolation and release

Source release: `655691b1a7cb82cdbd8ed2a8f41224a334515c1b`. Server releases live under `/srv/griipbuddy-employee/releases`; `current` identifies the active source. The application binds to `127.0.0.1:3100`. PostgreSQL has no published port. Application and database storage use separate named volumes.

The protected operator configuration is `/srv/griipbuddy-config/employee.env` (0600 inside a 0700 directory). It is excluded from GitHub. The application receives only its restricted database credentials, authentication secret and public/runtime settings; database-owner and initial-password credentials are one-off tools only.

The normal application runs as UID 1000 with a read-only root filesystem, private document storage, dropped capabilities and no-new-privileges. Memory limits are 768 MiB for the app and 512 MiB for PostgreSQL. Log rotation is enabled.

Local AMD64 CPU emulation crashed in the native Next.js compiler. The release is built natively on the VPS using a dedicated BuildKit container limited to one CPU and 2.5 GiB RAM; the existing application containers stay running. Builder cleanup affects only this deployment's builder. No GitHub deployment credential was added: automatic approval review rejected a proposed repository write key, so the build uses existing authorized VPS access.

## Fresh installation

The production database is initialized without copying local users, employee profiles, HR accounts, salary records or private documents. Only the initial Admin account `nahian@griipbuddy.com` is provisioned. Its supplied temporary password requires a change at first login. Bootstrap credentials are removed from the operator environment after account creation.

Admin creates HR accounts from **User accounts → Create account → Role: HR / Manager**. The optional employee profile checkbox should be cleared for a login-only HR account; keep it selected and fill employee fields if HR also needs attendance and personal salary features. HR can manage employee profiles but account/login provisioning remains Admin-only.

Organization defaults: BDT, Asia/Dhaka, Monday workweek, 48-hour weekly overtime threshold. Positive overtime still requires approval. Salary coverage retains calendar-day employment proration, approved paid leave and paid holidays.

## Validation

Before release: 84 unit tests, 207 PostgreSQL integration tests (including the updated migration-count check), production webpack build, type checking and lint. The disposable production HTTP suite passed 331 checks using real Auth.js cookies and PostgreSQL. No destructive test suite runs against production.

## Server acceptance and pending publication

Image: `sha256:104c866530f3be279ecf65209036873d07fee9d04dc5a5746b28ea6afe894aaf`, AMD64; native argon2/sharp modules verified. PostgreSQL uses the pinned 18.4 Bookworm image in Compose. All 10 migrations and restricted runtime grants succeeded.

Application and database containers are healthy. Loopback readiness returns `ready`, and the login page returns HTTP 200. Database verification found exactly one user/Admin, zero HR users, zero employees and zero documents, with BDT/Asia-Dhaka defaults and a 172800-second weekly overtime threshold. Bootstrap fields were cleared from the protected Compose environment.

The daily due-notification timer is installed for 18:10 UTC (00:10 Asia/Dhaka), with advisory-lock/deduplication protection. Its first run succeeded with zero records processed. The existing griipbuddy.com website still returns HTTP 200.

The hostname-specific HTTP route is installed for ACME validation and redirects to HTTPS. At the time of this record, the DNS A record still points to 2.57.91.91. The proposed A-record target is 72.60.107.88; the www CNAME remains griipbuddy.cloud. DNS publication awaits the browser policy's action-time confirmation; the new HTTPS certificate and final public-origin checks follow that change.

An off-server backup/restore proposal was blocked by automatic approval review because the export would transfer the Admin password hash and private account data from the VPS to the Mac without explicit payload/destination approval. No export was performed. The user was asked to approve an encrypted copy in the ignored private local backup directory. Automatic offsite backups and the optional production email-delivery adapter are not configured.

