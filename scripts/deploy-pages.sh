#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="investment-h5"
PRODUCTION_BRANCH="main"
ACCOUNT_ID_DEFAULT="266b118cf612f91c8b6dcbf81cc65e19"
KEYCHAIN_SERVICE="hermes.cloudflare.pages.token"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
if [[ -z "$TOKEN" ]]; then
  echo "未找到 Cloudflare token：请先写入 macOS Keychain（service=$KEYCHAIN_SERVICE），或临时导出 CLOUDFLARE_API_TOKEN。" >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$ACCOUNT_ID_DEFAULT}"

echo "[deploy] 预检 Cloudflare 环境变量"
python3 - <<'INNER'
import os
for k in ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']:
    v = os.environ.get(k)
    print(k, bool(v), len(v) if v else 0)
INNER

echo "[deploy] 构建前写权限预检"
curl -A 'curl/8.1.2' -s \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}" >/tmp/${PROJECT_NAME}-cf-project.json
curl -A 'curl/8.1.2' -s \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/upload-token" >/tmp/${PROJECT_NAME}-cf-upload-token.json

echo "[deploy] npm run build"
npm run build

rm -rf dist/_functions
mkdir -p dist/_functions
cp -R functions/* dist/_functions/
if [[ -f public/_redirects ]]; then
  cp public/_redirects dist/_redirects
fi

echo "[deploy] wrangler pages deploy -> ${PROJECT_NAME} (${PRODUCTION_BRANCH})"
npx wrangler pages deploy dist \
  --project-name="${PROJECT_NAME}" \
  --branch="${PRODUCTION_BRANCH}"
