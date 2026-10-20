# 2026-10-20 · 题库/作品启动读取退避重试 · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：Grok Bot（研发）
- 提交范围：`7f7b158..本分支唯一提交`

## 本轮目标

部分中国移动用户被 EdgeOne 把 api.arenaofbias.icu 调度到洛杉矶节点，TLS 慢或偶发失败。kme7 批准：题库/作品等关键启动读取在网络错误时自动退避重试，重试期间显示加载中，总耗时有上限；与 Gallery 同步处理，只开 PR，不合并不部署。

## 改动

- `lib/api.ts`：新增 `RetryableRead`。`apiReadJson` 在无响应、12 秒截止、2xx 但不是 JSON 时抛 `RetryableRead`（保留原错误文字），429 抛带 `retryAfterMs` 的 `RetryableRead`（支持秒数和 HTTP 日期）；其他非 2xx 仍返回 null；调用方自己取消时仍抛 AbortError。`readCatalogWithRetry` 由「失败后 400ms 再试一次」改为：只对 `RetryableRead` 按 1/3/6 秒退避（至少 Retry-After），最多再试 3 次；45 秒总预算同时截断等待和进行中的读取；剩余预算不足以等待加一次 2 秒读取时停止。
- `lib/works.ts`、`lib/prompts.ts`：`fetchWorks` / `fetchPrompts` 把 `RetryableRead` 交给调用方，其他失败仍返回 null；`refreshWorks` 保持「失败返回 false」。
- `scripts/api-fixture.mjs`：内联 `@/lib/api` 时允许任意导入列表。
- `scripts/check-loading.mjs`、`scripts/check-catalog-recovery.mjs`：按新语义更新，并新增网络/非 JSON/429 分类、1/3/6 退避、Retry-After、HTTP 错误不重试、三次上限与 45 秒预算的断言。
- 文档：`docs/PRODUCT.md`、`docs/ARCHITECTURE.md`。

## 决策

- 本轮未写 `docs/DECISIONS.md`：参数来自本次批准的修复要求，不是需要长期防止被推翻的产品取舍；如 kme7 认为需要，可以补一条。
- 待拍板：无。

## 验证

- `npm run typecheck`：通过
- `npm run lint`：失败，2004 条，全部是既有问题（如 `app/tanks/royale/bots/vector.js` 的 no-var）；与 main 逐行比较结果相同，本轮改动的文件 oxlint 0 问题。
- `node scripts/check-loading.mjs`、`node scripts/check-catalog-recovery.mjs`：通过
- `validate-reaction-queue`、`validate-placeholder`、`validate-email-gating`、`validate-community-prompts`、`validate-guess-network`：通过；`validate-votes`、`validate-formal`、`validate-leaderboard` 失败，main 上同样失败，输出一致。
- `vite build`（生产模式）：通过。
- 浏览器（本机 Chrome + Playwright，本地伺服构建产物，拦截 `/api/prompts`，其余请求转发线上）：前两次连接重置 → 「正在同步」→ 第 3 次成功；持续失败 → 1/3/6 秒后共 4 次请求，约 10 秒后回退内置题库并提示；500 → 不重试。
- 线上核对：线上 `assets/api-DkC51Jz1.js`、`assets/works-DQGqMeIt.js` 与 main `7f7b158` 构建产物逐字节相同。

## 明确没做

- 没有合并、没有部署。
- 投票、榜单、声望分、账号等其他读取没有加退避；`apiReadJson` 的其他调用方（ratings、tier）行为基本不变，只是网络失败的错误类型变为 `RetryableRead`，tier 页 429 时提示改为「访问较频繁，请稍后再试」。

## 遗留物

无。

## 下一步建议

- 治本仍在调度侧（EdgeOne / DNS 线路），由运维和 kme7 决定。

## 追加：重试用完不回退内置题库（同日第二个提交）

kme7 合并前要求去掉「重试用完后回退内置题库」，改为明确的失败提示和重试按钮。上文「回退内置题库并提示」的描述以本节为准。

- `lib/prompts.ts`、`lib/works.ts`：状态新增 `{ status: 'error' }`。`loadPrompts` / `loadWorks` 重试用完后进入 error，不再写成 `ready/builtin`；再次调用（重试按钮、online、切换路由）重新走完整的 1/3/6 秒退避。
- 保留的内置逻辑（被其他地方同步依赖，只在这条加载路径上去掉）：`currentPrompts()` / `currentWorks()` 在未就绪或失败时仍返回内置种子 / roster，供投票、榜单、评论、占位模式等同步调用兜底；加载期间题库页也仍先显示内置种子（原有行为）；`refreshWorks` 不变。
- `app/prompt-library.tsx`：失败时不列出内置题目，通知条显示「题库连接失败，请检查网络后重试。」和「重试」按钮，空白区显示「题库暂时连不上」。
- `src/main.tsx`：`#arena`、`#random`、`#arena/<id>`、`#formal/<id>` 在失败时显示「题库暂时连不上」和「重试」按钮，不再用内置作品挂载竞技场。
- `lib/portal-entry.ts`：失败状态同样让入口门显示失败。
- `lib/messages.ts`：新增三条英文翻译，删掉不再使用的「当前显示临时内容」。
- `scripts/check-catalog-recovery.mjs`：失败断言改为 `status === 'error'`，并新增两条断言：作品失败也不回退；重试会重新进入 loading 并走退避。

验证：typecheck、`npm run build`、`check-loading`、`check-catalog-recovery` 通过；lint 和三个 validate 脚本的失败与 main 相同。本机 Chrome 模拟 `/api/prompts` 与 `/api/works` 持续连接重置，结果如下：
- `#prompts`：约 10 秒后出现失败提示和「重试」按钮，题目数为 00，不显示内置题目。网络恢复后点重试，96 道题加载成功。仍然断网时点重试，会再请求 4 次，然后回到失败提示。
- `#arena/022`：失败页面带重试按钮，点击后进入远端题目页。
- `#random`：失败页面带重试按钮，点击后跳到远端题目 `#arena/q-e72619640152afc2`。
