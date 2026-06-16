# upCarrera — DigitalOcean Deployment Runbook

Terminal-driven deploy of the upCarrera monorepo (NestJS API + **static Vite SPA**
+ Prisma/MySQL) to a single DigitalOcean droplet fronted by nginx, with the data
in DigitalOcean Managed MySQL.

> Artifacts referenced here live in the repo: `ecosystem.config.js` (PM2, API
> only), `deploy/nginx/upcarrera.conf` (nginx static + API proxy),
> `deploy/deploy.sh` (build + restart), `deploy/db-cutover.sh` (data import).

---

## 1. Architecture

```
                         Internet
                            │  443 (TLS)
                    ┌───────▼────────┐
                    │     nginx      │   admin.upcarrera.com
                    │ (Let's Encrypt)│   admissions.upcarrera.com
                    └───┬────────┬───┘
        static files /  │        │  /api/
   ┌───────────────────▼┐      ┌▼────────────────┐
   │ apps/web/dist (SPA)│      │  NestJS (api)    │
   │  served by nginx   │      │ 127.0.0.1:3000   │
   └────────────────────┘      └────────┬─────────┘
                          PM2 (fork)     │ TLS
                                ┌────────▼─────────┐
                                │ DO Managed MySQL │
                                └──────────────────┘
```

- **One droplet**: Ubuntu 24.04, `s-2vcpu-4gb` (2 vCPU / 4 GB). 4 GB + a 2 GB
  swapfile comfortably handles `nest build` + `vite build`.
- **Web is a static SPA** — nginx serves `apps/web/dist` directly; there is **no
  Node web process**. Only the Nest API runs under PM2 (bound to `127.0.0.1`).
- **Managed MySQL 8** (not on the droplet): automated backups, PITR, TLS.
- **Both hostnames serve the same SPA build**; each proxies its own `/api`, so a
  relative `VITE_API_URL=/api` keeps everything same-origin and CORS-free.

---

## 2. Required from the operator

| # | Item | Notes |
|---|------|-------|
| 1 | **DO API token** (write) + SSH public key | so `doctl` can provision and SSH in |
| 2 | **Two DNS A records** | `admin.upcarrera.com` & `admissions.upcarrera.com` → droplet IP |
| 3 | **Production mysqldump** of the live DB | PII — out-of-band, never committed |
| 4 | **Integration API keys** (later) | Zoom / Brevo / 2factor / Razorpay — dark until provided |

`JWT_SECRET` is **generated on the droplet** (`openssl rand -base64 48`) — the API
**refuses to boot** without it (no insecure default).

---

## 3. Provision (laptop, `doctl`)

```bash
doctl auth init
doctl compute droplet create upcarrera-prod \
  --image ubuntu-24-04-x64 --size s-2vcpu-4gb --region blr1 \
  --ssh-keys <fingerprint> --wait
doctl databases create upcarrera-db --engine mysql --version 8 \
  --size db-s-1vcpu-1gb --region blr1 --num-nodes 1
doctl databases connection upcarrera-db --format Host,Port,User,Password,Database
doctl databases firewalls append <db-id> --rule droplet:<droplet-id>
```
Point both DNS A records at the droplet IP.

---

## 4. One-time bootstrap (on the droplet)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx git
corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm add -g pm2
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

---

## 5. Code + secrets

```bash
git clone https://github.com/viditkbhatnagar/upcarrera-v2.git /opt/upcarrera
cd /opt/upcarrera
mkdir -p certs   # download the DO MySQL CA cert -> certs/ca-certificate.crt
cat > apps/api/.env <<EOF
DATABASE_URL="mysql://USER:PASSWORD@DB_HOST:25060/upcarrera?sslaccept=strict&sslcert=/opt/upcarrera/certs/ca-certificate.crt"
JWT_SECRET="$(openssl rand -base64 48)"
JWT_EXPIRES_IN="7d"
PORT=3000
HOST=127.0.0.1
EOF
```

---

## 6. Database cutover (one-time)

```bash
DB_HOST=<host> DB_PORT=25060 DB_NAME=upcarrera \
DB_USER=<user> DB_PASSWORD=<pass> \
DB_CA_CERT=/opt/upcarrera/certs/ca-certificate.crt \
DUMP_FILE=/opt/upcarrera/upcarrera-prod.sql \
  ./deploy/db-cutover.sh
```
Loads the dump (with FKs), normalizes zero-dates, prints the introspected schema
to diff. **Never** `prisma db push` against this data. (The `intake` table is new —
create it once with `pnpm --filter @upcarrera/api exec prisma db execute` using a
`CREATE TABLE intake (...)`, or let a one-off `db push` on an empty DB build it.)

---

## 7. Build + start

```bash
cd /opt/upcarrera
./deploy/deploy.sh        # install, prisma generate, build (api dist + web dist), pm2 start API
pm2 startup systemd       # run the printed command (boot persistence)
```
`deploy.sh` bakes `VITE_API_URL=/api` into the SPA bundle. Re-run on every update:
`git pull && ./deploy/deploy.sh && sudo systemctl reload nginx`.

---

## 8. Reverse proxy + TLS

```bash
cp deploy/nginx/upcarrera.conf /etc/nginx/sites-available/upcarrera.conf
ln -sf /etc/nginx/sites-available/upcarrera.conf /etc/nginx/sites-enabled/upcarrera.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d admin.upcarrera.com -d admissions.upcarrera.com
```

---

## 9. Verify (smoke test)

```bash
curl -fsS http://127.0.0.1:3000/api/health          # {status:ok, db:up} (503 if DB down)
curl -fsS https://admin.upcarrera.com/api/health
curl -fsS -I https://admissions.upcarrera.com/       # 200, serves index.html
curl -fsS -X POST https://admin.upcarrera.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<pass>"}'      # expect an auth_token
```
Then load each domain, sign in, and click through a data-backed page.

---

## 10. Operations

```bash
pm2 status                       # upcarrera-api online
pm2 logs upcarrera-api
pm2 reload ecosystem.config.js   # restart API after a deploy
sudo systemctl reload nginx      # serve a fresh web build
ufw status                       # only 22/80/443 exposed
```
Confirm DO Managed MySQL backups are on. Enable an integration later by adding its
keys to `apps/api/.env` and `pm2 reload upcarrera-api`.
