# 2026-10-05 · 游戏远端归并与统一发布准备 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：GPT-6.1 Sol / Codex Desktop。
- 提交范围：本地 8b0dd86 与 origin/main e3e96a8 归并为本轮整合提交。

## 本轮目标与改动

用户授权四仓联调、适用分支合并、提交、推送和统一部署。初始工作区干净；origin/main 已包含 fork/main。保留本地 CSP 加固，合入社区题号、旧占位退役、首页缓存、娱乐加载稳定性、投票人数和升级入口完成变更。HANDOFF 仅追加冲突已保留双方内容，无业务代码冲突。paper-ink-theme 与旧 integration-game 均已进入主线，没有待合独有功能。

修复三份过时夹具：api-fixture 同时处理 apiReadJson，arena 通过合成跨模型作品验证配对，placeholder 用完整原数据快照验证隔离。没有扩展业务功能。

## 验证

lint、typecheck、build:check、diff --check 通过；arena 13、placeholder 10、community IDs 3、娱乐入口 19、work-ready 16、work-retry 13、stability 5 全通过。取消/前台时钟、首页封面缓存、game-transitions、arena-scroll、vote-split --votes-only 通过；已查看社区题库及竞技场手机截图。完整 check-vote-split 的旧巡览断言仍不适用，因此仅运行新投票人数与榜单刷新检查。无 check/test 聚合脚本，也无 GitHub workflow，不称本地检查为 CI 通过。

生产包将从本轮固定提交 git archive 的 LF 源码导出，以既有 node_modules 和显式 VITE_API_BASE_URL=https://api.arenaofbias.icu 构建，精确 SHA、产物路径及公网结果由协调代理汇总。

## 决策与边界

沿用已批准的社区题映射、移除旧占位与娱乐恢复决定，无新产品决策。业务源码相对历史发布 9202875 已变化，游戏须与共享后端新契约协调重发。本代理不部署；协调代理保留旧 works/ZIP/hash 资产及 game /api 反代。

未重跑真实作品全量、生产登录/计票/邮件/Turnstile、真机、长期后台或逐帧性能；隔离浏览器不写生产票。未修改后端、数据仓、Gallery、作品源和数据库，竞猜仍搁置。

## 遗留物

本地 output/dist、忽略数据与独立工作树保留，没有清理。将以负责人 noreply 署名单条英文合并提交同步 origin/main 与 fork/main。
