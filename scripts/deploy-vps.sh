#!/usr/bin/env bash
# VPS 同步部署：把本地工作区推到 114.66.27.88 并重启服务。
# 用法：npm run deploy:vps （或 bash scripts/deploy-vps.sh）
# 前提：本机已配 root@114.66.27.88 的密钥登录（~/.ssh/id_ed25519）。
# 口径：只推代码与 data/works；node_modules/.git/Temp/dist/本地库文件/缩略图/收件箱都不传，
# 服务器上的 data/comments.db 与 data/thumbs 是它自己的，绝不被本地覆盖。
set -euo pipefail
HOST="${VPS_HOST:-root@114.66.27.88}"
DIR=/www/wwwroot/arenaofbias
cd "$(dirname "$0")/.."
tar czf - \
  --exclude=./node_modules --exclude=./.git --exclude=./Temp \
  --exclude=./outputs --exclude=./gui-test-screenshots --exclude=./dist \
  --exclude=./data/comments.db --exclude=./data/comments.db-wal --exclude=./data/comments.db-shm \
  --exclude=./data/inbox --exclude=./data/thumbs \
  --exclude=./scripts/.tmp-mobile --exclude=./.qoder . \
  | ssh -o BatchMode=yes "$HOST" "tar xzf - -C $DIR && chown -R arena:arena $DIR && cd $DIR && npm install --no-audit --no-fund >/tmp/deploy-npm.log 2>&1 && npm run build >/tmp/deploy-build.log 2>&1 && systemctl restart arenaofbias && sleep 2 && systemctl is-active arenaofbias && echo DEPLOY_OK"
