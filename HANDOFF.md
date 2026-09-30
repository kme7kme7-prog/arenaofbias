# HANDOFF.md · 当前状态

更新于 2026-10-01。本文件只保留接手状态；每轮过程和当时的验证结论见 [docs/handoff/](docs/handoff/)。历史中的“未提交 / 待上线”不代表当前待办。

## 当前工程与发布状态

- `main` 是当前维护基线。纸 / 墨主题、可选邮箱、浏览器分享卡、共享题库长短原文和服务端聚合榜单均已进入主线；本轮归并了 `show1-vote-processing` 上遗漏的题库文档跟进，以及旧公测修复中适用于当前接口的前端与工具改动。
- 本仓维护主站前端；[ArenaGalleri](https://github.com/wsnxxxs/ArenaGalleri) 维护独立 Gallery 前端；[arenaofbias-server](https://github.com/kme7kme7-prog/arenaofbias-server) 独占动态 API 和业务数据库；私有 `arenaofbias-data` 维护正式题目、原作、注册表与数据包。
- 当前正式题目由共享数据包登记稳定 `arenaId`，共享后端兼容历史题；长短原文属于同一题号。真实榜单读取 `/api/show1/leaderboard`，不下载逐票流水。当前管理入口是 `https://api.arenaofbias.icu/admin/`；本仓 `server/`、`/admin.html` 和 PM2 整站发布脚本属于迁移前实现。
- 最近一次发布归档记录：主站静态源码 `9805416`，共享后端源码 `f4685c9`，生产数据包 `4c926d5`，Gallery 静态源码 `ccfd11d`。主站 25 题（20 共用 + 5 历史）、Gallery 20 题 / 83 件；014 SupernovAI、016 云山巨城支持长短原文，但两题尚无真实结果。本轮只整理仓库，未重新核验公网或部署。
- 两站旧票和旧对局已在 vote-release 中备份后清零；账号、作品、评论等保留。不要把历史快照票重新汇入榜单，也不要用旧数据库备份覆盖后续业务数据。

## 当前发布准备（2026-10-01，未提交、未部署）

- 用户确认「四个仓库一起发布，包含最新作品」，授权主站、Gallery、共享后端与数据仓的提交、推送和统一发布；本仓法律、头像、账号文案与评论隐藏改动尚未提交、未推送、未部署。实际部署结果后续记录。
- 本仓 main 与 origin/main 均为 5d74cd7。本轮未提交功能属于法律/隐私/备案/AI 标识、16 个头像、账号绑定与 30 天会话文案、临时评论隐藏及配套首页文案；提示词变体已在主线，不是新增待实现功能。
- 本轮实际门禁：npm run typecheck、npm run lint、npm run build 均通过。此前隔离后端法律页、纸/墨主题、手机宽度、注册同意、作品 AI 标识与头像保存浏览器验收沿用下文结果；本轮未重跑全部交互或真机验收。
- 数据仓新增 38 件已合并并发布，main 638937a，产物 39a2fa4，发布 CI 36731686651 成功；产物 schema 1、sourceDirty false、20 题/121 件。消费者仍须固定新产物、重建并核验新增作品与对局 fold；数据发布成功不等于消费站已上线。
- 头像依赖共享后端会话 avatar 与 PATCH /api/me；主站题库与作品经共享后端读取新版数据。主站只按当前静态发布流程切换，不运行退役的 PM2 整站部署脚本。
- 本轮归档：[legal-avatar-release](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)。
## 已实现待本轮发布（起于 2026-09-30）

- 评论区暂时隐藏：`app/page.tsx` 中 `COMMENTS_ENABLED = false`，娱乐测评菜单文案同步去掉评论区（`app/play-menu.tsx`、`lib/messages.ts`）。typecheck、lint 通过；未跑浏览器验收与 check:* 动效脚本。见 DECISIONS 2026-09-30 条目。
- 账号绑定文案：账号弹窗把「绑定邮箱」改为「账号绑定」（邮箱是其中一种方式），成功提示、注册与找回密码说明同步调整并补英文（`components/account.tsx`、`lib/messages.ts`）。typecheck、lint 通过，未跑浏览器验收。旧管理页 `app/admin/users.tsx` 的「未绑定邮箱」未改。
- 条款与隐私：新增 `#terms`、`#privacy`（可用 `#terms/cite` 这类地址直达某一节），页面在 `app/legal.tsx`，正文在 `lib/legal.ts`。正文与 ArenaGalleri `site/legal.js` 一致，只有站名（偏见试验场）、本站简介、适用范围、站内链接、「本地偏好」（本站有语言与本地战绩）和「你的权利」的入口说明按站点替换，改动时两边一起改；已逐节比对，19 节只有这些预期差异。暂无英文正文，英文界面显示仅中文的说明。
- 页脚：首页、玩法菜单、题库、榜单的页脚后加了法律信息行（`components/legal-footer.tsx`）：版权、AI 生成说明、条款、隐私、联系邮箱，以及只在 arenaofbias.icu 上显示的 ICP 备案号（`lib/legal.ts` 的 `BEIAN`，迁到 arena.arenagalleri.com 前补新号）。
- AI 生成标识：对局两侧栏头与放大预览标题。注册弹窗加了同意说明。
- 头像：`public/avatars/` 共 16 个 SVG，与 Gallery 相同，id 在 `lib/avatars.ts`。账号按钮显示头像，账号面板可以点选更换（`PATCH /api/me`）。依赖共享后端的头像改动（`/api/auth/me` 返回 avatar），需一起发布。
- 验证：typecheck、lint 通过。本地 vite + 共享后端用无头 Chrome 核对了条款 / 隐私页（纸、墨两种主题、手机宽度无横向滚动）、页脚、注册同意说明、对局栏头标识、头像点选更换，无 console error；未跑 check:* 动效脚本。
- 文案校正：账号弹窗改为「登录状态保留 30 天」，与共享后端会话有效期和隐私政策一致。评论区隐藏期间，首页主视觉与页脚的「03 聊两句」改为「03 看揭晓」，页脚标语改为「先凭直觉选，再揭晓是哪个模型。」（英文同步）。恢复评论时可以一并改回。typecheck、lint 通过。`docs/PRODUCT.md` 本轮已同步共享后端的 30 天会话、2–24 位账号与 8–128 位密码规则。

## 分支整理

| 分支 | 处理与理由 |
| --- | --- |
| `email-auth` | 已由 PR #2 合入主线，删除远端遗留分支。 |
| `show1-vote-processing` | 功能已在主线；本轮把独有的共享题库文档合入并收尾，删除远端和本 checkout 的旧工作分支。 |
| `codex/shared-question-docs` | 已占用独立 worktree；内容随上项归并，保留本地 checkout 与运维证据。 |
| `codex/public-beta-repair` | 已归并 4 个独有提交：保留首页 / 竞技场精简、每日进度和分享等适用修复；旧单体后端及不兼容投稿 / 匿名票 / 作品评价接口留在合并父提交历史。清理 `origin` / `fork` 远端分支，不影响共享后端工作分支。 |

主站整理时上游没有开放 PR。数据仓 PR #5 的 38 件作品现已合并、推送并发布产物，待随本轮四仓一起升级消费者；当前生产消费仍是此前固定包。

## 接手注意与剩余事项

- 新题实际作品继续走数据仓完整收录流程；数据侧因文档提交发布新包，不要求消费方自动更新 pin。两个前端和共享后端按各自验证与发布流程更新。
- 旧修复分支已包含脚本 lint 修复，本轮完整 lint 通过；锁文件可选依赖缺失导致的历史 `npm ci` 问题仍未修依赖。`validate:guess` 的相邻两日必不同断言与现有答案池冲突；`check-vote-split` 仍检查已经移除的 `work-reveal` CSS 动画。两份检查的失败点未由本轮改动引入，保留为维护事项。
- 新合入每日挑战在同一浏览器保存进度，完成后当天只读；练习仍可重新开局。评价队列继续使用共享后端的 `mid` 契约，并修复账号 / 题目隔离及并发取消。主站仍需登录计票，投稿入口使用 Gallery 的当前共享流程；不启用旧单体专用接口。
- 历史调试脚本及 `output/playwright/work-ready-after.json` 曾被提交；本轮未清理这些文件或本地生成物。相机专项依赖本机作品 fixture，历史分享超时、低端真机 / 高 DPR / 真 Turnstile 与全部原作交互不在本轮验证范围。
- 模一把防剧透、难度与模型字段查证、特别赛及多人玩法仍是独立产品或内容工作；遵循 [docs/DECISIONS.md](docs/DECISIONS.md)，不把 [docs/IDEAS.md](docs/IDEAS.md) 当任务清单。
- 主站静态目录 `/www/wwwroot/show1-dist`，旧站保留为 `show1-dist.prev`；投票发布备份与证据在 `/root/arenaofbias-vote-release-20260930-c0ab6ac/`。当前发布与数据库回滚细则以共享后端 `docs/deploy.md` 和下列发布归档为准。
- 初始工作区干净。本轮主站有文档整理和适用旧修复合并，配套三仓只改文档；忽略的作品、凭据、生成物、独立 worktree 和历史浏览器证据均保留。用户新建的 server 工作分支及其功能修改独立维护，本轮没有切换该仓分支或合并功能代码。

## 阅读入口与历史索引

- [README.md](README.md)：仓库分工、开发入口与长期定位。
- [docs/PRODUCT.md](docs/PRODUCT.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：当前行为、共享后端联调、历史实现边界及静态发布。
- [本轮法律、头像与四仓发布准备](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)：当前授权、门禁与待部署状态。
- [本轮仓库整理](docs/handoff/2026-09-30-repository-cleanup-wsnxxxs.md)：文档归并、分支证据和验证边界。
- [旧修复归并](docs/handoff/2026-09-30-beta-repair-merge-wsnxxxs.md)：前端修复取舍、当前 API 兼容、共享后端工作隔离和本轮验证。
- [共享题库最终上线](docs/handoff/2026-09-30-shared-question-release-wsnxxxs.md)、[投票发布与清零](docs/handoff/2026-09-30-vote-release-wsnxxxs.md)：最新生产记录、备份及回滚证据。
- [共享题库实现及文档跟进](docs/handoff/2026-09-30-shared-question-intake-wsnxxxs.md)、[投票聚合实现](docs/handoff/2026-09-30-show1-vote-processing-wsnxxxs.md)、[分支同步](docs/handoff/2026-09-30-vote-branch-sync-wsnxxxs.md)：已完成过程。
- [双主题上线](docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md)、[主题交付](docs/THEME-DELIVERY.md)：纸 / 墨方案、构建与验收边界。
- [可选邮箱](docs/handoff/2026-09-29-email-auth-v2-wsnxxxs.md)、[浏览器分享](docs/handoff/2026-09-29-share-v2-wsnxxxs.md)、[模态判色](docs/handoff/2026-09-29-模态判色修复-Atmeplz.md)：已合入的近期功能。
- [内测收口历史](docs/handoff/2026-09-25-内测开闸前收口-kme7kme7-prog.md)、[更早交接](docs/handoff/2026-09-24-历史交接快照-Atmeplz.md)：迁移前邮箱、后台、模型治理与快门记录。
