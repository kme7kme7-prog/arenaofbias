# HANDOFF.md · 当前状态

> 只放当前状态、待办与红线。过程细节进 `docs/handoff/` 归档，产品/技术事实在 `docs/` 对应文档，已定决定在 `docs/DECISIONS.md`——本文不复述它们（决策 011）。

## 接手阅读顺序

1. 本文：当前进行到哪、剩余什么、哪些不能碰。
2. `docs/DECISIONS.md`：既有决定只能由用户显式推翻，优先看末尾最新条目。
3. 按任务读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/DESIGN.md`、`docs/games/guess.md`。
4. 轮次记录按日期在 `docs/handoff/`：最新 `2026-09-25-内测开闸前收口-kme7kme7-prog.md`（邮箱体系/后台改版/模型治理/过场收口），另有 `2026-09-24` 两份。历史记录里的旧待办、旧服务方式、旧提交限制不可当现状。

## 当前状态（2026-09-26）

- **两条线没合并，这是当前第一件事**：线上与最新代码都在分支 `email-auth`（tip `1df778e`：邮箱体系 `21ff18e` + Turnstile `1632613` + 收件箱改版与用户管理页 `b10c4e3` + 模型数据治理 `92d77d3` + 快门与居中收口 `07a6a37`/`e171d8d`）；`main` 停在 `d899e47`（PR #1 只合到 Turnstile），**落后 13 个提交**。继续动手前先定：把 `email-auth` 合进 `main`，还是切回 `email-auth` 干活。`main` 上不要据现有代码判断线上能力。
- 线上 `https://arenaofbias.icu` 跑的是 `email-auth` 的代码，最后一次部署 `e171d8d`（2026-09-25 22:22）；PM2 已配好 `SMTP_*` 与 `TURNSTILE_*`，163 真发信与 Turnstile 真机全链已实测通过。
- 待用户线上复验两处视觉修复：成功卡标题居中、娱乐「同一题库继续」不再露出作品加载过程。
- 数据快照（2026-09-25 核查）：8 题 / 264 作品 / 195 票 / 5 用户，迁移版本 12。数字会自然变化，不是验收标准。
- 邮箱账号体系与 Turnstile 的行为口径见 `PRODUCT.md`（账号、评论与投票），接口与环境变量见 `ARCHITECTURE.md`（后端 API 面、环境变量）。

## 生产运行与同步

- 站点 `https://arenaofbias.icu`，PM2 `arena`，目录 `/www/wwwroot/arenaofbias`；旧 systemd 已停用，不要恢复旧整站 tar + systemctl 部署。
- 部署流程、备份与回滚细则见 `ARCHITECTURE.md`「VPS 部署」。硬规矩：先 commit，再 `npm run deploy:vps -- --check` 审计划，然后 `npm run deploy:vps`；脚本只上传 Git HEAD。
- 凭据只在 `.local/`（vps/admin/smtp/turnstile，均已忽略）：不打印、不进上传包。部署前后逐行核对票/作品/题/评论/反应，不把备份库覆盖线上新数据。

## 真正剩余事项

- 合并 `email-auth` 到 `main`（等用户发话；不要用旧 `main` 覆盖分支上的新提交）。
- 工程维护，均为既有问题、未扩范围：全量 lint 6 错（grid-contrast-check、migrate-model-identity）与 account/dev-panel 两处定向 lint 既有告警；`validate:camera` 依赖未入库的本机作品 fixture。
- 分支末提交 `1df778e` 把若干 `scripts/.tmp-*.mjs` 与 `output/playwright/work-ready-after.json` 提交进了仓库，与「临时工具/生成物不入库」的既有约定不一致，待用户定夺怎么清。
- 模一把防剧透仍待产品方案：前端可推导每日答案，单拆前端模块解决不了；分享导出带答案是用户既有要求，不得擅自撤销。
- 008 背景/提示词仍是用户允许的占位稿，待用户补写；难度精调与存疑模型字段查证属后续内容工作。
- 历史 5 件 006 分享快照超时未复测，不据此宣称已解决。
- 鹈鹕竞赛场/多人玩法仍在构思（IDEAS 不是实施清单）：沿用原作鹈鹕，保留丑/抽象/不像鹈鹕的表达。

## 红线与遗留

- 他人未跟踪 `public/works/005/`、`006/`、`007/` 与 `public/works/works_2026-09-11,a-k.zip` 原样保留：不动、不删、不提交，要动先问用户。
- 旧 005 卡死浏览器标签页是证据：切勿刷新或导航，不能因修复已上线就动它。
- `data/`、`dist/`、`output/`、`outputs/`、`.local/` 是本机数据/生成物/运维记录，不入库、不手改。
- 工作区暂存区有 38 个未提交生成物（`output/playwright/`、`scripts/.tmp-mobile/` 截图与 `portable-design-system.zip`），处置待用户拍板。
