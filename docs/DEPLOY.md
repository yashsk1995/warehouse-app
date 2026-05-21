# Deployment

## 1. AWS RDS (MySQL 8.0)

1. Create RDS MySQL 8.0 db (`db.t4g.small` is enough to start).
2. Security group: only allow inbound 3306 from the API EC2 / ECS SG.
3. `DATABASE_URL="mysql://<user>:<pass>@<endpoint>:3306/warehouse"`
4. `pnpm --filter @warehouse/api prisma:deploy` (run **once** per release).

## 2. AWS S3

1. Create a bucket (e.g. `warehouse-inventory-uploads-prod`) in your region.
2. Bucket policy: block public access; we use signed URLs via `getSignedUrl`.
   (Or enable public-read if you keep CDN-fronted uploads — your call.)
3. IAM user with `s3:PutObject` + `s3:GetObject` + `s3:DeleteObject` on that bucket.
4. Set `AWS_*` env vars and `ENV_DEV=false`.

## 3. Redis (BullMQ)

ElastiCache Redis (or any managed Redis). Set `REDIS_HOST/PORT/PASSWORD`.

## 4. API (choose one)

### Docker Compose (single host)
```bash
docker compose up -d --build
```

### AWS ECS Fargate
- Build & push the `apps/api/Dockerfile` to ECR
- Task definition: 1 vCPU / 2 GB to start, mount no volumes (S3 + RDS only)
- Service: 2+ tasks behind ALB, target port 3000
- Health check: `GET /health`

### Bare metal / EC2 with PM2
```bash
pnpm install
pnpm --filter @warehouse/api build
cd apps/api && pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

## 5. Mobile app

- Build via EAS: `npx eas build -p android --profile production`
- Set `apiBaseUrl` in `app.json → expo.extra` to your prod API URL
- Submit to Play Store / TestFlight via `eas submit`

## 6. Zoho Inventory

1. Register a self-client at https://api-console.zoho.in (or `.com` per your DC).
2. Generate an authorization code with scope:
   `ZohoInventory.items.READ,ZohoInventory.inventoryadjustments.CREATE`
3. Exchange for a long-lived refresh token (one-time):
   ```
   curl -X POST https://accounts.zoho.in/oauth/v2/token \
     -d code=<AUTH_CODE> -d client_id=... -d client_secret=... \
     -d grant_type=authorization_code -d redirect_uri=...
   ```
4. Save `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN/ORGANIZATION_ID` in env.
5. The API exchanges the refresh token for short-lived access tokens at runtime
   (cached, with 60s safety margin).
