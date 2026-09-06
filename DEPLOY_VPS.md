# BIAS ARENA VPS 部署指南（零基础版）

> 阅读对象：第一次买服务器、想自己“倒腾”的同学。每一步都有命令，照着复制即可。
> 适用机器：Debian / Ubuntu 系统的 VPS（香港/海外/大陆均可，大陆机器需先完成 ICP 备案）。

---

## 0. 先了解你在部署什么

这是一套 **Node.js 单进程服务**：

- 前端：构建好的静态文件（`dist/`）
- 后端：同一个 Node 进程里跑的 Express 服务（静态托管 + `/api/comments`）
- 数据库：一个本地 SQLite 文件 `data/comments.db`（不需要单独装数据库软件）

对外只暴露 **一个端口（默认 3000）**，由 Caddy 把域名流量反向代理进来并自动配好 HTTPS。

架构图：

```
用户浏览器 ──HTTPS──> Caddy(:80/443) ──http──> Node 服务(:3000)
                                                    ├─ 静态文件 dist/
                                                    └─ SQLite data/comments.db
```

---

## 1. 准备：域名 + 服务器

### 域名
- 在任意注册商（京东云、阿里云等）买一个域名，完成**实名认证**。
- 在域名控制台加一条 **A 记录**：`主机记录 @`（和 `www`）→ 指向你的服务器公网 IP。
- DNS 生效一般几分钟到几小时。

### 服务器
- 学生入门推荐：**1 核 / 1~2GB 内存 / 20~40GB 硬盘**，月流量 300GB 以上。
- 带宽：香港/海外机通常 30Mbps 起，够用；大陆机注意看“峰值带宽”（3~6Mbps 会偏慢）。
- 系统选 **Debian 12** 或 **Ubuntu 22.04/24.04**。
- 若机器在大陆机房：域名和机器都必须完成 ICP 备案后才能对外提供网站服务（见第 10 节）。
- 海外/香港机器：免备案，买了就能用。

---

## 2. 首次登录 + 基础加固（约 10 分钟）

用你买机器时的 root 密码（或密钥）登录：

```bash
ssh root@你的服务器IP
```

然后逐条执行：

```bash
# 更新系统
apt update && apt upgrade -y

# 新建普通用户，之后都用它操作（不要用 root 跑服务）
adduser deploy
usermod -aG sudo deploy

# 允许本机用 deploy 登录（会提示输入 deploy 的密码）
su - deploy
```

**防火墙：只开 22(SSH)、80、443(网页)**

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status        # 应显示三条 allow
```

> 安全习惯：之后可以把 SSH 改成密钥登录并禁用密码，第一次部署可先不做。

---

## 3. 安装 Node.js 24（LTS）

系统自带的 Node 太旧，用 NodeSource 装官方源：

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # 应显示 v24.x
npm -v
```

---

## 4. 拉代码并构建

```bash
# 换成你自己的仓库地址（本分支叫 vps-node）
git clone -b vps-node <你的仓库地址> bias-arena
cd bias-arena

# 安装依赖（better-sqlite3 会自动下载预编译二进制，无需编译工具）
npm ci

# 构建前端
npm run build
```

**先冒烟测试**（不占用 80 端口，用 3000 直接验证）：

```bash
# 前台跑一下，看到 http://0.0.0.0:3000 即成功
node server/index.js
```

另开一个 SSH 窗口验证：

```bash
# 首页
curl -I http://localhost:3000/
# 评论接口（应返回 {"comments":[]}）
curl 'http://localhost:3000/api/comments?round=001'
```

> 注：POST 测试需要带 `Origin` 头，浏览器场景下由同源自动带上。
> 验证完按 `Ctrl+C` 停掉前台进程。

---

## 5. 注册成系统服务（开机自启、崩溃自动重启）

退出前台运行，创建 systemd 服务：

```bash
sudo tee /etc/systemd/system/bias-arena.service > /dev/null <<'EOF'
[Unit]
Description=BIAS ARENA (Express + SQLite)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/bias-arena
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now bias-arena
sudo systemctl status bias-arena    # 应显示 active (running)
```

> `ExecStart` 里的 node 路径以 `which node` 输出为准（nvm 安装的要写完整路径）。

---

## 6. HTTPS：装 Caddy 反向代理

Caddy 会自动申请并续期 HTTPS 证书，新手最省心：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

编辑配置：

```bash
sudo nano /etc/caddy/Caddyfile
```

清空并写入（把 `arena.example.com` 换成你的域名）：

```
arena.example.com {
    reverse_proxy 127.0.0.1:3000
    encode gzip
}
```

生效：

```bash
sudo systemctl reload caddy
```

打开浏览器访问 `https://arena.example.com`——HTTPS 证书自动配好，全屏、音效、评论全部可用。
（大陆机器需先备案且域名已解析到大陆 IP，备案通过前访问会被拦。）

---

## 7. 以后怎么更新代码

```bash
cd ~/bias-arena
git pull
npm ci            # 依赖没变可以跳过
npm run build
sudo systemctl restart bias-arena
```

---

## 8. 数据与备份（SQLite 就是一个文件）

数据库位置：`/home/deploy/bias-arena/data/comments.db`。

**手动备份**（任何时候可做）：

```bash
# 安全导出（热备份，比直接复制文件可靠）
sqlite3 /home/deploy/bias-arena/data/comments.db ".backup /home/deploy/comments-backup-$(date +%F).db"
```

**自动每周备份**：`crontab -e` 加一行

```cron
0 3 * * 0 sqlite3 /home/deploy/bias-arena/data/comments.db ".backup /home/deploy/backups/comments-$(date +\%F).db"
```

> 原 Cloudflare 版评论存在 D1，切换 VPS 后**不会自动迁移**。如需要，可在 Cloudflare
> 控制台把 D1 导出成 SQL，再用 `sqlite3 data/comments.db` 导入（表结构一致）。

**删除恶意评论**（登录服务器执行）：

```bash
sqlite3 /home/deploy/bias-arena/data/comments.db \
  "DELETE FROM comments WHERE id = '评论ID';"
# 或按内容删：
# DELETE FROM comments WHERE body LIKE '%关键词%';
```

---

## 9. 本地开发 / 写代码

```bash
npm run dev        # 前端 5173（热更新）+ 后端 3000（改 server/ 自动重启）
npm run typecheck  # TS 类型检查
npm run validate:comments  # 后端先启动 npm start，再跑这个
```

## 10. 常见问题

| 症状 | 原因 / 处理 |
| --- | --- |
| 域名打不开，大陆机器 | 大概率没备案：大陆机房对未备案域名拦 80/443。要么完成备案，要么换香港/海外机 |
| `curl localhost:3000` 通、域名不通 | 防火墙没开 80/443，或 DNS 没生效，或 Caddy 未 reload |
| 502 Bad Gateway | Node 服务没起来：`sudo systemctl status bias-arena` 看日志 `journalctl -u bias-arena -n 50` |
| 网页能开、评论发不出 | 看后端日志；确认访问的是 `https`（同源校验要求请求来源匹配） |
| 更新后样式/图片还是旧的 | 浏览器强刷一次（`Ctrl+Shift+R`）；index.html 已设为 no-cache，通常不会发生 |
| 想换端口 | 改 systemd 里的 `Environment=PORT=xxxx` 和 Caddyfile，重启两边 |
| 想调评论限流 | systemd 加 `Environment=RATE_LIMIT_PER_MIN=5`（默认 10 条/分钟/IP） |
| 把数据目录挪走 | 加 `Environment=DATA_DIR=/path/to/data`，注意目录权限属 deploy 用户 |

---

## 11. 上线前检查清单

- [ ] 域名 A 记录已指向服务器，浏览器能打开
- [ ] HTTPS 正常（地址栏有锁）
- [ ] 大陆机器已完成 ICP 备案
- [ ] 防火墙只开了 22/80/443
- [ ] systemd 服务 `enabled`（重启机器后自动运行）
- [ ] 已配好每周 SQLite 备份
- [ ] 评论功能在手机上实际发一条验证过
