# Manual Hostinger deployment — griipbuddy.cloud

Canonical application address: **https://griipbuddy.cloud**. The existing griipbuddy.com website uses a different domain and should keep its existing configuration.

This guide describes a fresh installation on the existing Hostinger KVM 2 VPS. The organization defaults to BDT and the payroll screens display ৳. Build and verify the selected immutable release image before deploying; a source archive alone is not a running release. Local users, credentials, employee records, database files and uploaded documents are not included. For an existing installation, follow [deployment.md](deployment.md) and [backup-recovery.md](backup-recovery.md) instead of repeating bootstrap.

## 1. Inspect the VPS first

Open hPanel → VPS → Manage → Web Console. These are VPS host commands, not commands inside an application container. Use an operator account with Docker access and sudo where needed.

```sh
uname -m
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
docker network ls
ss -lnt
free -h
df -h
```

Identify the existing reverse proxy and its Docker network, HTTPS entrypoint/certificate resolver if Traefik, and who owns ports 80/443. Select a free application loopback port; 3100 below is only an example. Keep existing applications running. Do not reinstall the VPS operating system to obtain Docker Manager: reinstalling can erase its applications. If Docker Manager is already present, use the existing installation.

For builds, x86_64 means linux/amd64 and aarch64 means linux/arm64. Build outside a shared live VPS to avoid competing with its applications.

## 2. Prepare and upload source

Use the prepared griipbuddy-cloud-source ZIP, or copy the reviewed source yourself. A source upload needs src, prisma, scripts, docker, Dockerfile, package.json, package-lock.json, the build/config files and the Compose files. Include .dockerignore. Omit node_modules, .next, .git, .local, generated Prisma output, real .env files, private documents and database/recovery archives. Dependencies and Prisma output are rebuilt in Docker.

Use FileZilla or Cyberduck with **SFTP**:

- Host: VPS IP address from hPanel.
- Port: the configured SSH port, commonly 22.
- User: your VPS SSH username.
- Authentication: your configured SSH key, or VPS SSH password entered in the SFTP client.

Verify the SSH host fingerprint against trusted VPS information. Upload the ZIP to your operator account's home directory, not public_html. On the VPS, extract to a **new empty directory**, then move its enclosed griipbuddy-cloud-source directory to /srv/griipbuddy-employee. Do not extract over an existing release. Use the VPS archive tool (unzip for ZIP files); sudo may be required for /srv. The Compose files must be directly inside /srv/griipbuddy-employee.

The ZIP is source only. Uploading it does not create running containers or copy your local employee data.

Hostinger SFTP instructions: https://www.hostinger.com/support/8868611-how-to-connect-to-vps-using-sftp-at-hostinger/

## 3. Build an image away from the live VPS

On your Mac or a build machine with Docker, from the final reviewed source directory:

```sh
# Example target only: use the architecture found in step 1.
docker buildx build --platform linux/amd64 --load \
  -t griipbuddy-employee:cloud-20261011 .
docker image inspect griipbuddy-employee:cloud-20261011 \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}'
docker save -o griipbuddy-cloud-image.tar \
  griipbuddy-employee:cloud-20261011
```

Use a new release tag for later releases and record the image ID and source identity. Validate this target-architecture image in an isolated environment before launch. The previously tested local Mac image is not evidence for a different architecture.

Upload griipbuddy-cloud-image.tar with SFTP. In the VPS Web Console, load it using its actual uploaded path:

```sh
docker load -i ~/griipbuddy-cloud-image.tar
docker image inspect griipbuddy-employee:cloud-20261011 \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

Compare with the build-machine image identity. This route needs neither GitHub nor a container registry. Source upload alone is not enough: the image is required by the following --no-build commands.

If you build from the uploaded source on another isolated server instead, use the same Dockerfile and lockfile, then transfer the resulting tested image. Do not build on a shared production VPS without confirming capacity and scheduling its resource use.

## 4. Create protected production configuration

On the VPS:

```sh
cd /srv/griipbuddy-employee
sudo install -d -m 700 /srv/griipbuddy-config
sudo install -m 600 .env.production.example \
  /srv/griipbuddy-config/employee.env
sudo nano /srv/griipbuddy-config/employee.env
```

The commands in this guide assume the operating account can read that file and access Docker (for example through an authorized root Web Console). For a non-root deployment operator, set ownership of the private directory/file to that operator; preserve 0700/0600 permissions.

Replace every required placeholder. Key values:

```dotenv
COMPOSE_PROJECT_NAME=griipbuddy-employee
APP_PORT=3100
APP_BASE_URL=https://griipbuddy.cloud
ALLOW_LOCAL_HTTP=false
EMPLOYEE_APP_IMAGE=griipbuddy-employee:cloud-20261011
POSTGRES_DB=griipbuddy_employee
POSTGRES_USER=employee_owner
BOOTSTRAP_ADMIN_EMAIL=YOUR_REAL_ADMIN_EMAIL
BOOTSTRAP_ADMIN_NAME=Administrator
```

Set separate random hex values for AUTH_SECRET, POSTGRES_PASSWORD and POSTGRES_APP_PASSWORD; generate each separately with openssl rand -hex 32 and enter it privately into the configuration file. Set a unique initial Admin password of at least 12 characters. Do not use passwords shown in an example or local demo. Do not upload the real configuration to GitHub, place it in the source checkout, paste it in chat or pass it as a global app env_file.

The base Compose file forwards only the runtime credentials to the application. The owner and bootstrap credentials are for one-off tools. Normal startup rejects owner/bootstrap credentials in the app environment. Editing PostgreSQL password settings later does not change an existing database role's password.

## 5. Initialize and start this application's containers

In the VPS Web Console, from the uploaded source directory:

```sh
cd /srv/griipbuddy-employee
employee_compose() {
  docker compose \
    --env-file /srv/griipbuddy-config/employee.env \
    --project-name griipbuddy-employee \
    -f docker-compose.yml -f docker-compose.release.yml "$@"
}

employee_compose config --quiet
employee_compose up -d --no-build --wait employee-db
employee_compose -f docker-compose.tools.yml \
  run --rm --no-deps employee-app npm run db:migrate
employee_compose -f docker-compose.tools.yml \
  run --rm --no-deps employee-app npm run db:runtime-grants
# Fresh installation only: skip this command on every upgrade.
employee_compose -f docker-compose.tools.yml \
  run --rm --no-deps employee-app npm run db:bootstrap
employee_compose up -d --no-build --wait employee-app
employee_compose ps
curl -f http://127.0.0.1:3100/api/health/ready
```

Run sequentially and stop on any failure. Replace the curl port if you selected another port. Keep both named volumes. Never use docker-compose.tools.yml with up; never reset the database or run down -v. Bootstrap initializes a fresh database with one Admin account and a BDT organization default; it does not import local users or business records.

## 6. Point griipbuddy.cloud at the VPS

In the domain's authoritative DNS provider, open the DNS records for griipbuddy.cloud. If Hostinger is the authoritative provider, use its domain DNS / nameserver settings. Registration at Hostinger does not by itself prove Hostinger manages DNS.

| Type | Name | Value |
| --- | --- | --- |
| A | @ | VPS public IPv4 address |

If you want www.griipbuddy.cloud too, add a www CNAME to griipbuddy.cloud, include it in the proxy certificate, and redirect it to the canonical https://griipbuddy.cloud. Preserve email MX/TXT records and griipbuddy.com's DNS records. Review conflicting A/AAAA records for the cloud hostname: publish IPv6 only if that IPv6 address reaches this same working proxy. If using Cloudflare, use DNS-only during initial certificate setup.

After propagation, the cloud hostname must resolve to this VPS, and the VPS/provider firewall must allow HTTP/HTTPS to the proxy. Do not publish PostgreSQL or open its port.

Hostinger DNS instructions: https://www.hostinger.com/support/1583227-how-to-point-a-domain-to-your-vps-at-hostinger/

## 7. Connect the existing proxy and issue HTTPS

Choose the branch matching the server's actual proxy. Do not start a second proxy on occupied 80/443. Container proxies need a shared network; their own 127.0.0.1 cannot reach the host's loopback-bound app.

### Existing Nginx Proxy Manager container

Save docker-compose.ingress.yml beside the uploaded Compose files. Replace REPLACE_WITH_EXISTING_PROXY_NETWORK with the actual existing Docker network shared by Nginx Proxy Manager:

```yaml
services:
  employee-app:
    networks:
      frontend: {}
      backend: {}
      ingress:
        aliases: [griipbuddy-employee-app]
networks:
  ingress:
    external: true
    name: REPLACE_WITH_EXISTING_PROXY_NETWORK
```

Recreate only the app:

```sh
employee_compose -f docker-compose.ingress.yml \
  up -d --no-build --wait employee-app
```

In Nginx Proxy Manager, add a Proxy Host for griipbuddy.cloud, scheme http, forward hostname griipbuddy-employee-app, forward port 3000. Request a Let's Encrypt certificate, then enable Force SSL. Allow at least 11 MiB upload bodies (for example client_max_body_size 12m in the host's Advanced settings) to accommodate the app's 10 MiB document limit and multipart overhead. Preserve forwarded Host/protocol headers and bypass caching for authenticated pages, APIs and downloads.

Include the ingress override in every later app recreation and one-off Compose operation that should retain the app's complete configuration. Do not connect PostgreSQL to ingress.

### Existing Traefik container

Use the same ingress override, adding these labels to employee-app. Replace network, entrypoint and certificate resolver placeholders with names already used by your Traefik configuration:

```yaml
    labels:
      traefik.enable: "true"
      traefik.docker.network: REPLACE_WITH_EXISTING_PROXY_NETWORK
      traefik.http.routers.griipbuddy-employee.rule: Host(`griipbuddy.cloud`)
      traefik.http.routers.griipbuddy-employee.entrypoints: REPLACE_WITH_HTTPS_ENTRYPOINT
      traefik.http.routers.griipbuddy-employee.tls: "true"
      traefik.http.routers.griipbuddy-employee.tls.certresolver: REPLACE_WITH_CERTIFICATE_RESOLVER
      traefik.http.routers.griipbuddy-employee.service: griipbuddy-employee
      traefik.http.services.griipbuddy-employee.loadbalancer.server.port: "3000"
```

Place labels alongside networks beneath employee-app, not inside its networks mapping. Recreate the app with the ingress override. Verify the existing proxy redirects HTTP to HTTPS for this hostname; if it does not, configure a hostname-specific redirect using its established policy. Allow document upload size and preserve origin/forwarded headers.

Hostinger shared Traefik instructions: https://www.hostinger.com/support/connecting-multiple-docker-compose-projects-using-traefik-in-hostinger-docker-manager/

### Existing host-based Nginx/Caddy

Add one hostname route for griipbuddy.cloud, forwarding to http://127.0.0.1:3100 (or your selected port), preserving Host and the actual forwarded protocol/host. Use that proxy's existing certificate process and enable an HTTP-to-HTTPS redirect. No Docker ingress override is needed for a host-based proxy.

### No existing proxy

Only if ports 80/443 are free, install a proxy such as Nginx Proxy Manager through Hostinger Docker Manager's Catalog, then apply its branch above. Confirm its network and keep the management interface protected.

Hostinger Nginx Proxy Manager instructions: https://www.hostinger.com/support/how-to-set-up-nginx-proxy-manager-using-hostinger-docker-manager/

## 8. Using Docker Manager after manual upload

The VPS Web Console / Compose commands above are the reliable manual-upload installation route. Docker Manager is a separate UI: visibility or import of a project created through the CLI depends on the manager's support. Do not deploy a duplicate project if the CLI-managed one is not listed.

For Docker Manager-owned deployment, use Compose manually or Compose from URL with a complete, reviewed production Compose definition matching the same project, volumes, image and networks. A bare Compose URL does not necessarily provide its Dockerfile/build context or initializer script. Use a prebuilt image, remove build: ., and make the initializer bind mount absolute:

```yaml
/srv/griipbuddy-employee/docker/init-runtime.sh:/docker-entrypoint-initdb.d/10-runtime.sh:ro
```

Supply the interpolation values through the manager's supported project environment configuration. The Web Console's external employee.env file is not automatically supplied to hPanel. If your editor cannot supply these variables or import the existing project, keep this installation under the Web Console commands; do not paste secrets into a public Compose repository. For private registry images, Docker Manager has a Credentials section; direct docker load as above avoids that requirement.

The app must already have a migrated, granted and initialized database before its public route is enabled. The tools override remains a Web Console one-off operation; never merge owner/bootstrap secrets into the long-running app.

Hostinger Compose instructions: https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/

## 9. Verify live use and protect data

Open https://griipbuddy.cloud/api/health/ready (expect HTTP 200) and https://griipbuddy.cloud/login. Verify HTTPS and Secure cookies through the final proxy. Sign in with the configured bootstrap email/password and change the temporary password immediately. Remove bootstrap secrets from employee.env afterwards. Create HR and employee accounts through Admin management.

Verify company timezone and BDT, check the overtime threshold, test one attendance workflow and authorized document upload/download, and review a sample salary statement with expected amounts before real payroll. Configure the HTTPS email delivery adapter if production email changes are needed. Preserve both PostgreSQL and employee-document volumes; use [backup-recovery.md](backup-recovery.md) for verified encrypted off-server recovery. The optional daily notification command is npm run notifications:due in a one-off container using normal runtime credentials; schedule it only after choosing the intended host scheduler.

For later updates, preserve volumes, back up the data/documents, verify migration compatibility, load a new tested image, update EMPLOYEE_APP_IMAGE, run migrations/grants if required, and recreate only employee-app with the ingress override. Never rerun bootstrap. Keep the previous compatible image and recovery set for rollback.
