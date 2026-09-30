# HANDOFF.md · 当前状态

## 2026-09-30 · vote-branch-sync（已改名并同步最新远端，未推送）

- 用户要求删除分支名的 codex 字样；主站与 server 本轮分支均为 `show1-vote-processing`。已 fetch origin/fork；主站远端新增 `613f912`、`09387a9` 两条双主题提交，本分支已 rebase 到 `origin/main@09387a9`，投票功能提交由 `70f7009` 变为 `53b6351`。
- 唯一冲突是 HANDOFF 顶部记录，保留双方全部内容；`app/ranking.tsx` 自动合并，ThemeToggle、纸/墨主题、减少动态效果和画像过场保留。最终合并预检无冲突。
- 本轮验证：typecheck、build、榜单 12/12、check:theme、check:motion、四个改动源文件定向 lint 和 diff 检查均通过。未补做浏览器验收或全量 lint；上一轮投票浏览器验证与既有 lint 边界继续有效。详细归档见 `docs/handoff/2026-09-30-vote-branch-sync-wsnxxxs.md`。
- server 远端仍为 `26da6d6`，本轮分支已包含其主线且无冲突，后端功能代码不变。未 push、部署或操作业务库；两站实际清零的执行环境仍待用户答复。

## 2026-09-30 · 竞技场双主题已推送 main 并上线 VPS

- 无冲突后已将实现提交 `613f912fd395f938274f1ef679b9efc3a63af407`（Atmeplz，增加纸墨双主题与主题过场）快进推送上游 `main`。生产前端由该提交的独立 Git 归档构建，于北京时间 13:41 完成发布；本条及归档补记是随后提交的上线记录，未改变发布代码。
- `/www/wwwroot/show1-dist` 786 个文件与完整 SHA-256 manifest 逐份相符；上传 11 个变化文件，13 个过期哈希资源只在暂存目录移除后切换。旧站完整保留在 `/www/wwwroot/show1-dist.prev`；任务与 manifest 位于 `/root/static-deploy-show1-613f912fd395f938274f1ef679b9efc3a63af407/`。
- 公网 `https://arenaofbias.icu` 三入口与 9 个新 JS/CSS 资源均 200 且哈希一致；HTML 为 no-cache，带哈希资源为 immutable。桌面 1440 / 手机 390 的 10 组主路由检查、主题切换 / 刷新持久化 / 选中态 / 登录弹窗通过，无页面异常或横向溢出，公网截图已目检。独立构建再次通过双主题作品就绪 10 项回归。
- 共享后端仍为 `26da6d6a350bbb4464879206bdbeb0c7eb303087`，数据包 `2cb2a5b265e8bda8c8069a4b498f1046d825acee`；服务 active，展览馆入口哈希不变。本轮没有更改后端、数据库、Nginx 或作品。
- 构建环境记录：Windows tar 解中文文件名失败，改为 Python UTF-8 校验解包；`npm ci` 暴露主线锁文件缺少可选 `@emnapi/core` / `@emnapi/runtime@1.11.3` 的问题。本轮未改锁文件或依赖，核对清单与基线一致、`npm ls --depth=0` 通过后，独立源码归档复用现有已验证依赖构建成功。该既有安装问题留待单独处理。
- 完整归档：`docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md`。本机发布包、计划、产物/公网验收证据在 `.local/theme-release-20260930-613f912/`；他人未跟踪作品保持原样。低端真机、高 DPR 与真实 Turnstile 端到端未补测，仍见交付说明的验证边界。

## 2026-09-30 · 双主题发布已获授权，远端无冲突

- 用户明确要求“看看是否冲突，不冲突就 push 到 repo，然后落实到 VPS”，已授权本轮提交、推送与生产前端发布。重新 fetch 后 `HEAD = origin/main = 38dad57`，无远端新增或合并冲突；署名使用已登录 GitHub 用户 Atmeplz 及其 noreply 邮箱。
- 发布前 typecheck、check:motion、check:theme、validate:share 与 diff 检查通过；此前主题浏览器、生产构建和双主题作品就绪回归通过。归档为 `docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md`；部署完成后追加线上结果。
- 已实查公网 bootstrap 和 VPS `.server-version` 均为共享后端主线 `26da6d6a350bbb4464879206bdbeb0c7eb303087`（wsnxxxs 后续数据治理改动），不是上次部署的旧版本。前端按最新共享后端 `docs/deploy.md` 使用 `/www/wwwroot/show1-dist` 差异发布；从已推送主线提交归档构建，不带工作区未跟踪作品。仅替换前端静态目录，不运行退役 PM2 部署脚本，不更改共享后端或数据库。

## 2026-09-30 · 墨色强调已纠正为橙色，未提交或部署

- 用户重申既定要求：深色下浅绿风格必须改成橙色。已将墨色主强调设为 `#f2a365`，柔和强调 / 背景洗色为 `#dfad85` / `#34281f`；旧绿色品牌兼容令牌及其半透明色统一引用橙色角色，按钮、焦点、选中态、装饰与过场同步。原纸面颜色逐项比对未改动。
- 模一把绿色命中仍为 `#a1c58e`，黄色接近、红蓝阵营与作品原色不改。主题幕从第一帧就使用目标主题刻度色：过墨橙、揭纸绿。此约定已追加到 `docs/DECISIONS.md`，旧方案中的墨色黄绿品牌映射作废。
- 本次复验 `check:theme`、`validate:theme`、`build` 通过；橙色按钮字色对比度 8.04:1，真实浏览器逐帧检查双向切换的 prepare / cover / settle / reveal 均为正确目标色；首页纸 / 墨和墨色模一把截图已目检。截图与帧检查结果在 `output/playwright/orange-*`，完整交付补丁重新生成。未重跑与此次颜色修正无关的业务验证；未 commit / push / 部署。

## 2026-09-30 · 纸 / 墨双主题已本地实现，未提交或部署

- 用户随后明确“严格符合第一次提示词，并符合人类直觉……做吧”，已进入第二段实施；采用第一段推荐的 A「过墨 / 揭纸」。原第一段与基线记录保留在下方，不能再当作待授权状态。
- 交付说明、逐文件索引与人工验收矩阵：`docs/THEME-DELIVERY.md`。完整补丁与截图 / 测量放在忽略目录 `outputs/theme/`。原方案与完整动画盘点为 `docs/THEME-PLAN.md`。
- 已接入纸 / 墨令牌、无闪烁启动、导航切换与系统重置；完成入口可达 CSS 颜色迁移、六种双主题过场、同题快门、发牌、账户与结果动效。文字容器原位；作品不反色；就绪门闩不提前放行。原 73 条关键帧移除 31 条、新增 8 条，现 50 条。纸面的 68 个弱字令牌按批准方案修正对比度，其他静态构图与主要底色保留。
- 验证：typecheck、build、check:theme、check:motion、validate:theme、validate:share（6 项）、validate:work-ready（两主题共 10 项）通过。1440 / 390 宽主路由双主题、三版首页、320 宽导航、账户五状态、分享、竞猜与过场平台已检查；新增代码定向 lint 通过，全量 lint 仍为 9 个旧脚本问题。
- 6 倍 CPU 降速证明正文坐标 / opacity / transform 稳定，揭幕样本无超过 50ms 的主线程帧间隔；盖幕与全遮挡重算仍有长间隔，不声称低端真机恒定 60fps。发布前仍须 Android / iOS Safari、高 DPR 与真实 Turnstile / 生产作品联调，详见交付报告。
- 本地预览为 Vite 5173 + 仅绑定 localhost 的旧后端种子数据（独立 `.local/theme-preview-legacy-data`）；账户会员态用只读浏览器 fixture，不代表共享后端业务联调。未 commit / push / 部署，未写归档；原有未跟踪作品未动。

## 2026-09-30 · 远端已合并，双主题第一段方案（实施前记录）

- 用户授权“先合并到本地，在最新进度的基础上再做要求”。当前分支 `codex/guess-modality-match` 已从 `ee98710` **快进至 `origin/main@38dad57`**，无本地独有提交；本会话两份需求文档已恢复，`HANDOFF.md` 新增段落冲突保留双方内容后解决。临时 stash 已清理，既有未跟踪作品原样保留。
- 第一段完整方案在 `docs/THEME-PLAN.md`：实际来源与版本、全局 / `--pdk-*` / `--dk-*` / 局部令牌映射、全部动画四类清单、两种标志性切换候选、文件及行数计划。**等待用户确认第一段，再开始主题实现。** 推荐 A「过墨 / 揭纸」；需要一并确认纸面信息性弱字为达到 4.5:1 所需的最小颜色调整。
- 静态盘点：主入口可达 18 份项目 CSS，73 个关键帧（纸面专用 13 / 中立保留 25 / 需删除旧轨道 20 / 重新设计 15），130 处 animation / animation-name、127 处 transition / transition-property 声明（含禁动画覆盖）；JS / 工具类 / 占位 iframe 动效另列。原始审计数据与脚本在忽略目录 `.local/theme-audit/`，完整清单已嵌入方案，不依赖该本机目录阅读。
- 合并后验证：`typecheck`、`build`、`validate:share`（6 项）、`check:motion`（现有六组检查）通过。仅做基线与静态核查；新主题视觉、FOUC、键盘与低端帧率尚未验证，未重跑全量 lint。本轮业务代码只来自远端合并，未实施主题，未 commit / push / 部署，未连接 VPS。
- 以当前代码为准：`app/page.tsx` 等待作品现为 `while (!poll())`，不能照下方旧交接恢复 8 秒提前放行；下文历史 PR / 部署描述不代表今天的现场状态。

## 2026-09-30 · show1-vote-processing（本地实现，未推送、未部署）

- 从 `main@38dad57` 建立，当前分支名为 `show1-vote-processing`。真实榜单只请求共享后端 `/api/show1/leaderboard`，接收排名、比较统计、六维画像和题目覆盖；配色、文案与交互留在前端。范围/赛道切换取消旧请求，错误可重试；开发占位模式保留本地聚合。
- 配套 server 位于 `C:\Users\Ryan\.codex\worktrees\show1-vote-processing\arenaofbias-server` 的同名分支（基底已纳入 `2e879fb`）：聚合与配对评分同源、旧快照票不回流、身份更正参与计分，提供先备份再清 votes/matches 的维护命令。用户确认主站和画廊全部票归零；实际业务库执行环境的提问仍待回答。
- 验证：typecheck、build、既有榜单验证 12/12、四个改动源文件定向 oxlint 通过；共享后端 check 64 文件 0 错、测试 133/133。实际浏览器核对胜/平、娱乐/正式、赛道、390px、失败重试；请求日志确认榜单不再 GET 全量票。新建隔离库清零并重启后主站空榜、画廊零票。
- 未操作既有本地业务库或生产库，未 push/部署；全量前端 lint 未跑，已知 9 个旧脚本错误保留。先发布新共享后端并停机备份清零，再发布本前端；本仓旧 `server/` 未接入聚合接口，联调须代理共享后端。遵循用户英文简单句提交要求，不修改 `docs/DECISIONS.md`。
- 详细归档见 `docs/handoff/2026-09-30-show1-vote-processing-wsnxxxs.md`；浏览器截图和隔离库在 server worktree 忽略的 `output/`，临时服务收工关闭。

## 2026-09-29 · email-auth-v2（待 PR 审阅，未部署）

- 本分支从 `origin/main@d871c75` 建立；恢复账号页绑定/换绑邮箱、登录页忘记密码，以及注册和发码处的 Turnstile。注册仍只需账号和密码，邮箱在登录后选填。
- Show1 账号流程已在本地浏览器通过 Vite 代理连接 `arenaofbias-server/email-auth-v2` 联调：无邮箱注册、假 SMTP 绑定、验证码重置、新密码登录成功。重置发码统一提示，不展示绑定邮箱，避免账号枚举。
- 验证：`npm run typecheck` 通过；`npm run validate:email` 旧后端脚本 27/27 通过，但仍覆盖旧的必填邮箱契约，不代表共享后端测试；`npm run lint` 报 9 个旧脚本错误，本轮账号源文件未参与该全仓命令。共享后端测试见其归档。先部署 server PR，再部署本 PR；未部署、未合并。
- Playwright CLI 生成的 `.playwright-cli/` 为本轮未跟踪文件；自动审查拒绝删除，未纳入提交，需人工清理。


> 只放当前状态、待办与红线。过程细节进 `docs/handoff/` 归档，产品/技术事实在 `docs/` 对应文档，已定决定在 `docs/DECISIONS.md`——本文不复述它们（决策 011）。

## 2026-09-29 · share-v2（待 PR 审阅，未部署）

- 第二轮 SH-02：弹窗关闭后生成才完成时，立即撤销新建的 object URL；`validate:share` 增加取消路径检查，typecheck 通过。未部署。

- 从 `origin/main@d871c75` 建立。恢复对决、模一把和页面分享入口；浏览器从共享后端现有公开接口读取数据，沿用旧 SVG 版式与 `qrcode` 生成 PNG。链接只带公开字段；HTML/网页作品用旧版 A/B 占位框，图片作品能公开读取时嵌图。
- OG 改用 `public/share-preview.png` 通用静态图，不再按局生成。共享后端配套 `share-v2` 分支删除 501 占位路由并修复找回密码发信时序；部署应先 Show1 后 server。本轮无新增 npm 包、无迁移、不合并、不部署。
- 验证：`npm run typecheck`、`npm run validate:share`（5/5）、改动文件定向 oxlint、`npm run build` 通过；本地浏览器实际生成并保存页面、对决、竞猜三张完整截图到 `output/share-*-full.png`，下载与复制链接成功。主页面 JS gzip 93.49→109.85 kB。
- 既存未跟踪 `.playwright-cli/` 保留；本轮 `output/share-*.png` 是未提交验收截图。

## 2026-09-30 · 竞技场纸 / 墨双主题与主题感知过场（需求与前置检查记录）

- 用户已给出下一项任务：竞技场增加 `data-theme="paper" | "ink"`，全部过场按主题适配；完整约束与两段式交付要求见 `docs/DECISIONS.md` 同日条目。
- **用户明确说实施前还有很多检查工作；先完成前置检查，再交第一段方案，等用户确认后才进入第二段代码实施。** 随后指定核对远端结构，再授权本地合并并按最新进度准备方案；当前完成情况见本文顶部。
- 用户描述的输入材料为 `inputs/`：`globals.css`、`design-kit.css`、`game-transitions.css`、`home.css` / `home-next.css`、`guess.css`、`arena-refinement.css`、`ranking.css`，以及 `gallery-exhibition.css`、`admin-dual-theme-reference.css`。**本地与已核对的远端主仓库均无 `inputs/`**；实际入口仍为 `src/main.tsx`，页面 CSS 在 `app/`。`--pdk-*` 在 `portable-design-system/design-kit.css`，`design-kit/design-kit.css` 使用 `--dk-*`，两者均未导入主站。原“约 16 个 CSS 文件 / 300+ 引用”是用户背景；精确统计与口径见方案。
- 初次接手时分支为 `codex/guess-modality-match`，无已跟踪文件改动；本会话本地改动为 `HANDOFF.md`、`docs/DECISIONS.md` 和新增 `docs/THEME-PLAN.md`，既有未跟踪作品原样保留。不写归档、不 commit / push / 部署；验证结果见顶部。

## 2026-09-30 · 首项前置检查：远端仓库结构（GitHub 已核对，线上未复核）

- 首项检查当时仅 fetch 主仓库与 `.local/arenaofbias-server` 的 origin，未合并；当时竞技场本地 `ee98710`、远端 `main@38dad57`，本地独有 0、远端新增 4 个提交，20 文件变动（+1489 / -405）。**此后已按用户授权快进合并，见顶部。**
- **当前是四仓分工**：`kme7kme7-prog/arenaofbias` = 竞技场前端（Show1）；`wsnxxxs/same-prompt-gallery` = 展览馆前端（Show2，`main@efaae9c`）；`kme7kme7-prog/arenaofbias-server` = 两站共享 API、运行数据库、作品沙盒与公共管理后台（`main@338bb3f`）；`kme7kme7-prog/arenaofbias-data` = 馆藏作品、题目、模型 / Harness / 服务商注册表及版本化数据包（`main@abcfda7`）。数据仓不是线上用户 / 投票数据库。
- 主仓库前端仍采用 `src/main.tsx` + `app/` + `components/` + `lib/`，没有整体迁到新目录。9 月 28 日的 `d871c75` 已进行平台切换；`admin.html` 现直接跳到 `https://api.arenaofbias.icu/admin/`。本仓 `server/`、`src/admin.tsx`、`app/admin/` 等旧单体实现仍在，不能仅凭文件存在判定其仍参与当前生产链路。
- **这次远端新增**：PR #3 `email-auth-v2` 恢复绑定 / 换绑邮箱、找回密码和 Turnstile，注册仍只需账号密码；PR #4 `share-v2` 恢复分享入口，改为浏览器生成 PNG，新增 `lib/share-client.ts` / `lib/share-card.js`，OG 使用 `public/share-preview.png` 静态图。账户与分享组件 / CSS、`index.html`、`src/main.tsx` 均有变化，主题方案应核对最新版本。
- **参考样式的真实来源**：展览馆仓库的 `site/style.css`、`site/exhibition.css`；共享后端仓库的 `admin/admin.css`、`admin/admin.js`、`admin/index.html`（已确认包含 dark / light 主题机制）。这些可作为上游参考；与用户提到的 `inputs/` 快照是否完全一致，尚无材料可比。
- **旧交接状态更正**：共享后端 PR #8 已于 2026-09-29 21:29（北京时间）合并为 `2ae065d`，不再是“待管理员合并”；下方同日历史记录保留。最新远端文档也有“待 PR / 未部署”旧文字，合并状态以 GitHub 和提交图为准。
- 运行与发布应参考共享后端的 `docs/deploy.md`：两个独立静态目录、共享 systemd 后端；旧 PM2 / 旧 Show1 `deploy:vps` 已退役。本轮未连接 VPS、未核验公网运行版本，不能将上述 GitHub HEAD 当作已部署版本。检查结果为源代码 / 文档 / GitHub API 对照，未运行应用或功能测试。

## 2026-09-29 · 模态判色修复（已部署）

- 用户确认“模态完全相同就变绿”，已同步修改 `lib/guess-logic.ts` 与共享后端 `server/show1/guess-logic.mjs`；不同模型同为「图」也为绿，其他属性与胜负判定不变。
- 修复前已 fetch：原本地 `codex/public-beta-repair@e4c3980` 与 GitHub `main@d871c75` 不一致；本轮基于后者建立 `codex/guess-modality-match`，旧分支及他人未跟踪作品保留。共享后端克隆在 `.local/arenaofbias-server`，基底 `main@0b512bd`，VPS 98 份已跟踪文件与该版本逐份一致（忽略部署换行差异）。
- **当前生产拓扑已变**：主站静态目录 `/www/wwwroot/show1-dist`；API 与后台使用 `/www/wwwroot/arenaofbias-server`，systemd `arenaofbias-server.service`，API 端口 5273、作品端口 5180。旧 `/www/wwwroot/arenaofbias` 与 PM2 `arena` 已停用，下方旧部署说明仅是历史，禁止据此覆盖新站。页面模态反馈直接来自 `/api/guess/check`。
- 本地验证：前端 `validate:guess` 38 项、typecheck、build 通过；共享后端语法检查 49 文件、测试 105/105 通过。截图四模型的回归在旧逻辑上先失败、修复后通过，含同模态不同模型、完整集合顺序/重复、部分匹配与文本/多模态两向比较。
- 定向 lint 与 diff 检查通过；全量 lint 仍有 main 基线的 9 条脚本错误，本轮不修改这些无关文件。用户本轮要求三端修复，包含必要提交、推送与当前服务发布。
- VPS 已发布并经公网页面验收：四个截图模型同为「图」均为绿，图+视为黄，纯文本为灰，猜中目标也为绿。桌面与 390px 手机视口已目检，无页面错误。使用真实练习局/API 判定，仅在浏览器选定已有练习局，不伪造反馈、不写每日战绩。
- 生产备份 `/www/wwwroot/arenaofbias-server-backups/modality-20260929T125932Z`；数据库仍 v14、quick_check=ok，26 用户/267 作品/599 票/16 评论/56 评价/4 猜题记录逐行无变化。静态站点无需重建；页面直接消费新接口颜色。完整记录见 `docs/handoff/2026-09-29-模态判色修复-Atmeplz.md`。
- GitHub：前端修复 `682a0f9` 已推送上游 main；共享后端修复 `5650315` 已推送 `Atmeplz/arenaofbias-server` 的 `codex/guess-modality-match`，并提交 [上游 PR #8](https://github.com/kme7kme7-prog/arenaofbias-server/pull/8)。Atmeplz 对共享后端只有读取权限，直接推送上游被 GitHub 403 拒绝；PR 待管理员合并。VPS 已包含修复，后续切勿用未合入 PR 的上游 main 覆盖。

## 2026-09-25 提醒字居中真因 + 快门重构：盖满才换稿/进度条/退场落成品（已 commit e171d8d 并部署）

- **「还是歪的」真因（像素级量证）**：不是旋转——全局 `.account-dialog h2 { max-width: 330px }`（为登录页长标题避印章设的）被成功页短标题继承，330px 盒靠左使「登录成功。」整体吊在卡片中轴左 73px。修法 `.account-success h2 { max-width: none; margin: 0 auto 8px }`（app/account.css）；残差 6px 是内容盒左右内边距差的一半，与 ✓/说明完全同轴。上一轮去 rotate 修的是真问题但不是用户指的这个。
- **快门重构（用户原话「不论如何 都不能看到后面作品的加载过程」）**，根因三层：
  1. `shutter-in` keyframes 自带退场（0.61s 到点自己扫走），之后 ARRIVE 还在等就绪——加载裸奔再被「正在接入试验场」盖住。已拆成 `shutter-cover`（进场钉在盖满位）+ `shutter-exit`（仅 `.shutter-exit` 类=门控真等到就绪的 ARRIVE 才播，扫开直接落成品）（app/globals.css）。
  2. 换稿时机：点「同一题库继续」只暂存新对（nextPairRef），**快门盖满（500ms）才 setPair**——原来点击瞬间换稿，进场扫的 0.45s 里新作品加载从右缘缝里漏（app/page.tsx transition effect）。
  3. 换稿提交竞态：setPair 后等 iframe src 属性真变再等就绪；就绪判定加「文档地址对上当前 src」防旧文档假就绪（帧采样抓到过 2 帧裸加载）。
- 配套：快门上加 A 红/B 蓝双侧进度条（用户指定形态，就绪即填满队色）；门控放行的 ARRIVE 走 intro 快速通道——加载过场整段跳过、「正在接入试验场」遮罩不再挂载；8s 兜底放行把卡死状态带进 intro，跳过按钮立即可见（原要再叠 8s 计时）。首次入场/兜底路径行为不变。
- 验证：临时帧采样脚本 `scripts/.tmp-verify-transition.mjs` 13/13（换对/重播全程零裸加载帧、遮罩零出现、换源在盖满后 50ms、揭幕双侧 sent；fixture 需真实延迟+探针）；旧回归 validate-work-ready 5/5（慢作品断言按新口径改为 phase-transition）；快门保持期截图人工复核全盖+双条在跑。typecheck 干净、lint 基线 9。
- 改动文件：app/account.css、app/globals.css、app/page.tsx、scripts/validate-work-ready.mjs、docs/DECISIONS.md、HANDOFF.md。**已 commit `e171d8d` 并部署 VPS**（备份 aob-deploy-20260925T142201Z-e171d8d3；线上已验：居中规则/shutter-exit/shutter-progress 三标志全在、API 200）。临时验收脚本 scripts/.tmp-verify-transition.mjs 未入库（.tmp 惯例）。待用户线上复验：成功卡标题是否居中、换对局是否一幕到底不再见加载。

## 2026-09-25 提醒文字去歪斜 + 换对局快门钉到作品就绪（已 commit 07a6a37 并部署）

- **提醒字去歪**：用户两次反馈登录成功等提醒字是歪的。根因：拍落入场动画起始帧带 rotate(1.8deg)，落定其实是正的，但前 1/3 时程已不透明仍歪着。修法：`account-page-turn` 和表单切换 `account-page` 两个 keyframes 删起始 rotate（拍落位移/缩放/回弹保留）；装饰纸堆倾斜是设计本体没动。对照页 reference/account-turn-review.html 已同步。用户第一次反馈时改了之后仍报歪——因为**修复只在本地没部署**，线上照旧（部署后需用户在线上复验一次）。
- **换对局快门钉到就绪**：用户反馈娱乐模式换对局「过渡→半加载露出→接入试验场再盖→才好」。两层修法：① 服务端吐作品文档一律注入就绪探针（server/work-bridge.js `injectWorkProbe`，load+3帧+600ms 上报 aob:work-ready，8s 兜底）——此前 data-aob-probe 只存在于测试 fixture，真实作品就绪判定落在 interactive（three.js 还在编译着色器）；② 同一题库继续的 transition 快门从固定 620ms 改为等 waitWorksLoaded（探针口径，已从 intro effect 提升为组件级共用）才 ARRIVE，620ms 降为最短节拍，8s 超时兜底放给 intro 跳过出口。
- 验证：本地真浏览器逐帧采样——同题库继续快门 1620ms 结束（两作品 1406/1461 就绪之后）、换个题库纸幕 1462ms 扫出（探针 830/913 之后），全程零裸加载零加载遮罩闪现；typecheck 干净、lint 基线 9 无新增；测试投票已清。
- 改动文件：app/account.css、reference/account-turn-review.html、server/work-bridge.js、server/index.js、app/page.tsx、docs/DECISIONS.md、HANDOFF.md。**已 commit `07a6a37` 并部署 VPS**（备份 aob-deploy-20260925T130610Z-07a6a37b；线上已验证探针注入生效、API 200、PM2 在线）。待用户在线上复验：提醒字是否已正、换对局过渡是否一幕到底。

## 2026-09-25 内测开闸前模型数据治理（五组合并 + 榜单单题规则 + 家族名两套口径；已 commit 部署）

- 分支 email-auth 最新提交 `942265c`（视角校准构建时注桥）。本轮模型治理（数据+代码）经用户授权 commit 并部署 VPS。
- **两套显示口径（用户拍板）**：对局揭晓/题库/作品管理显示每件作品的具体型号（works.model_name，已按作品 id 从合并中还原：Claude Fable 5/5.1/5.2 Max、Gemini 3.7/3.8 Flash、Muse Spark 1.2/1.3、Claude Opus 5/5.5?）；**排行榜按 modelId 合并计算显示家族名**（lib/leaderboard.ts `FAMILY_BOARD_NAMES`：Claude Fable 5.x、Claude Opus 5.x、Gemini 3.x、Muse Spark 1.x、GLM-5.3-Flash）。后台登记/模型清单对合并条目返回家族名 + 备注（server `MERGED_MODEL_META`）；登记复用家族条目时显示名取家族名。
- 合并已上线（幂等脚本 `scripts/.tmp-merge-models.mjs` + `scripts/.tmp-restore-specific-names.mjs`，works/votes/reactions 三表同改+断言；线上 264 作品/195 票守恒、旧代号零残留）：ox-alpha→**GLM-5.3-Flash**（GLM-5.3 与 GLM-5.3-Flash 是两个模型，不并）、Fable 5/5.1/5.2 Max→`claude-fable-5.x`、Opus 5/5.5?→`claude-opus-5.x`（样本不足合并）、Gemini 3.7→`gemini-3.8-flash`、Muse 1.2→`muse-spark-1.3`；reactions.mid 同步迁移（同用户双条目反应按较新合并）。**DeepSeek V4 Pro（灰测0821凌晨）保留不动**（用户明示特殊）。**Seed 2.1 Pro 显示名已改 Doubao Seed 2.1 Pro**（id 不变）。详见 `docs/DECISIONS.md` 末两条。
- **榜单规则**：已发布作品只覆盖 1 道题的模型不进榜（一次覆盖星图/折线/墨池/回声占位条目与 9 个只有鹈鹕的模型；发布第 2 道题自动回榜；纯历史阵容不受影响；占位演示模式不适用）。
- 验证：typecheck 干净、lint 基线 9 无新增；本地浏览器实测榜单家族名/隐藏规则/作品页具体型号/登记下拉家族名与备注；线上库合并与名称还原后逐条校验。线上备份：`data/comments.db.pre-merge-*.bak` 与名称快照。
- 已知边界：收件箱模型下拉只按家族名/modelId 过滤——将来登记新版本（如 Gemini 3.9）想并入家族时需在后台把作品显示名改成具体型号（PATCH 作品模型名即可）；占位条目作品仍在题库可见（只是不进榜）。

## 2026-09-25 后台收件箱改版 + 用户管理页（分支 email-auth，已 commit b10c4e3 并部署 VPS）

- 本轮（收件箱改版 + 用户管理 + 模一把记名 + 数据流水模一把页签 + 字号）已 commit `b10c4e3`，连同分支上前两个提交（21ff18e 邮箱体系、1632613 Turnstile）一起于 2026-09-25 部署上线；PM2 arena 已补 SMTP_* + TURNSTILE_* 环境变量并 pm2 save。线上验证：turnstile 下发 siteKey、8 题/236 作品/188 票/5 用户原样、迁移 012 已应用（guess_results.user_id）。部署备份 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-20260925T073352Z-b10c4e32`。**分支 email-auth 已 push（origin/email-auth = 928db81）。**

- 收件箱改版（用户拍板：页面直传、文字作品一文件一作品、卡片式带预览）：`/api/admin/models`（模型清单）、`inbox/upload`（octet-stream 直传 8MB，零依赖）、`inbox/file`（文本预览路由）、`inbox/serve`（虚拟静态：文件夹作品的相对子资源按内部路径吐，否则多文件作品预览渲染不出画面；前端 iframe 须落到 `<name>/index.html`——文档住在无斜杠 `<name>` 上时 `./assets/...` 会把名字段顶掉）、register 扩展（.txt/.md 文字作品空行分段纯库内存储、可选 modelId 复用现有模型身份）；前端 inbox.tsx 重写（上传区+卡片+模型组合框+记住上次题目），网页预览复用竞技场 FixedHtmlWork（16:9，比例即上场比例）。
- 用户管理页（用户拍板：四个操作全要）：`/api/admin/users` 组（清单+授权撤权+重置密码一次性展示+强制下线+删除账号），app/admin/users.tsx 新页；点用户名开详情弹窗（模一把战绩+最近投票/评论，`/api/admin/users/:id/activity`）；删除账号保流水（票/评论作者变匿名）；服务端硬性禁止操作当前登录账号。**作品删除放宽（用户拍板）：零票可删**——DELETE /api/admin/works/:id 库行+磁盘文件/目录一起清（文件夹作品删整个 <id>/ 目录），有票 400 提示下架；列表每行带票数。**模一把开始记名（迁移 012，用户拍板推翻 064 匿名口径）**：登录用户上报记 user_id，游客仍匿名、历史不回溯；数据流水加「模一把」页签。后台表格/副标字号 13→14。顺手修：`.admin-password-dialog` 的 display:flex 会压掉 dialog 未打开时的 UA 隐藏（弹窗常显）——加 `:not([open]) { display:none }`。
- 顺手修复：本机 Windows `fs.rmSync` 对非 ASCII 路径静默失败/崩进程（纯中文名直接 exit 127 崩掉）——收件箱删除统一走 `removeEntry`（unlink/rmdir 递归），旧「删除中文名条目」路径同样中招已一并修。
- 测试：`validate:admin` 14 项全绿（收件箱改版/用户管理/模一把记名与用户动态三专项）；typecheck/lint 无新增错误；三页均浏览器实测截图目检（测试数据已清）。`vite.config.ts` 现支持 `VITE_PORT`/`PORT` 平移端口（本地另一项目占了 5173/3000，当前 dev 在 5273/3210）。
- 待办：用户验收 → commit。email-auth 分支上叠着未推送工作（邮箱体系 21ff18e + 人机验证 1632613 + 本轮两块）。

## 2026-09-24 邮箱账号体系（分支 email-auth；主体 21ff18e + 人机验证 1632613 均已 commit，未 push）

- 用户拍板：个人邮箱 SMTP 发信（163，授权码在 `.local/smtp-credentials.txt`，发件地址 kme7kme7@163.com）；注册必填邮箱+验证码。已实现：注册/绑定/换绑/忘记密码全流程、零依赖 SMTP 客户端（`server/mail.js`，不引 nodemailer 以免动 VPS node_modules 安装流程）、`server/auth-email.js` + `server/auth-util.js`（从 auth.js 抽公共工具）。
- 安全口径：6 位码 10 分钟有效一次性、错 5 次作废、60 秒冷却、按 IP/邮箱 DB 限流、reset 不泄露邮箱占用、重置密码后清全部会话、库里只存哈希。`MAIL_DEV_LOG=1` 打日志不真发（测试用，生产禁开）。
- 前端：账号弹窗新增注册验证码字段、忘记密码模式、会员视图邮箱行（打码显示）+绑定/换绑模式；新文案中英双语已入 `lib/messages.ts`。
- 人机验证层（已 commit 1632613，Cloudflare Turnstile，见决策末条）：只守发验证码接口，`server/turnstile.js` + 账号弹窗 widget；不配 `TURNSTILE_*` 密钥整功能关闭。密钥获取与 PM2 配置指引在 `.local/turnstile-keys.txt`。真机全链已实测（widget → Cloudflare 校验 → 163 真发信）。
- 测试：`npm run validate:email` 27 项全过（含第二阶段本地桩密封验证人机门禁）；7 个用到注册的既有脚本全部改为 MAIL_DEV_LOG 捕码注册，`validate:comments` 顺势从打本机 3000 改为自起临时库。已实测绿：email(27)/admin(11)/votes(12)/reactions(6)/formal(6)/comments(4)/admin-access(3)/formal-ui(6)/guess(38)/arena/matchmaking(11)/share(10)/check:mobile/typecheck/build/validate-locale。未跑：`validate:camera`（本机缺 007 fixture，既有原因）。
- 待办：VPS 部署时把 `TURNSTILE_*`（连同 SMTP_*）配进 PM2 并重启；合并 email-auth 到 main 与 push 均待用户发话。deploy:vps 流程不变（无新依赖）。

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
