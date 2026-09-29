# 2026-09-29 · share-v2 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex
- 提交范围：`origin/main@d871c75..share-v2`（一条提交）

## 本轮目标

在 Show1 恢复三种分享入口，在浏览器生成分享 PNG，不再依赖共享后端的 501 分享路由；社交链接改用静态通用封面。

## 改动

- `lib/share-client.ts` 只读取现有公开 `/api/prompts`、`/api/works`，竞猜答案取自游戏结算时 `/api/guess/check` 的揭晓结果。`lib/share-card.js` 移植原 SVG 版式和二维码；Canvas 在浏览器导出 PNG。
- 分享链接采用根页 `?share=`，参数按类型重建，不带账号、令牌或其他私密字段。已揭晓的公开模型名称随竞猜记录分享，往期链接可重建含答案卡；这仍是可编辑的个人记录，不认证战绩。
- HTML/网页作品按用户确认采用旧版 A/B 占位框；可读取的公开图片嵌图。`index.html` 和 `public/share-preview.png` 提供统一静态 OG 图，牺牲逐局动态预览换取零后端渲染。
- `src/work-capture.tsx` 改读公开 `/api/works`；Show1 与 Show2 前端 grep 均无退休分享 API 调用。旧单体服务代码保留，相关对照页和验证脚本适配新链路。

## 决策

- 见 `docs/DECISIONS.md` 的 2026-09-29 分享卡条目。HTML/网页作品占位框已由用户确认；公开答案写入链接是根据「链接只带公开信息」和旧卡含答案要求采用的口径。

## 验证

- `npm run typecheck`：通过。
- `npm run validate:share`：5/5 通过。
- 改动文件定向 `oxlint`：0 错；`npm run build`：通过。主页面 JS 281.57→325.51 kB，gzip 93.49→109.85 kB；无新增 npm 依赖，复用已有 `qrcode`。通用 OG PNG 51,080 字节。
- 浏览器连接本地共享后端，生成页面、对决、竞猜三张 PNG；完整截图分别为 `output/share-site-full.png`（1080×1600）、`output/share-duel-full.png`（1080×1760）、`output/share-guess-full.png`（1080×1600）。竞猜样例的答案和反馈来自公开游戏接口。页面卡下载和复制链接成功。
- 未跑全仓 lint：本轮完成标准未要求，改动文件定向 lint 已过。未跑社交平台抓取：本轮不部署。

## 明确没做

未合并、未部署、未推 main、未添加迁移或新的 npm 包；共享后端未增加接口。

## 遗留物

- 既存未跟踪 `.playwright-cli/` 保留；本轮 `output/share-*.png` 只作本地截图，不提交。
- 配套 server `share-v2` PR 删除旧路由；部署顺序为 Show1 先、server 后。静态 OG 图不会按对局/竞猜内容变化。
