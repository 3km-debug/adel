#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: bash scripts/hetzner-deploy.sh <repo-url> [branch]"
  exit 1
fi

REPO_URL="$1"
BRANCH="${2:-main}"
APP_DIR="${APP_DIR:-$HOME/bot}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit secrets before starting containers."
fi

if [[ ! -f config.yaml ]]; then
  cp config.yaml.example config.yaml
  echo "Created config.yaml from config.yaml.example. Edit risk/network settings before starting containers."
fi

docker compose build
docker compose up -d

echo "Deployment complete."
