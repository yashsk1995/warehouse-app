# Production deployment — runbook

Step-by-step to ship the app to a real server and send an APK to your client. Estimated total time: **2-3 hours** for a first deploy, ~20 minutes for subsequent updates.

---

## TL;DR — what you're building

```
                          ┌──────────────────────────┐
   GoDaddy (domain)  ────► warehouse.yourdomain.com  │
                          │  Cloudflare DNS (free)   │   ← optional but recommended
                          └────────────┬─────────────┘
                                       │ HTTPS (Let's Encrypt cert)
                                       ▼
                          ┌──────────────────────────┐
                          │  Server (VPS)            │
                          │   ├─ Caddy/Nginx (TLS)   │
                          │   ├─ NestJS API (PM2)    │
                          │   ├─ MySQL 8             │
                          │   └─ Redis 7             │
                          └────────────┬─────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              │                                                 │
          AWS S3 (image uploads)                          Zoho Inventory API
              │
              ▼
        Phone (APK) ── HTTPS ──► warehouse.yourdomain.com/api/v1
```

---

## ⚠️ Critical: GoDaddy is for the DOMAIN, not the server

GoDaddy's "VPS" hosting is overpriced and underpowered for Node.js apps. **Don't host the app on GoDaddy** — just buy the domain there and point it at a real server provider.

Recommended providers (any one of these — all support `docker compose up -d`):

| Provider        | Plan           | Monthly | Why                                                 |
| --------------- | -------------- | ------- | --------------------------------------------------- |
| **DigitalOcean** | Basic Droplet 2GB/2CPU | **$12** | Simplest dashboard, great docs, snapshots |
| Hetzner         | CX22 2vCPU/4GB | €4.51   | Best value globally, EU/US data centers             |
| AWS Lightsail   | 2GB/2vCPU      | $10     | If you already use AWS for S3/SES                   |
| Railway         | Hobby          | $5+     | Push-to-deploy, no server admin — but pricier at scale |

This runbook uses **DigitalOcean** as the example. The steps for any other VPS are nearly identical.

---

## Step 1 — Buy + configure the domain (15 min)

### 1a. Buy on GoDaddy
1. https://godaddy.com → search a domain (e.g. `yourwarehouse.com`)
2. Buy. Skip all upsells (no need for "Web Hosting", "Domain Privacy", etc. for now — you can add privacy free via Cloudflare later)

### 1b. Move DNS to Cloudflare (recommended, free, faster)
1. Sign up at https://dash.cloudflare.com (free tier)
2. Add Site → enter your domain → free plan
3. Cloudflare gives you 2 nameservers, e.g. `clay.ns.cloudflare.com`, `jill.ns.cloudflare.com`
4. Back in GoDaddy: **My Products → Domain → DNS → Nameservers → "I'll use my own"** → paste both Cloudflare nameservers → Save
5. Wait 5-30 min for propagation (Cloudflare emails you when active)

**Why Cloudflare?** Free SSL edge, DDoS protection, faster DNS, free analytics. Skip this step only if you really want to stay 100% on GoDaddy DNS — the rest of the runbook still works.

---

## Step 2 — Provision the server (10 min)

### 2a. DigitalOcean droplet
1. Sign up at https://digitalocean.com (use a referral link for $200 free credit)
2. **Create → Droplets**
3. Region: closest to your warehouse (e.g. `Bangalore` if in India, `New York` if US)
4. Image: **Ubuntu 24.04 LTS**
5. Size: **Basic $12/mo** (2GB RAM / 2 vCPU / 50GB SSD — enough for years at your scale)
6. Authentication: **SSH key** (generate locally with `ssh-keygen -t ed25519` if you don't have one, paste your `~/.ssh/id_ed25519.pub`)
7. Hostname: `warehouse-prod`
8. Create

You'll get a public IP like `139.59.45.123` — note it down.

### 2b. Point your domain at the server
In **Cloudflare → DNS → Records**:
- Type: **A**, Name: `warehouse` (creates `warehouse.yourdomain.com`), IPv4: `<your droplet IP>`, Proxy: **Proxied** (orange cloud), TTL: Auto

(If you skipped Cloudflare and stayed on GoDaddy DNS: in GoDaddy → DNS → add the same A record. No proxy option.)

### 2c. SSH in for the first time
```bash
ssh root@139.59.45.123
```

Accept the fingerprint. You're in.

---

## Step 3 — Server bootstrap (30 min, one time)

### 3a. Basic hardening + tools
```bash
# Update
apt update && apt upgrade -y

# Create a non-root user
adduser warehouse                          # set a strong password, save it
usermod -aG sudo warehouse
mkdir -p /home/warehouse/.ssh
cp ~/.ssh/authorized_keys /home/warehouse/.ssh/
chown -R warehouse:warehouse /home/warehouse/.ssh
chmod 700 /home/warehouse/.ssh
chmod 600 /home/warehouse/.ssh/authorized_keys

# Disable root SSH login (do this AFTER confirming sudo works for warehouse user)
# vim /etc/ssh/sshd_config  →  PermitRootLogin no
# systemctl restart sshd

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 3b. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker warehouse
# log out + back in as warehouse user
exit
ssh warehouse@139.59.45.123
```

Verify:
```bash
docker --version          # Docker version 27.x
docker compose version    # Docker Compose version v2.x
```

### 3c. Clone your repo
```bash
sudo apt install -y git
cd ~
git clone https://github.com/yashsk1995/warehouse-app.git
cd warehouse-app
```

### 3d. Configure production `.env`
```bash
cp .env.example .env
nano .env
```

Edit these critical values:
```env
NODE_ENV=production
ENV_DEV=false                        # ← uses S3, not local disk
PORT=6000
API_BASE_URL=https://warehouse.yourdomain.com

DATABASE_URL="mysql://warehouse:STRONG_DB_PASSWORD@mysql:3306/warehouse"

# Regenerate these on the server, do NOT reuse dev values:
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))">
JWT_REFRESH_SECRET=<same command, different value>

REDIS_HOST=redis
REDIS_PORT=6379

# Pre-existing values from Zoho self-client (same as your dev .env)
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...                # ← rotate this if leaked
ZOHO_REFRESH_TOKEN=...
ZOHO_ORGANIZATION_ID=874417421
ZOHO_API_BASE=https://www.zohoapis.com/inventory/v1
ZOHO_ACCOUNTS_BASE=https://accounts.zoho.com

# AWS S3
AWS_ACCESS_KEY_ID=<IAM user with S3:Put/Get/Delete on the bucket>
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=warehouse-prod-uploads

OPENAI_API_KEY=sk-proj-...           # ← rotate from dev value
```

Save (`Ctrl+O`, Enter, `Ctrl+X`).

### 3e. Update docker-compose.yml for production

The current `docker-compose.yml` is fine for dev. For prod we want to also bind to localhost only (Caddy in front handles public traffic). The default already does this for MySQL/Redis (only API exposes :3000 → :6000). One small change: make the API listen on the same network only.

Actually our current compose already exposes the API on `3000:3000` — change to `6000:6000` and bind to localhost only:

```yaml
# In docker-compose.yml under the api service:
ports:
  - "127.0.0.1:6000:6000"
```

This ensures Caddy/Nginx is the only thing that can talk to the API externally.

### 3f. First start
```bash
docker compose up -d --build
docker compose ps          # all 3 services should show 'running' + healthy
docker compose logs -f api # watch startup, Ctrl+C when you see "Nest application successfully started"
```

### 3g. Run migrations + seed prod users
```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  for (const [u, p] of [['Admin','Admin@123'],['Purvam','Purvam@123'],['Maulin','Maulin@123']]) {
    await prisma.user.upsert({
      where: { username: u },
      update: { passwordHash: await bcrypt.hash(p, 12), role: 'ADMIN' },
      create: { username: u, passwordHash: await bcrypt.hash(p, 12), role: 'ADMIN' },
    });
  }
  console.log('users seeded');
  await prisma.\$disconnect();
})();
"
```

### 3h. Initial Zoho catalog pull
```bash
curl -X POST http://localhost:6000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"Admin@123"}' | tee /tmp/login.json
TOKEN=$(cat /tmp/login.json | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
curl -X POST http://localhost:6000/api/v1/zoho/sync-catalog -H "Authorization: Bearer $TOKEN"
# expect {"ok":true,"created":~636, ...}
```

---

## Step 4 — HTTPS reverse proxy with Caddy (15 min)

Caddy auto-issues Let's Encrypt certs and renews them. Way simpler than Nginx + Certbot.

### 4a. Install Caddy
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 4b. Configure Caddy
```bash
sudo nano /etc/caddy/Caddyfile
```

Replace contents with:
```
warehouse.yourdomain.com {
    reverse_proxy localhost:6000

    # Optional: serve S3 image redirects without round-tripping the API
    # (only needed if you keep ENV_DEV=true and serve local /uploads)
    # handle_path /uploads/* {
    #     root * /home/warehouse/warehouse-app/apps/api/uploads
    #     file_server
    # }

    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
```

```bash
sudo systemctl reload caddy
sudo systemctl status caddy   # should be "active (running)"
```

### 4c. Verify
From your laptop:
```bash
curl -i https://warehouse.yourdomain.com/health
# HTTP/2 200, {"status":"ok","db":"ok"...}
```

If DNS hasn't propagated yet, this will fail — wait 10 min and retry.

---

## Step 5 — AWS S3 bucket (10 min)

### 5a. Create bucket
1. AWS Console → S3 → Create bucket
2. Name: `warehouse-prod-uploads`
3. Region: closest to your server (e.g. `ap-south-1` Mumbai if your DO is in Bangalore)
4. Block all public access: **ON** (we serve via signed URLs)
5. Versioning: Off (uploads are immutable per transaction)
6. Create

### 5b. IAM user for the API
1. IAM → Users → Create user → name `warehouse-api`
2. Attach inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"],
       "Resource": "arn:aws:s3:::warehouse-prod-uploads/*"
     }]
   }
   ```
3. Security credentials → Create access key → "Application running outside AWS"
4. Copy the Access Key + Secret → into `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)

### 5c. Restart API to pick up S3 config
```bash
cd ~/warehouse-app
docker compose restart api
docker compose logs -f api    # confirm clean boot
```

Try uploading a sheet from your phone (using a temporary URL pointing at prod) — verify the S3 bucket gets an object in `uploads/<date>/<uuid>.jpg`.

---

## Step 6 — Build the production APK for your client (15 min)

### 6a. Update `eas.json` production profile
On your **laptop** (not the server), edit `apps/mobile/eas.json`:

```json
"production": {
  "channel": "production",
  "android": {
    "buildType": "apk"
  },
  "env": {
    "EXPO_PUBLIC_API_BASE_URL": "https://warehouse.yourdomain.com/api/v1"
  }
}
```

(Change `buildType` from `app-bundle` → `apk` so you get a direct-install APK, not a Play Store .aab.)

### 6b. Build
```bash
cd apps/mobile
eas build -p android --profile production
```

~12 min. When done EAS emails you and prints a URL like:
```
https://expo.dev/accounts/yash-kinariwala/projects/warehouse-inventory/builds/<id>
```

### 6c. Distribute to your client

Three options, pick whichever fits:

1. **Direct link (simplest)** — share the EAS build URL with your client. They open it on their Android phone, tap Install. Works for anyone with the link, no account needed.

2. **Google Drive / Dropbox** — download the `.apk` from the EAS page, upload to Drive, share the link. Same install UX for the client.

3. **Google Play Internal Testing (most professional)** — requires a one-time Google Play Console signup ($25). Build with `buildType: "app-bundle"` and run `eas submit -p android`. Your client gets a Play Store link to opt-in; updates auto-install.

For your first delivery, **option 1** is fine.

### 6d. Walk your client through install
Send them this short doc:

> 1. Tap the link I sent
> 2. Tap **Install** on the page
> 3. When the APK downloads, tap it
> 4. Android will warn "Install from unknown source" — go to Settings, allow your browser to install, return and tap install
> 5. Open **Warehouse Inventory**
> 6. Log in with: username `Admin` / password `Admin@123` (or `Purvam`/`Purvam@123`, etc.)

---

## Step 7 — Production checklist before going live

- [ ] All secrets in `.env` are **production-only** values, not copied from dev
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` regenerated on the server
- [ ] `OPENAI_API_KEY` rotated (old one was pasted in chat/screenshots)
- [ ] `ZOHO_CLIENT_SECRET` rotated if previously leaked
- [ ] User passwords changed from defaults (`Admin@123` → real password) — do this in the app or via the same upsert script
- [ ] MySQL daily backup configured:
  ```bash
  # Add to crontab via `crontab -e`
  0 3 * * * docker compose -f /home/warehouse/warehouse-app/docker-compose.yml exec -T mysql mysqldump -uroot -p$(grep MYSQL_ROOT_PASSWORD docker-compose.yml | awk '{print $2}') warehouse | gzip > /home/warehouse/backups/warehouse-$(date +\%Y\%m\%d).sql.gz
  ```
- [ ] Cloudflare proxied (orange cloud) → free DDoS + bot protection
- [ ] Test the full flow on the production APK at least once before sending to client
- [ ] Verify cron is running:
  ```bash
  docker compose logs api | grep "Catalog cron"
  # should see "Catalog cron done" lines every 30 min
  ```

---

## Step 8 — Updating the deployed app (the 20-min path)

When you push a backend change:
```bash
ssh warehouse@139.59.45.123
cd warehouse-app
git pull
docker compose up -d --build api
docker compose logs -f api    # confirm restart
```

When you push a mobile change:
```bash
# On your laptop
cd apps/mobile
eas build -p android --profile production
# Resend the new build URL to your client
```

For JS-only mobile changes (no native deps changed), you can use EAS Update — the client app silently downloads the new JS on next launch, no reinstall:
```bash
eas update --channel production --message "Fix banner color"
```
(Requires `expo-updates` installed — you already have it.)

---

## Cost summary (typical small deploy)

| Item                  | Monthly    |
| --------------------- | ---------- |
| Domain (GoDaddy)      | ~$1 (amortized $12/yr) |
| Cloudflare            | $0         |
| DigitalOcean droplet  | $12        |
| AWS S3 (10GB images)  | ~$0.25     |
| AWS data transfer     | ~$1-5      |
| OpenAI (per upload)   | ~$0.005 each → ~$0.50 for 100 uploads |
| Zoho Inventory        | (existing, not added by us) |
| EAS Build             | Free for first 30 builds/mo |
| **Total**             | **~$15-20/mo** |

---

## When something breaks — first 5 places to look

1. `docker compose logs api` — backend errors
2. `docker compose logs mysql` — DB connection issues
3. `docker compose logs redis` — queue failures
4. `journalctl -u caddy --since "10 min ago"` — TLS / proxy issues
5. AWS S3 bucket → Objects tab — confirm uploads landing
6. Zoho → Reports → Activity Log — confirm inventory adjustments arriving
