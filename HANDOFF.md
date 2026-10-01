# HANDOFF.md · 当前状态

更新于 2026-10-01。本文件只保留接手状态；每轮过程和当时的验证结论见 [docs/handoff/](docs/handoff/)。历史中的“未提交 / 待上线”不代表当前待办。

## 联系邮箱修改（2026-10-01，仅提交与推送）

- 用户授权提交现有修改并推送；`lib/legal.ts` 的 CONTACT 改为 `arenagallari@outlook.com`。
- typecheck、lint 通过；本轮未构建、未做浏览器验证（仅邮箱字符串修改），未部署、未修改 Gallery 仓库。
- 归档：[contact-email](docs/handoff/2026-10-01-contact-email-wsnxxxs.md)。

## 四仓整理（2026-10-01，仅推送，不部署）

- 用户授权整理四仓、合并完成分支、提交和推送，并清理无用的独立工作树。本轮不部署、不修改生产数据或已发布静态目录；此前轮次的部署授权不适用于本轮。
- 主站保留 `f1a7d0e` 的注册邮箱和旧账号计票适配，`codex/shared-question-docs` 已全部进入主线，无需重复合并。维护基线为 `main`，同步 `origin/main` 与 `fork/main`；旧文档工作树在确认推送后清理。
- 本轮复跑 typecheck、lint、build、`validate-email-gating.mjs`、`validate-reaction-queue.mjs` 均通过。没有改动功能代码，没有重复浏览器或真实邮件验证；两站与共享后端的邮箱新流程仍需后续配套部署才在现网生效。
- 当前整理记录见 [repository-housekeeping](docs/handoff/2026-10-01-repository-housekeeping-wsnxxxs.md)。下面各轮“未推送”描述的是当时状态，以本节及本轮归档为准。

## 本轮：注册验证邮箱与旧账号计票资格（2026-10-01，已本地提交，未推送、未部署）

- 注册表单必填邮箱与验证码；匿名发码 purpose=register，沿用已有 Turnstile 发码门禁，注册提交只带账号、密码、邮箱与验证码。旧账号通过 `/api/auth/me` 的 email 判断绑定状态，仍可登录与游玩。
- Show1 有效未绑定投票的 200 `{counted:false,reason:'unbound'}` 显示未计入与绑定入口，不显示成功或刷新配对评分。未绑定点击表态不改本地计数/队列；403 email_required 打开绑定界面、恢复服务端计数并丢弃已拒绝的待同步项。评论区继续隐藏。
- 隐私正文和 PRODUCT 同步；DECISIONS 追加用户本轮对旧自愿绑定决定的变更。依赖共享后端注册与资格门禁改动，不能独立视为现网已生效。
- 验证：typecheck、lint、build 通过；`node scripts/validate-email-gating.mjs` 和既有 `validate-reaction-queue.mjs` 通过。真实 Chromium + 本地 API 桩的 390px 注册发码/提交通过，未携带注册 Turnstile token，无 pageerror/横向溢出；截图目检通过，位于忽略目录 output/playwright。未做真实 SMTP/Cloudflare、生产写操作或两站部署；共享后端真实联调由后端本轮记录说明。
- 归档：[email-registration-gating](docs/handoff/2026-10-01-email-registration-gating-wsnxxxs.md)。

## 当前工程与发布状态

- `main` 是当前维护基线。纸 / 墨主题、可选邮箱、浏览器分享卡、共享题库长短原文和服务端聚合榜单均已进入主线；本轮归并了 `show1-vote-processing` 上遗漏的题库文档跟进，以及旧公测修复中适用于当前接口的前端与工具改动。
- 本仓维护主站前端；[ArenaGalleri](https://github.com/wsnxxxs/ArenaGalleri) 维护独立 Gallery 前端；[arenaofbias-server](https://github.com/kme7kme7-prog/arenaofbias-server) 独占动态 API 和业务数据库；私有 `arenaofbias-data` 维护正式题目、原作、注册表与数据包。
- 当前正式题目由共享数据包登记稳定 `arenaId`，共享后端兼容历史题；长短原文属于同一题号。真实榜单读取 `/api/show1/leaderboard`，不下载逐票流水。当前管理入口是 `https://api.arenaofbias.icu/admin/`；本仓 `server/`、`/admin.html` 和 PM2 整站发布脚本属于迁移前实现。
- 上一次发布归档记录（2026-09-30，当前由下文新发布覆盖）：主站静态源码 `9805416`，共享后端源码 `f4685c9`，生产数据包 `4c926d5`，Gallery 静态源码 `ccfd11d`。主站 25 题（20 共用 + 5 历史）、Gallery 20 题 / 83 件；014 SupernovAI、016 云山巨城支持长短原文，但两题尚无真实结果。该轮整理时未部署，此后四仓发布见下文。
- 两站旧票和旧对局已在 vote-release 中备份后清零；账号、作品、评论等保留。不要把历史快照票重新汇入榜单，也不要用旧数据库备份覆盖后续业务数据。

## 当前已发布（2026-10-01 Brisbane）

- 现场切换时间：2026-09-30T17:19:05Z（Brisbane 2026-10-01 03:19:05）。

- 用户授权的四仓统一发布（含新增 38 件作品）已完成并已推送。Show1 实际上线源码为 79266513b295fb6ce8892f0afd08fbd32f61ab09；origin/main 与 fork/main 已快进同步。后续交接文档提交不代表再次部署。
- 共享后端实际上线源码为 566782e54a403c79a5ca4257a34a4beb6caa8d54、数据库 v22，正式包 20 题/121 件；Show1 公开 25 题（20 共用 + 5 历史）。数据仓源码 638937a、产物 39a2fa4、发布 CI 36731686651 成功；消费者已升级最新作品包。
- Gallery 首页精简经用户追加授权推送部署，于 2026-09-30T17:40:14Z（Brisbane 03:40:14）更新为 4717910e115413941586f170e808a32a05c1d258；固定数据包、Show1 与共享后端运行版本不变。
- 本仓法律/隐私/备案/AI 标识、16 个头像、账号绑定与 30 天会话文案、临时评论隐藏及首页配套文案已发布。提示词变体是既有主线能力。头像所依赖共享后端会话 avatar 与 PATCH /api/me 同步上线。
- 已提交源码的干净 export 上 typecheck、lint、build 通过。npm ci 因锁文件缺 @emnapi/core@1.11.3、@emnapi/runtime@1.11.3 失败；本轮通过连接已验证原 checkout 的 node_modules 构建，没有修改依赖或锁文件，此为发布门禁例外。
- 静态 802 文件逐项 SHA-256 与精确文件集合核对通过；替换 26 文件、移除 8 个旧 hash 资产，旧目录 show1-dist.prev 保留。Nginx 原配置未改，配置检查通过。
- 公网首页、使用条款与节目录、#privacy 直达均已验证；条款与隐私在 375px 下 clientWidth=scrollWidth=375，截图目检正常、无横向溢出，console error 0。Gallery 的 viewport override 未生效，实际仍为 1270/1280px，本轮未完成 Gallery 窄屏验收；此前隔离移动验证保留为历史。
- 四道生产测试题在部署、备份及各题零作品零票核对后，于 2026-09-30T17:19:52.309Z 由管理员 kme7 通过 API 软删除。其余用户 27、作品 267、votes 0、matches 1、comments 16、reactions 56 保留；完整备份与版本以共享后端交接为准。
- 未执行生产注册、邮箱或换头像写操作；此前隔离验收仍有效。未全量验证新增 38 件真实 fold、真实 Luna/capture 或真机。Gallery 旧 PR #1 仍待确认是否关闭，本轮不合并。
- 本轮归档：[legal-avatar-release](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)，准备阶段正文保留，文末已追加实际发布记录。
## 本轮已发布功能与历史验收（起于 2026-09-30）

- 评论区暂时隐藏：`app/page.tsx` 中 `COMMENTS_ENABLED = false`，娱乐测评菜单文案同步去掉评论区（`app/play-menu.tsx`、`lib/messages.ts`）。typecheck、lint 通过；未跑浏览器验收与 check:* 动效脚本。见 DECISIONS 2026-09-30 条目。
- 账号绑定文案：账号弹窗把「绑定邮箱」改为「账号绑定」（邮箱是其中一种方式），成功提示、注册与找回密码说明同步调整并补英文（`components/account.tsx`、`lib/messages.ts`）。typecheck、lint 通过，未跑浏览器验收。旧管理页 `app/admin/users.tsx` 的「未绑定邮箱」未改。
- 条款与隐私：新增 `#terms`、`#privacy`（可用 `#terms/cite` 这类地址直达某一节），页面在 `app/legal.tsx`，正文在 `lib/legal.ts`。正文与 ArenaGalleri `site/legal.js` 一致，只有站名（偏见试验场）、本站简介、适用范围、站内链接、「本地偏好」（本站有语言与本地战绩）和「你的权利」的入口说明按站点替换，改动时两边一起改；已逐节比对，19 节只有这些预期差异。暂无英文正文，英文界面显示仅中文的说明。
- 页脚：首页、玩法菜单、题库、榜单的页脚后加了法律信息行（`components/legal-footer.tsx`）：版权、AI 生成说明、条款、隐私、联系邮箱，以及只在 arenaofbias.icu 上显示的 ICP 备案号（`lib/legal.ts` 的 `BEIAN`，迁到 arena.arenagalleri.com 前补新号）。
- AI 生成标识：对局两侧栏头与放大预览标题。注册弹窗加了同意说明。
- 头像：`public/avatars/` 共 16 个 SVG，与 Gallery 相同，id 在 `lib/avatars.ts`。账号按钮显示头像，账号面板可以点选更换（`PATCH /api/me`）。依赖共享后端的头像改动（`/api/auth/me` 返回 avatar），本轮已一起发布。
- 验证：typecheck、lint 通过。本地 vite + 共享后端用无头 Chrome 核对了条款 / 隐私页（纸、墨两种主题、手机宽度无横向滚动）、页脚、注册同意说明、对局栏头标识、头像点选更换，无 console error；未跑 check:* 动效脚本。
- 文案校正：账号弹窗改为「登录状态保留 30 天」，与共享后端会话有效期和隐私政策一致。评论区隐藏期间，首页主视觉与页脚的「03 聊两句」改为「03 看揭晓」，页脚标语改为「先凭直觉选，再揭晓是哪个模型。」（英文同步）。恢复评论时可以一并改回。typecheck、lint 通过。`docs/PRODUCT.md` 本轮已同步共享后端的 30 天会话、2–24 位账号与 8–128 位密码规则。

## 分支整理

| 分支 | 处理与理由 |
| --- | --- |
| `email-auth` | 已由 PR #2 合入主线，删除远端遗留分支。 |
| `show1-vote-processing` | 功能已在主线；本轮把独有的共享题库文档合入并收尾，删除远端和本 checkout 的旧工作分支。 |
| `codex/shared-question-docs` | 已占用独立 worktree；内容随上项归并，保留本地 checkout 与运维证据。 |
| `codex/public-beta-repair` | 已归并 4 个独有提交：保留首页 / 竞技场精简、每日进度和分享等适用修复；旧单体后端及不兼容投稿 / 匿名票 / 作品评价接口留在合并父提交历史。清理 `origin` / `fork` 远端分支，不影响共享后端工作分支。 |

主站整理时上游没有开放 PR。数据仓 PR #5 的 38 件作品现已合并、推送并发布产物，本轮四仓消费者升级已完成，正式共用题库为 20 题/121 件。

## 接手注意与剩余事项

- 新题实际作品继续走数据仓完整收录流程；数据侧因文档提交发布新包，不要求消费方自动更新 pin。两个前端和共享后端按各自验证与发布流程更新。
- 旧修复分支已包含脚本 lint 修复，本轮完整 lint 通过；锁文件可选依赖缺失导致的历史 `npm ci` 问题仍未修依赖。`validate:guess` 的相邻两日必不同断言与现有答案池冲突；`check-vote-split` 仍检查已经移除的 `work-reveal` CSS 动画。两份检查的失败点未由本轮改动引入，保留为维护事项。
- 新合入每日挑战在同一浏览器保存进度，完成后当天只读；练习仍可重新开局。评价队列继续使用共享后端的 `mid` 契约，并修复账号 / 题目隔离及并发取消。主站仍需登录计票，投稿入口使用 Gallery 的当前共享流程；不启用旧单体专用接口。
- 历史调试脚本及 `output/playwright/work-ready-after.json` 曾被提交；本轮未清理这些文件或本地生成物。相机专项依赖本机作品 fixture，历史分享超时、低端真机 / 高 DPR / 真 Turnstile 与全部原作交互不在本轮验证范围。
- 模一把防剧透、难度与模型字段查证、特别赛及多人玩法仍是独立产品或内容工作；遵循 [docs/DECISIONS.md](docs/DECISIONS.md)，不把 [docs/IDEAS.md](docs/IDEAS.md) 当任务清单。
- 主站静态目录 `/www/wwwroot/show1-dist`，旧站保留为 `show1-dist.prev`；投票发布备份与证据在 `/root/arenaofbias-vote-release-20260930-c0ab6ac/`。当前发布与数据库回滚细则以共享后端 `docs/deploy.md` 和下列发布归档为准。
- 先前整理轮次初始工作区干净、配套三仓只改文档；随后四仓功能及最新作品按用户授权统一提交、推送和发布。忽略的作品、凭据、生成物、独立 worktree 和历史浏览器证据均保留，不无差别清理。

## 阅读入口与历史索引

- [README.md](README.md)：仓库分工、开发入口与长期定位。
- [docs/PRODUCT.md](docs/PRODUCT.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：当前行为、共享后端联调、历史实现边界及静态发布。
- [本轮法律、头像与四仓发布](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)：授权、门禁与文末实际部署结果。
- [本轮仓库整理](docs/handoff/2026-09-30-repository-cleanup-wsnxxxs.md)：文档归并、分支证据和验证边界。
- [旧修复归并](docs/handoff/2026-09-30-beta-repair-merge-wsnxxxs.md)：前端修复取舍、当前 API 兼容、共享后端工作隔离和本轮验证。
- [共享题库最终上线](docs/handoff/2026-09-30-shared-question-release-wsnxxxs.md)、[投票发布与清零](docs/handoff/2026-09-30-vote-release-wsnxxxs.md)：历史生产记录、备份及回滚证据。
- [共享题库实现及文档跟进](docs/handoff/2026-09-30-shared-question-intake-wsnxxxs.md)、[投票聚合实现](docs/handoff/2026-09-30-show1-vote-processing-wsnxxxs.md)、[分支同步](docs/handoff/2026-09-30-vote-branch-sync-wsnxxxs.md)：已完成过程。
- [双主题上线](docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md)、[主题交付](docs/THEME-DELIVERY.md)：纸 / 墨方案、构建与验收边界。
- [可选邮箱](docs/handoff/2026-09-29-email-auth-v2-wsnxxxs.md)、[浏览器分享](docs/handoff/2026-09-29-share-v2-wsnxxxs.md)、[模态判色](docs/handoff/2026-09-29-模态判色修复-Atmeplz.md)：已合入的近期功能。
- [内测收口历史](docs/handoff/2026-09-25-内测开闸前收口-kme7kme7-prog.md)、[更早交接](docs/handoff/2026-09-24-历史交接快照-Atmeplz.md)：迁移前邮箱、后台、模型治理与快门记录。
