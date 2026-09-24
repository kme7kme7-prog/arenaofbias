#!/usr/bin/env bash
# 兼容旧入口；Windows 可直接 npm run deploy:vps。
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/deploy-vps.py "$@"
fi
exec python scripts/deploy-vps.py "$@"
