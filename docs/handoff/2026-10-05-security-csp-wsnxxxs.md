# 2026-10-05 · 游戏脚本 CSP 加固 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 / Codex Desktop。

## 本轮目标与决定

核实用户漏洞报告并修复真实缺口。用户明确要求竞猜部分先不管，因此猜测规则、算法与接口代码未修改。未删除旧 server、未撤生产 game /api 兼容代理，不修改历史作品资源。

## 改动

Vite 在构建后的每个 HTML 入口最前面加入 CSP meta：只允许当前内联脚本的 SHA-256 哈希、自身脚本和 Cloudflare，保留 Blob Worker，禁 object，并限制 base。与既有 Nginx 策略同时生效；原来头部的 unsafe-inline 不能放开不符合 meta 的脚本。

## 验证

lint、typecheck、build:check、diff --check 通过。隔离后端下游戏首页与纸色主题正常，额外内联脚本和 onclick 都被拦截，Blob Worker 正常。没有修改游戏布局，未重跑竞技场全部交互；竞猜按用户要求未测写入或改变行为。

## 明确没做

未 push、未部署、未操作生产账号/票/邮件；未修改原作、数据仓、数据库。当前线上 game 已有 CSP 与 HSTS，报告「完全无 CSP」并不成立。

## 遗留物与下一步

本轮本地 dist 是 build:check 产物，不入库；正式发布仍须配置正式 API 地址。统一核查表与临时验证材料在 Gallery 的同日 security-review 归档及忽略 output。发布后才能宣称线上脚本策略已收紧。
