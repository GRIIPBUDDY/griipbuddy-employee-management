# Protected backup and disposable recovery

Recovery consists of the PostgreSQL custom-format dump, **all retained private document bytes** (including soft-deleted documents), document references/hashes, image/release/migration metadata and separately protected configuration. A database dump alone does not recover employee documents. The tool never uploads offsite, records backup success or deletes old backups automatically.

## Consistency and privileges

Use Node 24 and Docker Compose on a trusted operator host, from the reviewed checkout. Docker access effectively grants host/container administration; do not give this tool or Docker socket to ordinary employees or expose it through HTTP. The private Compose environment file must have mode 0600. The tool uses the owner credentials already held by the PostgreSQL container for `pg_dump`; it never injects them into the normal app or passes literal passwords in host CLI arguments. Do not log `compose config`, environment contents or process credentials.

`pg_dump --format=custom --no-owner --no-acl` obtains a consistent database snapshot without requiring ordinary application writes to stop. [PostgreSQL backup documentation](https://www.postgresql.org/docs/18/backup-dump.html). The tool holds shared document-deletion lock `73102302` from before the dump through file copying and durability checks. Normal uploads use the same shared lock and immutable, fsynced UUID files; deletion cleanup needs the exclusive lock. Soft deletion retains file bytes. The manifest checks every retained document reference, not only downloadable/live documents. Files uploaded after the snapshot can safely be extra files; no document referenced by the dump may be missing. Temporary `.tmp` publications are excluded. Do not run migrations, owner SQL deletion, manual volume cleanup or out-of-band file changes during backup. A contended deletion lock or ten-minute lock deadline fails safely; investigate size/duration before changing limits.

The output directory must be new, outside the checkout/public/build directories, under a real private parent. It is created 0700 with regular 0600 artifacts. Existing recovery sets are never overwritten. SHA-256 checks cover dump, metadata, manifest and every final document file; dump structure is checked with `pg_restore --list`. Completed sets have `status=LOCAL_VALIDATED` and `offsiteVerified=false`. Failures leave `INCOMPLETE`, which verification/restore rejects. Checksums detect accidental corruption; trust/authenticity must come from protected ownership and authenticated encryption/offsite controls.

## Create and verify a recovery set

Example paths identify a **later authorized** project. Choose the real release identity and a new dated directory; never reuse or overwrite an older set. Parent directory creation and secret provisioning are operator tasks.

```sh
umask 077
mkdir -p /srv/griipbuddy-recovery
chmod 700 /srv/griipbuddy-recovery
node scripts/operations/recovery.mjs backup \
  --project griipbuddy-employee \
  --env-file /srv/griipbuddy-config/employee.env \
  --compose-file docker-compose.release.yml \
  --directory /srv/griipbuddy-recovery/NEW-UTC-RELEASE-ID \
  --release REVIEWED-COMMIT-ID
node scripts/operations/recovery.mjs verify \
  --project griipbuddy-employee \
  --env-file /srv/griipbuddy-config/employee.env \
  --compose-file docker-compose.release.yml \
  --directory /srv/griipbuddy-recovery/NEW-UTC-RELEASE-ID
```

`deployment.json` records a conservative database snapshot time immediately before `pg_dump`, completion time, source project, release, application image ID, PostgreSQL major and applied migration names. Preserve the exact source/Compose/lockfile alongside the immutable release, and keep configuration and keys in the encrypted vault. Database globals/passwords are not dumped; recreate `employee_runtime` with the initializer and reapply reviewed grants. The target DB major must match the recorded major; cross-major/architecture recovery requires a separately tested plan.

Encrypt the entire recovery set with the organization's approved authenticated encryption tool before leaving the private operator host. Transfer to access-controlled **off-server** storage, restrict decrypt keys to designated recovery operators, verify the remote object, download/decrypt a sample or full set into a protected directory and rerun validation. A local dump or provider upload receipt alone is insufficient. Record the actual recovered snapshot time and recovery-set ID only after encrypted transfer and integrity verification. Avoid using completion time as the recovery point.

The existing `organization_settings.last_successful_backup_at` represents the last **verified offsite snapshot**, and Admin settings displays missing/current/stale (>24 hours) status. This is a signal, not proof that recovery succeeded. A trusted owner operation may record the verified timestamp with an append-only audit event; ordinary UI users cannot mark a backup successful. Example SQL to adapt **only after real offsite verification**, not performed by the tool:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(73102301);
UPDATE organization_settings
SET last_successful_backup_at = TIMESTAMPTZ 'VERIFIED-SNAPSHOT-UTC', updated_at = clock_timestamp()
WHERE id = 1;
INSERT INTO audit_logs(id, system_source, action, entity, entity_id, request_id, after)
VALUES(gen_random_uuid(), 'backup-operator', 'BACKUP_OFFSITE_VERIFIED',
       'organization_settings', '1', gen_random_uuid(),
       jsonb_build_object('recoverySetId', 'VERIFIED-SET-ID', 'snapshotAt', 'VERIFIED-SNAPSHOT-UTC'));
COMMIT;
```

No passwords, employee contents, encryption keys or private storage locations belong in the audit payload. Set alerts for a failed run or stale/missing status; a future timestamp must never be supplied as success evidence.

## Actual disposable restore drill

Use only a new `griipbuddy-restore-*` project, a distinct private environment file, the exact recorded application image, new named volumes and the same PostgreSQL major. Initially start **only its database**. Choose a distinct/free loopback app port and local loopback origin with `ALLOW_LOCAL_HTTP=true` for the isolated drill. Never copy a production hostname onto an externally reachable restored instance. Prevent real email/third-party integrations, ingress and scheduled jobs. All existing tooling is one-off; no new service is required.

```sh
docker compose --env-file /srv/griipbuddy-config/restore.env \
  --project-name griipbuddy-restore-REVIEW-ID \
  -f docker-compose.yml -f docker-compose.release.yml \
  up -d --no-build --wait employee-db
node scripts/operations/recovery.mjs restore-drill \
  --project griipbuddy-restore-REVIEW-ID \
  --env-file /srv/griipbuddy-config/restore.env \
  --compose-file docker-compose.release.yml \
  --directory /srv/griipbuddy-recovery/VERIFIED-SET-ID
```

The tool rejects the source project, other project prefixes, nonempty public schema and nonempty document volume. It does not reset/drop/truncate anything. It checks image and PostgreSQL identities; restores with `--exit-on-error --single-transaction --no-owner --no-acl`; runs `ANALYZE`; reapplies grants; publishes each file without overwriting a key; and verifies every restored DB document reference and byte hash. Use only trusted dumps: restoration executes SQL held in the archive. [PostgreSQL restore documentation](https://www.postgresql.org/docs/18/app-pgrestore.html). A failed drill remains isolated; diagnose it instead of retrying with an overwrite/reset flag.

After integrity verification, compare all domain-table counts/digests, migration state, immutable salary totals, notification read state and append-only audit history with the source snapshot. Rotate the drill `AUTH_SECRET` to invalidate copied session cookies before any access. Start its app locally and test authorized downloads, private/deleted/foreign denials and role/commission revocation. Record actual elapsed times and evidence; repeat periodically and before a significant release. Do not confuse local synthetic recovery evidence with production offsite recovery evidence.

If cleanup is authorized, confirm the project and volumes belong solely to this disposable drill before removing them. Never apply its cleanup command to a live/source project or use global volume pruning. Production cutover is outside this script and requires an approved data-loss/cutover/session-invalidation plan in [DEPLOYMENT.md](DEPLOYMENT.md).

## Retention and incident handling

Proposed retention for owner approval: seven daily, four weekly and six monthly verified encrypted sets, plus the pre-release set until that release is accepted. Confirm organizational employee/document retention, storage budget and recovery objectives before adopting it. **No automatic retention deletion is implemented.** An operator verifies a newer restorable offsite set and reviews legal/incident holds before manually removing an eligible old set. Keep decrypt keys and release images for every retained set.

If backup fails, keep the incomplete set private, alert the operator and preserve prior verified sets. If corruption is found, do not silently replace the manifest/checksum to make verification pass; investigate the source/file-storage incident. No local test establishes production recovery time or acceptable data loss. The owner must agree RTO/RPO after target-host timing and a real offsite roundtrip.
