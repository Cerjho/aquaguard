# AquaGuard Deployment Machine Setup Guide

This guide is for first-time setup on a new deployment machine.
It covers both:

- Production-like setup on a single machine (HTTPS with aquaguard.local)
- Facility production setup (real domain and production secrets)

Use this as the machine bootstrap runbook before handoff.

## 1. Scope and Outcomes

After completing this guide, the deployment machine should be able to:

1. Run all AquaGuard services with Docker Compose
2. Serve dashboard and API over HTTPS
3. Authenticate with secure JWT cookies
4. Pass basic health and login checks

## 2. Machine Prerequisites

### Required software

- Docker Desktop (Windows) or Docker Engine + Compose plugin (Linux)
- Git
- PowerShell 7+ (Windows) or Bash (Linux)

### Required network and ports

- Outbound internet for image pulls
- Local firewall allows inbound ports 80, 443, 1883, 3478, 5000

### Required hardware

- Deployment host with GPU support for detection engine runtime

## 3. Get the Repository

### Windows

```powershell
git clone https://github.com/Cerjho/aquaguard.git
Set-Location .\aquaguard
```

### Linux

```bash
git clone https://github.com/Cerjho/aquaguard.git
cd aquaguard
```

## 4. Create and Configure Environment File

Copy the environment template if `.env` does not exist.

### Windows

```powershell
if (-not (Test-Path .\.env)) {
  Copy-Item .\.env.example .\.env
}
```

### Linux

```bash
[ -f .env ] || cp .env.example .env
```

Set strong secrets and production values in `.env`:

- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `AQUAGUARD_API_KEY`
- `SEED_ADMIN_PASSWORD`
- `SEED_GUARD_PASSWORD`
- `CORS_ALLOWED_ORIGINS`
- `APP_ENV=production`
- `FLASK_ENV=production`

Set frontend API targets:

- `REACT_APP_API_URL=https://<your-domain>`
- `REACT_APP_WS_URL=https://<your-domain>`

For production-like local domain tests, use:

- `REACT_APP_API_URL=https://aquaguard.local`
- `REACT_APP_WS_URL=https://aquaguard.local`
- `CORS_ALLOWED_ORIGINS=https://aquaguard.local`

## 5. Choose Deployment Mode

### Mode A - Production-like on One Machine (Recommended First)

This mode uses the local HTTPS edge proxy in:

- `docker-compose.prodlike.yml`
- `infra/caddy/Caddyfile`

### A1. Map local domain on the deployment machine

Add this hosts entry on the deployment machine:

```text
127.0.0.1 aquaguard.local
```

Windows (run as Administrator):

```powershell
Add-Content -Path "$env:WINDIR\System32\drivers\etc\hosts" -Value "127.0.0.1 aquaguard.local"
ipconfig /flushdns
```

Linux:

```bash
echo "127.0.0.1 aquaguard.local" | sudo tee -a /etc/hosts
```

### A2. Start stack with prod-like override

```powershell
docker compose -f docker-compose.yml -f docker-compose.prodlike.yml up -d --build
```

### A3. Verify service state

```powershell
docker compose -f docker-compose.yml -f docker-compose.prodlike.yml ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected: `aquaguard-edge` is running on ports 80 and 443.

### A4. Verify API health and auth flow over HTTPS

Health:

```powershell
curl.exe -k --resolve aquaguard.local:443:127.0.0.1 https://aquaguard.local/api/health
```

Login test (replace password if changed):

```powershell
curl.exe -k --resolve aquaguard.local:443:127.0.0.1 \
  -H "Content-Type: application/json" \
  -X POST https://aquaguard.local/api/v1/auth/login \
  -d '{"username":"admin","password":"aquaguard2026","remember_me":false}'
```

Dashboard URL:

- `https://aquaguard.local`

If the browser shows a certificate warning on first visit, trust the local CA
used by Caddy or accept the warning for local validation.

### Mode B - Facility Production Domain

Use this when the facility domain and TLS certificate are ready.

### B1. Configure DNS and reverse proxy

- Point domain to deployment machine IP
- Terminate TLS at approved reverse proxy
- Proxy `/api/*` and `/socket.io/*` to backend
- Proxy all other paths to frontend

### B2. Set production env values

In `.env`, set:

- `CORS_ALLOWED_ORIGINS=https://<facility-dashboard-domain>`
- `REACT_APP_API_URL=https://<facility-dashboard-domain>`
- `REACT_APP_WS_URL=https://<facility-dashboard-domain>`

### B3. Start default production stack

```powershell
docker compose up -d --build
```

## 6. Post-Setup Validation Checklist

Run these checks before operator handoff:

1. `docker compose ps` shows healthy backend, db, redis, mqtt
2. `GET /api/health` returns success
3. Login works with configured admin credential
4. Dashboard loads and can fetch authenticated `/api/v1/auth/me`
5. MQTT is reachable on port 1883 from deployment LAN
6. Detection engine can post events to backend

## 7. Operator Handoff Notes

Record these values in handoff docs:

- Deployment machine hostname/IP
- Active domain
- Location of `.env`
- Admin bootstrap credential handoff process
- Last known good compose command and rollback tag

Use together with:

- `docs/DEPLOYMENT_PACKAGE.md`
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/PRODUCTION_DEPLOYMENT.md`
- `docs/OPERATOR_RUNBOOK.md`

## 8. Safe Stop and Restart

Stop stack:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prodlike.yml down
```

Start stack again:

```powershell
docker compose -f docker-compose.yml -f docker-compose.prodlike.yml up -d
```

For facility production without prod-like override, remove the second compose file.
