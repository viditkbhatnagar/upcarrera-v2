# upCarrera — DigitalOcean Deployment Runbook

Terminal-driven deploy of the upCarrera monorepo (NestJS API + Next.js web +
Prisma/MySQL) to a single DigitalOcean droplet fronted by nginx, with the data in
DigitalOcean Managed MySQL.

> This file is the operator runbook. The artifacts it references live in the repo:
> `ecosystem.config.js` (PM2), `deploy/nginx/upcarrera.conf` (nginx),
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
              /         │        │   /api/
        ┌───────────────▼┐      ┌▼────────────────┐
        │ Next.js (web)  │      │  NestJS (api)    │
        │ 127.0.0.1:3001 │      │ 127.0.0.1:3000   │
        └────────────────┘      └────────┬─────────┘
                  PM2 (fork, autorestart) │ TLS
                                 ┌────────▼─────────┐
                                 │ DO Managed MySQL │
                                 └──────────────────┘
```

- **One droplet**: Ubuntu 24.04, `s-2vcpu-4gb` (2 vCPU / 4 GB). 4 GB is the floor —
  `nest build` + `next build` peak above 1 GB; a 2 GB swapfile guards against OOM.
- **Managed MySQL 8** (not MySQL on the box): automated backups, PITR, TLS by default.
- **PM2** runs both apps as bare Node processes bound to `127.0.0.1`; only nginx is public.
- **Both hostnames serve the same web build**; server-side RBAC segments admins
  (admin.upcarrera.com) from counsellors (admissions.upcarrera.com). Each origin
  proxies its own `/api`, so a relative `NEXT_PUBLIC_API_URL=/api` keeps everything
  same-origin and CORS-free.

---

## 2. Required from the operator (you)

| # | Item | Notes |
|---|------|-------|
| 1 | **DO API token** (write) + SSH public key | so `doctl` can provision and SSH in |
| 2 | **Two DNS A records** | `admin.upcarrera.com` & `admissions.upcarrera.com` → droplet IP |
| 3 | **Production mysqldump** of the live legacy DB | PII — delivered out-of-band, never committed |
| 4 | **Integration API keys** (later) | Zoom / Brevo / 2factor / Razorpay — features stay dark (503/no-op) until provided |

`JWT_SECRET` is **generated on the droplet** (`openssl rand -base64 48`) — never the
dev value. `DATABASE_URL` is assembled from the Managed MySQL credentials DO issues.

---

## 3. Provision (from your laptop, with `doctl`)

```bash
doctl auth init                       # paste the DO token
# Droplet
doctl compute droplet create upcarrera-prod \
  --image ubuntu-24-04-x64 --size s-2vcpu-4gb --region blr1 \
  --ssh-keys <your-ssh-key-fingerprint> --wait
doctl compute droplet list            # note the public IP
# Managed MySQL 8 in the same region
doctl databases create upcarrera-db --engine mysql --version 8 \
  --size db-s-1vcpu-1gb --region blr1 --num-nodes 1
doctl databases connection upcarrera-db --format Host,Port,User,Password,Database
doctl databases firewalls append <db-id> --rule droplet:<droplet-id>   # private trusted source
```

Point the two DNS A records at the droplet IP.

---

## 4. One-time server bootstrap (on the droplet, `ssh root@<ip>`)

```bash
# Node 20 + pnpm + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx git
corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm add -g pm2

# 2 GB swap (build OOM guard)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall: only SSH + HTTP/HTTPS
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

---

## 5. Code + secrets

```bash
git clone https://github.com/viditkbhatnagar/upcarrera-v2.git /opt/upcarrera
cd /opt/upcarrera
git checkout deploy/do-scaffolding   # until merged to main

# DO CA cert for TLS to Managed MySQL
mkdir -p /opt/upcarrera/certs
doctl databases get <db-id> --format CACert  # or download from the DO panel -> certs/ca-certificate.crt

# API secrets
cat > apps/api/.env <<EOF
DATABASE_URL="mysql://USER:PASSWORD@DB_HOST:25060/upcarrera?sslaccept=strict&sslcert=/opt/upcarrera/certs/ca-certificate.crt"
JWT_SECRET="$(openssl rand -base64 48)"
JWT_EXPIRES_IN="7d"
PORT=3000
HOST=127.0.0.1
# CORS_ORIGINS unset — web calls /api same-origin
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

Loads the dump (with FKs), normalizes zero-dates, and prints the introspected
schema to diff against `apps/api/prisma/schema.prisma`. **Never** `prisma db push`
against this data — the Prisma models carry no `@relation`, so a push drops the FKs.

---

## 7. Build + start

```bash
cd /opt/upcarrera
./deploy/deploy.sh              # install --frozen-lockfile, prisma generate, build, pm2 start/save
pm2 startup systemd            # then run the command it prints (boot persistence)
```

`deploy.sh` bakes `NEXT_PUBLIC_API_URL=/api` into the web bundle. Re-run it on every
code update (`git pull && ./deploy/deploy.sh`).

---

## 8. Reverse proxy + TLS

```bash
cp deploy/nginx/upcarrera.conf /etc/nginx/sites-available/upcarrera.conf
ln -sf /etc/nginx/sites-available/upcarrera.conf /etc/nginx/sites-enabled/upcarrera.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d admin.upcarrera.com -d admissions.upcarrera.com   # issues cert + 80->443 redirect
```

---

## 9. Verify (terminal smoke test)

```bash
# On the droplet — process-local
curl -fsS http://127.0.0.1:3000/api/health        # {status:ok, db:up}  (503 if DB down)
curl -fsS -I http://127.0.0.1:3001/               # 200 from Next.js

# Public — end to end
curl -fsS https://admin.upcarrera.com/api/health
curl -fsS -I https://admissions.upcarrera.com/
# Real auth path proves DB connectivity + bcrypt verify on legacy hashes:
curl -fsS -X POST https://admin.upcarrera.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<known-user>","password":"<password>"}'   # expect an auth_token
```

Then load each domain in a browser, sign in, and click through one data-backed page.

---

## 10. Operations

```bash
pm2 status                 # both apps online
pm2 logs upcarrera-api     # tail API logs
pm2 reload ecosystem.config.js   # zero-downtime restart after a deploy
ufw status                 # only 22/80/443 exposed
```

Confirm DO Managed MySQL automated backups are on. To enable an integration later,
add its keys to `apps/api/.env` and `pm2 reload upcarrera-api`.
