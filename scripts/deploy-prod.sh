#!/usr/bin/env bash
# Production deploy helper. Logs in to GHCR (if not already), ensures every
# service image has actually moved (digest check), and only then restarts the
# compose stack.
#
# Usage:
#   ./scripts/deploy-prod.sh
#   IMAGE_TAG=sha-1fe398b ./scripts/deploy-prod.sh
#   IMAGE_TAG=main ./scripts/deploy-prod.sh
#   IMAGE_NAMESPACE=feinru ./scripts/deploy-prod.sh
#   COMPOSE_FILE=docker-compose.prod.yml ENV_FILE=.env.prod ./scripts/deploy-prod.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REGISTRY="${IMAGE_REGISTRY:-ghcr.io}"
NAMESPACE="${IMAGE_NAMESPACE:-${GITHUB_REPOSITORY_OWNER:-feinru}}"

if [ -n "${GHCR_USER:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "[deploy] logging in to ${REGISTRY} as ${GHCR_USER}"
  echo "${GHCR_TOKEN}" | docker login "${REGISTRY}" -u "${GHCR_USER}" --password-stdin
fi

if [ ! -f "${ENV_FILE:-.env.prod}" ]; then
  if [ -f .env.prod.example ]; then
    cp .env.prod.example .env.prod
    echo "[deploy] created .env.prod from .env.prod.example — review before re-running"
  else
    echo "[deploy] no env file and no .env.prod.example; aborting"
    exit 1
  fi
fi

echo "[deploy] checking images and restarting compose"
exec node scripts/ensure-images-fresh.mjs
