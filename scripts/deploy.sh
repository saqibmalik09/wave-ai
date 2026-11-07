#!/usr/bin/env bash
#
# AiWave production deploy. Safe to re-run repeatedly (idempotent).
#
# Pulls latest, installs deps, generates the Prisma client, applies pending
# migrations with `prisma migrate deploy` (never `migrate dev`), runs the
# idempotent seed, builds, and (re)starts the app under pm2.
#
# Secrets (DATABASE_URL, AUTH_SECRET, SUPERADMIN_*) are read from the
# environment or an untracked .env.local — NEVER hardcoded here.
#
# Usage (from the repo root on the server):
#   ./scripts/deploy.sh
set -euo pipefail

# --- resolve repo root (script lives in <root>/scripts) --------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
cd "${ROOT_DIR}"

APP_NAME_PM2="aiwave-front"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- load .env.local (if present) without clobbering real env --------------
# `set -a` exports everything sourced; we scope it tightly.
if [[ -f ".env.local" ]]; then
  log "Loading environment from .env.local"
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

# --- required secrets must be present (from env or .env.local) -------------
: "${DATABASE_URL:?DATABASE_URL is not set (env or .env.local). Refusing to deploy.}"
: "${AUTH_SECRET:?AUTH_SECRET is not set (env or .env.local). Refusing to deploy.}"

# --- 1. pull latest (fast-forward only) ------------------------------------
log "Pulling latest (fast-forward only)"
git pull --ff-only

# --- 2. install exact deps -------------------------------------------------
log "Installing dependencies (npm ci)"
npm ci

# --- 3. generate Prisma client ---------------------------------------------
log "Generating Prisma client"
npx prisma generate

# --- 4. apply migrations (production-safe) ---------------------------------
log "Applying database migrations (prisma migrate deploy)"
npx prisma migrate deploy

# --- 5. seed (idempotent: brand + default plans + super-admin) -------------
log "Seeding database (idempotent)"
npx prisma db seed

# --- 6. build --------------------------------------------------------------
log "Building Next.js app"
npm run build

# --- 7. (re)start under pm2 ------------------------------------------------
log "Restarting app under pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  fail "pm2 is not installed. Install it with: npm i -g pm2"
fi
# Restart if the process exists; otherwise start it. `npm start` honours the
# port configured in package.json.
pm2 restart "${APP_NAME_PM2}" || pm2 start npm --name "${APP_NAME_PM2}" -- start

log "Deploy OK — ${APP_NAME_PM2} is running."
