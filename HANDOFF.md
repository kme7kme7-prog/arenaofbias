# HANDOFF.md · 当前状态

更新于 2026-09-30。本文件只保留接手状态；每轮过程和当时的验证结论见 [docs/handoff/](docs/handoff/)。历史中的“未提交 / 待上线”不代表当前待办。

## 当前工程与发布状态

- `main` 是当前维护基线。纸 / 墨主题、可选邮箱、浏览器分享卡、共享题库长短原文和服务端聚合榜单均已进入主线；本轮归并了 `show1-vote-processing` 上遗漏的题库文档跟进。
- 本仓维护主站前端；[ArenaGalleri](https://github.com/wsnxxxs/ArenaGalleri) 维护独立 Gallery 前端；[arenaofbias-server](https://github.com/kme7kme7-prog/arenaofbias-server) 独占动态 API 和业务数据库；私有 `arenaofbias-data` 维护正式题目、原作、注册表与数据包。
- 当前正式题目由共享数据包登记稳定 `arenaId`，共享后端兼容历史题；长短原文属于同一题号。真实榜单读取 `/api/show1/leaderboard`，不下载逐票流水。当前管理入口是 `https://api.arenaofbias.icu/admin/`；本仓 `server/`、`/admin.html` 和 PM2 整站发布脚本属于迁移前实现。
- 最近一次发布归档记录：主站静态源码 `9805416`，共享后端源码 `f4685c9`，生产数据包 `4c926d5`，Gallery 静态源码 `ccfd11d`。主站 25 题（20 共用 + 5 历史）、Gallery 20 题 / 83 件；014 SupernovAI、016 云山巨城支持长短原文，但两题尚无真实结果。本轮只整理仓库，未重新核验公网或部署。
- 两站旧票和旧对局已在 vote-release 中备份后清零；账号、作品、评论等保留。不要把历史快照票重新汇入榜单，也不要用旧数据库备份覆盖后续业务数据。

## 分支整理

| 分支 | 处理与理由 |
| --- | --- |
| `email-auth` | 已由 PR #2 合入主线，删除远端遗留分支。 |
| `show1-vote-processing` | 功能已在主线；本轮把独有的共享题库文档合入并收尾，删除远端和本 checkout 的旧工作分支。 |
| `codex/shared-question-docs` | 已占用独立 worktree；内容随上项归并，保留本地 checkout 与运维证据。 |
| `codex/public-beta-repair` | 保留 `origin` / `fork` 分支。仍有 4 个独有提交，含 UI 精简、投稿和旧服务修复；与当前共享后端、主题、邮箱与分享线路存在差异，不能当作已合并分支删除或直接合回。 |

当前上游没有开放 PR。数据仓的 [PR #5](https://github.com/kme7kme7-prog/arenaofbias-data/pull/5) 另有 38 件未收录成果，仍为草稿；不是本仓待合并代码，也不改变当前生产数据包。

## 接手注意与剩余事项

- 新题实际作品继续走数据仓完整收录流程；数据侧因文档提交发布新包，不要求消费方自动更新 pin。两个前端和共享后端按各自验证与发布流程更新。
- 本仓既有全量 lint 9 条脚本错误、锁文件可选依赖缺失导致的 `npm ci` 问题，见主题发布和共享题库实现归档。本轮没有修依赖或脚本；不要把文档整理称为这些问题已解决。
- 历史调试脚本及 `output/playwright/work-ready-after.json` 曾被提交；本轮未清理这些文件或本地生成物。相机专项依赖本机作品 fixture，历史分享超时、低端真机 / 高 DPR / 真 Turnstile 与全部原作交互不在本轮验证范围。
- 模一把防剧透、难度与模型字段查证、特别赛及多人玩法仍是独立产品或内容工作；遵循 [docs/DECISIONS.md](docs/DECISIONS.md)，不把 [docs/IDEAS.md](docs/IDEAS.md) 当任务清单。
- 主站静态目录 `/www/wwwroot/show1-dist`，旧站保留为 `show1-dist.prev`；投票发布备份与证据在 `/root/arenaofbias-vote-release-20260930-c0ab6ac/`。当前发布与数据库回滚细则以共享后端 `docs/deploy.md` 和下列发布归档为准。
- 初始工作区干净。本轮仅提交文档；忽略的作品、凭据、生成物、独立 worktree 和历史浏览器证据均保留。

## 阅读入口与历史索引

- [README.md](README.md)：仓库分工、开发入口与长期定位。
- [docs/PRODUCT.md](docs/PRODUCT.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：当前行为、共享后端联调、历史实现边界及静态发布。
- [本轮仓库整理](docs/handoff/2026-09-30-repository-cleanup-wsnxxxs.md)：文档归并、分支证据和验证边界。
- [共享题库最终上线](docs/handoff/2026-09-30-shared-question-release-wsnxxxs.md)、[投票发布与清零](docs/handoff/2026-09-30-vote-release-wsnxxxs.md)：最新生产记录、备份及回滚证据。
- [共享题库实现及文档跟进](docs/handoff/2026-09-30-shared-question-intake-wsnxxxs.md)、[投票聚合实现](docs/handoff/2026-09-30-show1-vote-processing-wsnxxxs.md)、[分支同步](docs/handoff/2026-09-30-vote-branch-sync-wsnxxxs.md)：已完成过程。
- [双主题上线](docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md)、[主题交付](docs/THEME-DELIVERY.md)：纸 / 墨方案、构建与验收边界。
- [可选邮箱](docs/handoff/2026-09-29-email-auth-v2-wsnxxxs.md)、[浏览器分享](docs/handoff/2026-09-29-share-v2-wsnxxxs.md)、[模态判色](docs/handoff/2026-09-29-模态判色修复-Atmeplz.md)：已合入的近期功能。
- [内测收口历史](docs/handoff/2026-09-25-内测开闸前收口-kme7kme7-prog.md)、[更早交接](docs/handoff/2026-09-24-历史交接快照-Atmeplz.md)：迁移前邮箱、后台、模型治理与快门记录。
