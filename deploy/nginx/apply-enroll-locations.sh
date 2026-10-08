#!/usr/bin/env bash
#
# Add the two public-intake location blocks to the LIVE certbot-managed nginx
# config, in place, without disturbing the TLS/443 server block certbot wrote.
#
#   1. location = /api/public/intake/applications  (32m body cap for photo+docs,
#      tighter rate burst) — an exact match, so it wins over `^~ /api/public/`.
#   2. location = /enroll                           (serves Naji's static form
#      from the git checkout; noindex + no-store, like /apply).
#
# WHY A SCRIPT: the live file was rewritten by certbot (TLS listeners + 80->443
# redirect), so we must NOT `cp` the repo template over it. This edits in place.
#
# SAFE: backs up first, inserts only if not already present (idempotent), runs
# `nginx -t`, and reloads ONLY if the test passes — otherwise it restores the
# backup and leaves nginx untouched.
#
# RUN IT (from your Mac, against the CRM droplet):
#   ssh -i ~/.ssh/upcarrera_deploy root@168.144.188.190 'bash -s' < deploy/nginx/apply-enroll-locations.sh
#
# ...or copy it to the droplet and run `bash apply-enroll-locations.sh` as root.
#
# Prereqs already done by the normal deploy: `git reset --hard origin/main` on
# the droplet, so /opt/upcarrera/deploy/enroll/index.html exists.
set -uo pipefail

CONF="/etc/nginx/sites-available/upcarrera.conf"
[ -f "$CONF" ] || { echo "ERROR: $CONF not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required"; exit 1; }

python3 - "$CONF" <<'PYEOF'
import shutil, sys, datetime
P = sys.argv[1]
s = open(P).read()

if ("location = /enroll" in s) or ("intake/applications" in s):
    print("ALREADY PATCHED; leaving config as-is")
    open("/tmp/uc_nginx_bak", "w").write("")
    sys.exit(0)

submit_block = '''  # Self-serve online application submit (public-intake). Exact match beats the
  # ^~ /api/public/ prefix, so this wins for the submit only: larger body cap
  # (photo + signature + documents) and a tighter rate burst than browsing.
  location = /api/public/intake/applications {
    limit_req zone=applicant burst=8 nodelay;
    limit_req_status 429;
    client_max_body_size 32m;
    proxy_pass http://upcarrera_api;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }

'''

enroll_block = '''  # Self-serve online application FORM (static page). noindex + no-store +
  # anti-clickjacking, like /apply. Served from the git checkout.
  location = /enroll {
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Cache-Control "no-store" always;
    default_type text/html;
    alias /opt/upcarrera/deploy/enroll/index.html;
  }

'''

anchorA = "  location ^~ /api/public/ {"
anchorB = "  # SPA fallback"
if anchorA not in s:
    print("ERROR: anchor A ('^~ /api/public/') not found — aborting"); sys.exit(2)
if anchorB not in s:
    print("ERROR: anchor B ('# SPA fallback') not found — aborting"); sys.exit(2)

s = s.replace(anchorA, submit_block + anchorA, 1)
s = s.replace(anchorB, enroll_block + anchorB, 1)

bak = P + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy2(P, bak)
open(P, "w").write(s)
open("/tmp/uc_nginx_bak", "w").write(bak)
print("PATCHED; backup saved at", bak)
PYEOF

rc=$?
[ $rc -eq 0 ] || { echo "=== patch step failed (rc=$rc); no reload ==="; exit $rc; }

echo "=== nginx -t ==="
if nginx -t; then
  systemctl reload nginx && echo "=== nginx RELOADED OK ==="
else
  BAK="$(cat /tmp/uc_nginx_bak 2>/dev/null || true)"
  if [ -n "$BAK" ] && [ -f "$BAK" ]; then
    cp "$BAK" "$CONF"
    echo "=== nginx -t FAILED — restored from $BAK, NOT reloaded ==="
  else
    echo "=== nginx -t FAILED — config unchanged (already-patched path), NOT reloaded ==="
  fi
  exit 1
fi

echo
echo "=== verify ==="
curl -sS -o /dev/null -w "/enroll -> HTTP %{http_code} size=%{size_download}\n" https://admissions.upcarrera.com/enroll
echo "(expect size ~115000 — the form — not ~1100 which is the SPA)"
