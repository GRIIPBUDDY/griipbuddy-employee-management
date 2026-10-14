# Deployment guide

How to run the app on a Linux server with Docker and Nginx, release new versions safely, and back up, restore and roll back. The reference installation runs on a small Hostinger VPS (KVM 2) shared with other websites.

Replace `<your-domain>` with your own address, for example `hr.example.com`. The folder and project names below are the recommended layout; you can rename them consistently.

If the server hosts other websites and containers, everything here touches **only** the `griipbuddy-employee` project and your domain's route.

## 1. What runs where

| Piece | Location |
|---|---|
| Release folders | `/srv/griipbuddy-employee/releases/<RELEASE>`. `<RELEASE>` is the first 12 characters of the git commit; each folder has a `RELEASE_COMMIT` file. |
| Live release | `/srv/griipbuddy-employee/current`, a symlink to `releases/<RELEASE>` |
| Configuration and secrets | `/srv/griipbuddy-config/employee.env` (mode 0600, never in git) |
| Containers | Docker Compose project `griipbuddy-employee`, defined by `docker-compose.hostinger.yml`. `employee-db` is PostgreSQL 18 with no public port; `employee-app` is Next.js on `127.0.0.1:3100`. |
| Data | Docker volumes `employee-postgres` (database) and `employee-documents` (uploaded files) |
| Web traffic | Host Nginx, `/etc/nginx/sites-available/griipbuddy-employee.conf`, forwards `<your-domain>` to `127.0.0.1:3100`. Certificates come from Let's Encrypt (certbot). |
| Daily notifications | systemd `griipbuddy-employee-notifications.timer` (18:10 UTC), which runs `npm run notifications:due` in a one-off container |
| Backups | Recovery sets in `/srv/griipbuddy-recovery/<NAME>`, plus an encrypted copy off the server |
| Backup tools | `/srv/griipbuddy-config/tools/`: `node24` (Node.js 24) and `recovery-hostinger/` (see §5) |
| Image builder | Docker Buildx builder `griipbuddy-release1`. Stop it after each build. |

Shell helpers used below (run on the VPS as root):

```sh
CONF=/srv/griipbuddy-config/employee.env
NODE=/srv/griipbuddy-config/tools/node24
TOOLS=/srv/griipbuddy-config/tools/recovery-hostinger
app()   { docker compose --env-file "$CONF" -p griipbuddy-employee -f /srv/griipbuddy-employee/current/docker-compose.hostinger.yml "$@"; }
tools() { docker compose --env-file "$CONF" -p griipbuddy-employee -f /srv/griipbuddy-employee/current/docker-compose.hostinger.yml \
            -f /srv/griipbuddy-employee/current/docker-compose.tools.yml run -T --rm --no-deps --entrypoint node employee-app "$@"; }
psql_ro() { docker exec -i griipbuddy-employee-employee-db-1 sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
```

### Never do this on the VPS

- Never run `docker compose down -v`, `docker volume rm/prune`, `docker system prune`, `prisma migrate reset`, `prisma db push`, `DROP`, `TRUNCATE`, or delete release, recovery or volume directories.
- Never use `docker-compose.tools.yml` with `up`. It carries owner credentials and is for one-off commands only.
- Never stop, restart or reconfigure other projects' containers, the Docker daemon, or the whole of Nginx (`reload` is fine).
- Never commit `employee.env`, keys, backups or real employee data to git.
- Never re-run bootstrap on an existing installation.

## 2. Data fingerprint (used to prove nothing was lost)

This read-only query prints, for every table, its row count and a digest of all its rows. Save it on the server as `fingerprint.sql`. Run it before and after a change, then compare the outputs with `cmp`.

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format($f$SELECT %L, count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM %I.%I t;$f$, tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
COMMIT;
```

```sh
psql_ro < fingerprint.sql > before.tsv      # ... change ...      psql_ro < fingerprint.sql > after.tsv; cmp before.tsv after.tsv
```

## 3. Releasing a new version

Work in a dedicated folder per release, for example `W=/srv/griipbuddy-config/release-<DATE>-<RELEASE>` (create it with mode 0700).

**1. Check the release locally.** The type check, lint, unit, integration, HTTP and browser tests must all pass (see the README). Then check whether the release has database migrations:

```sh
git diff --stat <LIVE_COMMIT> <NEW_COMMIT> -- prisma/migrations
```

If nothing is listed, this is an **app-only** release. If migrations are listed, read their SQL. They must be additive and safe on existing data.

**2. Upload the source** into a new release folder, which must not already exist:

```sh
git archive --format=tar <NEW_COMMIT> | ssh <vps> 'set -e; R=/srv/griipbuddy-employee/releases/<RELEASE>; test ! -e $R; install -d -m 0755 $R; tar -xf - -C $R; echo <FULL_COMMIT> > $R/RELEASE_COMMIT'
```

**3. Build the image on the VPS** (linux/amd64) in the background, wait for it, then stop the builder:

```sh
cd /srv/griipbuddy-employee/releases/<RELEASE>
nohup docker buildx build --builder griipbuddy-release1 --platform linux/amd64 --load -t griipbuddy-employee:<RELEASE> . > $W/build.log 2>&1 &
docker image inspect griipbuddy-employee:<RELEASE> --format '{{.Id}} {{.Architecture}}'   # when finished; note the sha256 ID
docker buildx stop griipbuddy-release1
```

**4. Back up the live system** (the app keeps running) and copy the backup off the server, as described in §5. Do not continue until the off-server copy has been verified.

**5. Rehearse on a restored copy** (restore drill, §5):
- restore the backup into a throwaway project;
- confirm its fingerprint equals the live one;
- run the new image's migrations there (`migrate deploy` should say "No pending migrations" for an app-only release);
- start the new image and check `/api/health/ready` and `/login`.

For a migration release, also start the **previous** image on the migrated copy. That proves rollback is still possible.

**6. Save the current image for rollback:**

```sh
docker save griipbuddy-employee:<LIVE_RELEASE> -o /srv/griipbuddy-config/images/griipbuddy-employee-<LIVE_RELEASE>.tar
```

**7. Cut over** in a quiet period. Run the steps in order and stop at the first failure. If something fails, roll back (§4).

```sh
cp -p $CONF $W/employee.env.before; cp -p /etc/nginx/sites-available/griipbuddy-employee.conf $W/nginx.conf.before
readlink /srv/griipbuddy-employee/current > $W/previous-release.txt
docker inspect griipbuddy-employee-employee-app-1 --format '{{.Image}}' > $W/previous-image.txt
```

1. **Maintenance on (your domain only).** In the `server_name <your-domain>;` block, add these lines inside `location / {` and before `proxy_pass`:
   ```nginx
   default_type text/plain;
   add_header Retry-After 30 always;
   return 503 "The employee workspace is being updated. Please refresh shortly.\n";
   ```
   Then run `nginx -t && systemctl reload nginx`. Wait until `https://<your-domain>/login` returns 503.
2. **Pause the daily job:** `systemctl stop griipbuddy-employee-notifications.timer griipbuddy-employee-notifications.service`.
3. **Final backup:** with no one writing, run the backup again (§5) into `/srv/griipbuddy-recovery/<DATE>-cutover-<RELEASE>`, and save a fingerprint: `psql_ro < fingerprint.sql > $W/before.tsv`.
4. **Stop the app:** `app stop -t 30 employee-app`.
5. **Point the configuration at the new image.** Edit `$CONF` so that `EMPLOYEE_APP_IMAGE='sha256:<NEW_IMAGE_ID>'`. Change only that line.
6. **Switch the live release:**
   ```sh
   ln -s releases/<RELEASE> /srv/griipbuddy-employee/current.next && mv -Tf /srv/griipbuddy-employee/current.next /srv/griipbuddy-employee/current
   ```
7. **Migration release only:**
   ```sh
   tools node_modules/prisma/build/index.js migrate deploy
   tools --import tsx scripts/runtime-grants.ts
   ```
8. **Start the new app:** `app up -d --no-deps --no-build --wait --wait-timeout 150 employee-app`, then `curl -fsS http://127.0.0.1:3100/api/health/ready`.
9. **Check the data:** `psql_ro < fingerprint.sql > $W/after.tsv; cmp $W/before.tsv $W/after.tsv`. For an app-only release the two must be identical. For a migration release, only the intended new tables or rows may differ.
10. **Maintenance off:** `cp -p $W/nginx.conf.before /etc/nginx/sites-available/griipbuddy-employee.conf && nginx -t && systemctl reload nginx`. Wait until `https://<your-domain>/login` returns 200.
11. **Resume the daily job:** `systemctl start griipbuddy-employee-notifications.timer`.

**8. Verify and tidy up:**
- `https://<your-domain>/api/health/ready` returns 200 and `/login` returns 200;
- `docker logs --since 10m griipbuddy-employee-employee-app-1` shows no errors;
- every container is still `Up` (`docker ps`);
- the other sites on the VPS still respond;
- copy the cutover backup off the server (§5);
- sign in as an administrator and check the changed screens;
- keep the previous release folder and image until the new release has been accepted.

## 4. Rolling back

An application-only rollback is safe when the release had no migration. It is also safe when the previous image was proven on the migrated database during the restore drill.

```sh
cp -p $W/employee.env.before $CONF                      # restores the previous EMPLOYEE_APP_IMAGE
ln -sfn "$(cat $W/previous-release.txt)" /srv/griipbuddy-employee/current
app up -d --no-deps --no-build --wait employee-app
curl -fsS http://127.0.0.1:3100/api/health/ready
```

If the previous image is no longer loaded, run `docker load -i /srv/griipbuddy-config/images/griipbuddy-employee-<LIVE_RELEASE>.tar` first. Then restore the Nginx file, if maintenance is still on, and start the timer.

Never run a "down" migration or reset the database. If the data itself is damaged, restore a backup into a **new** project, verify it, and agree the switch-over with the owner (§5).

## 5. Backups and recovery

A **recovery set** contains:
- a PostgreSQL custom-format dump;
- every stored document file;
- a manifest with SHA-256 checksums;
- `deployment.json`, which records the snapshot time, release, image, PostgreSQL version and migrations.

The database alone does not restore documents. Configuration and keys are not part of the set; keep them separately in a password manager or vault.

**Tools.** The backup tool is `scripts/operations/recovery.mjs`. It always loads `docker-compose.yml` first, which suits development checkouts. A production server uses the standalone `docker-compose.hostinger.yml` instead, so install an adapted copy once, from any release folder:

```sh
install -d -m 700 $TOOLS
cp /srv/griipbuddy-employee/current/scripts/operations/recovery*.mjs $TOOLS/
sed -i "s/files:\['docker-compose.yml'\]/files:[]/" $TOOLS/recovery.mjs   # use only the --compose-file given
```

`$NODE` is a Node.js 24 binary kept next to the tools. Copy one from the official Node.js download, or use a system Node.js 24.

**Create and verify a backup.** Use a new directory every time; existing sets are never overwritten.

```sh
cd /srv/griipbuddy-employee/current
SET=/srv/griipbuddy-recovery/<DATE>-pre-<RELEASE>
psql_ro < fingerprint.sql > $W/before-backup.tsv       # compared with the restore drill below
$NODE $TOOLS/recovery.mjs backup --project griipbuddy-employee --env-file $CONF --compose-file docker-compose.hostinger.yml --directory $SET --release <LIVE_RELEASE>
$NODE $TOOLS/recovery.mjs verify --project griipbuddy-employee --env-file $CONF --compose-file docker-compose.hostinger.yml --directory $SET
(cd $SET && find . -type f -print0 | sort -z | xargs -0 sha256sum) > $W/backup-files.sha256
```

**Copy it off the server, encrypted.** This runs on the operator's computer and uses [age](https://age-encryption.org). Keep the private key offline.

```sh
N=<DATE>-pre-<RELEASE>
ssh <vps> "cat $W/backup-files.sha256" > $N.files.sha256
ssh <vps> "tar -C /srv/griipbuddy-recovery -cf - $N" | age -r "$(cat recipient.txt)" -o $N.tar.age
mkdir verify && age -d -i backup-age.key $N.tar.age | tar -xf - -C verify && (cd verify/$N && shasum -a 256 -c ../../$N.files.sha256) && rm -rf verify
```

A backup only counts once the off-server copy has been decrypted and every checksum shown as `OK`.

**Restore drill.** This restores into a throwaway project and never touches production.

1. Create a drill folder `/srv/griipbuddy-config/drills/restore-<RELEASE>` containing copies of `docker-compose.hostinger.yml` and `docker-compose.tools.yml` from the release.
2. Write `$W/restore.env` (mode 0600) with these values:
   - `COMPOSE_PROJECT_NAME=griipbuddy-restore-<RELEASE>`;
   - a free port, for example `APP_PORT=3195`;
   - `APP_BASE_URL=http://127.0.0.1:3195` and `ALLOW_LOCAL_HTTP=true`;
   - new random `AUTH_SECRET`, `POSTGRES_PASSWORD` and `POSTGRES_APP_PASSWORD` (`openssl rand -hex 32` each);
   - the same `POSTGRES_DB` and `POSTGRES_USER` as production;
   - `EMPLOYEE_APP_IMAGE` set to the `image` recorded in the set's `deployment.json`;
   - empty email settings.
3. Run:
   ```sh
   cd /srv/griipbuddy-config/drills/restore-<RELEASE>
   drill() { docker compose --env-file $W/restore.env -p griipbuddy-restore-<RELEASE> -f docker-compose.hostinger.yml "$@"; }
   drill up -d --no-build --pull never --wait employee-db
   $NODE $TOOLS/recovery.mjs restore-drill --project griipbuddy-restore-<RELEASE> --env-file $W/restore.env --compose-file docker-compose.hostinger.yml --directory $SET
   docker exec -i griipbuddy-restore-<RELEASE>-employee-db-1 sh -c 'exec psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < fingerprint.sql > $W/restore.tsv
   cmp $W/before-backup.tsv $W/restore.tsv      # fingerprint taken just before the backup; must be identical
   ```
4. To test a new release on the copy:
   - set `EMPLOYEE_APP_IMAGE` in `restore.env` to the new image;
   - run `migrate deploy` and `runtime-grants.ts` through `docker compose ... -f docker-compose.tools.yml run -T --rm --no-deps --entrypoint node employee-app ...` against the drill project;
   - run `drill up -d --no-build --pull never --no-deps --wait employee-app`;
   - check `curl http://127.0.0.1:3195/api/health/ready`;
   - finish with `drill stop`.

The tool refuses to restore into the live project or into a database that is not empty. Keep drill projects stopped. Removing them is a separate, deliberate decision: check the project name first and never use global pruning.

**Retention.** Nothing is deleted automatically. A suggested schedule is 7 daily, 4 weekly and 6 monthly encrypted sets, plus each release's pre-release and cutover sets until that release is accepted.

## 6. First installation on a new server

Only for an empty server. An existing installation is updated with §3 instead.

1. **Check the server:**
   - look for free ports, and check that ports 80/443 are owned by the host Nginx;
   - check the disk space;
   - check the architecture with `uname -m`: `x86_64` means `linux/amd64`.
   - Never reinstall the operating system: other sites live on it.
2. **Upload and build.** Upload the source to `/srv/griipbuddy-employee/releases/<RELEASE>` and build the image (§3, steps 2–3). Then create the symlink: `ln -s releases/<RELEASE> /srv/griipbuddy-employee/current`. The database container mounts `current/docker/init-runtime.sh`, which creates the runtime database user on first start.
3. **Create the configuration:**
   ```sh
   install -d -m 700 /srv/griipbuddy-config
   install -m 600 /srv/griipbuddy-employee/current/.env.production.example $CONF
   ```
   Then fill it in:
   - `COMPOSE_PROJECT_NAME=griipbuddy-employee`, `APP_PORT=3100`, `APP_BASE_URL=https://<your-domain>` and `ALLOW_LOCAL_HTTP=false`;
   - `EMPLOYEE_APP_IMAGE='sha256:<IMAGE_ID>'`;
   - `POSTGRES_DB` and `POSTGRES_USER`;
   - separate `openssl rand -hex 32` values for `AUTH_SECRET`, `POSTGRES_PASSWORD` and `POSTGRES_APP_PASSWORD`;
   - for the first start only, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters.
4. **Initialize and start:**
   ```sh
   app up -d --no-build --wait employee-db
   tools node_modules/prisma/build/index.js migrate deploy
   tools --import tsx scripts/runtime-grants.ts
   tools --import tsx scripts/bootstrap.ts          # first installation only
   app up -d --no-build --wait employee-app
   curl -fsS http://127.0.0.1:3100/api/health/ready
   ```
5. **Web traffic:**
   - add an Nginx server block for `<your-domain>` that proxies `location /` to `http://127.0.0.1:3100`;
   - preserve the `Host` and `X-Forwarded-*` headers, and set `client_max_body_size 16m` (documents are limited to 10 MB);
   - point the domain's DNS A record at the VPS;
   - issue the certificate with `certbot --nginx -d <your-domain>`, redirecting HTTP to HTTPS;
   - finish with `nginx -t && systemctl reload nginx`.
6. **Daily notifications:** create the systemd service, a oneshot with `WorkingDirectory=/srv/griipbuddy-employee/current` running `docker compose --env-file /srv/griipbuddy-config/employee.env -p griipbuddy-employee -f docker-compose.hostinger.yml run --rm --no-deps employee-app npm run notifications:due`. Then add a daily timer and enable it.
7. **Hand over:**
   - sign in at https://<your-domain> with the bootstrap administrator and change its password;
   - remove the `BOOTSTRAP_ADMIN_*` values from the configuration file;
   - in Settings, check the company name, timezone (Asia/Dhaka), currency (BDT) and pay rules;
   - take the first backup (§5).

## 7. Health checks

- `/api/health/live`: the process is running.
- `/api/health/ready`: the database is reachable and document storage is writable. The container's own health check uses it every 15 seconds.
- Sign-in, protected pages and APIs: without a session, pages redirect to `/login` (307) and APIs answer 401 with `Cache-Control: private, no-store`.
- Container logs rotate automatically (3 × 10 MB per service).
