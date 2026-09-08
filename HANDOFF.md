# HANDOFF.md · 当前状态

本文件是状态仪表盘：只放当前状态与阅读指引，每轮收工时更新。耐久事实（产品规则、架构、决策）归 `docs/` 各文档，本文不复述；冲突时以交接日志与 git 为准。

## 接手阅读顺序

1. `AGENTS.md`（协作约束，会被自动注入）
2. 本文
3. `docs/handoff/` 里日期最新的一份交接日志
4. 按需查阅：产品行为 `docs/PRODUCT.md` ｜ 架构与运行 `docs/ARCHITECTURE.md` ｜ 决策 `docs/DECISIONS.md` ｜ 想法库 `docs/IDEAS.md`
5. 首次接手先读 `README.md`（长期定位与原则）

## 当前状态（2026-09-08）

- 产品代码停留在 `3529204`：Vite + React 前端、Express + SQLite 后端；提示词库 + 竞技场 + 账号评论体系；题库 7 题，其中仅 002/003 可配对（占位内容，虚构模型身份，见 `docs/PRODUCT.md` 内容真实性分级）。
- 2026-09-08 本轮完成文档体系改造：新增 `AGENTS.md` 与 `docs/`（PRODUCT / ARCHITECTURE / DECISIONS / handoff 模板）；原 `idea.md` 平移为 `docs/IDEAS.md`、原 `ARTWORK.md` 平移为 `docs/ARTWORK.md`；删除原 `PRODUCT_LOGIC.md`（内容并入 `docs/PRODUCT.md`）；部署指南不入库。
- 2026-09-08 改名：对外英文名 BIAS ARENA 全站改为小写单词标 `arenaofbias`（决策 013），中文名"偏见试验场"不变；包名、日志前缀、浏览器标题同步。

## 待办（下一步候选，非约束）

- 004–007 接入模型结果（操作步骤见 `docs/ARCHITECTURE.md` 扩充一节）。
- 真实投票持久化与排行榜（当前投票不落库）。
- 已知不一致：竞技场页"本场收录 N 个模型"未过滤 isDemo，与提示词库页口径不同（用户当前不可见，见 `docs/ARCHITECTURE.md` 技术备注）。
- 待用户拍板：002/003 虚构模型身份的长期取向。
- `docs/IDEAS.md` 全部条目均为候选，未经确认不得开发。

## 最近验证（2026-09-08）

- 通过：`npm run typecheck`、`npm run lint`（0 错误）、`npm run validate:arena`（11 项）、`npm run validate:scroll`。
- 未跑：`npm run build`（AI 沙箱环境限制，需在本地终端复核）；`npm run validate:comments`（需先启动后端）。
- 改名后建议本地 `npm run dev` 目视检查五处品牌位（首页、提示词库、预览页、竞技场顶栏、登录框）。
