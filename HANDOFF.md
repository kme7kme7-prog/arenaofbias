# HANDOFF.md · 当前状态

本文件是状态仪表盘：只放当前状态与阅读指引，每轮收工时更新。耐久事实（产品规则、架构、决策）归 `docs/` 各文档，本文不复述；冲突时以交接日志与 git 为准。

## 接手阅读顺序

1. `AGENTS.md`（协作约束，会被自动注入）
2. 本文
3. `docs/handoff/` 里日期最新的一份交接日志
4. 按需查阅：产品行为 `docs/PRODUCT.md` ｜ 架构与运行 `docs/ARCHITECTURE.md` ｜ 决策 `docs/DECISIONS.md` ｜ 想法库 `docs/IDEAS.md`
5. 首次接手先读 `README.md`（长期定位与原则）

## 当前状态（2026-09-10）

- 当前提交：见 git。Vite + React 前端、Express + SQLite 后端；提示词库 + 竞技场 + 账号评论体系 + 投票落库与偏好榜；题库 7 题，其中仅 002/003 可配对（占位内容，虚构模型身份，见 `docs/PRODUCT.md` 内容真实性分级）。
- 2026-09-08 完成文档体系改造与全站改名 arenaofbias（字标 ARENA OF ＋ 酸底切角 BIAS 块）。
- 2026-09-09 Atmeplz 轮：换组防泄漏（决策 014）；作品 iframe 沙箱放行 `allow-same-origin` 修复 3D 黑屏（决策 015）；依赖瘦身 node_modules 365MB→230MB（决策 016）。
- 2026-09-09 本轮：左上角返回入口动效——竞技场 brand 由纯 div 变 `#home` 链接；字标本体保持朴素，动效只做在 mark 图标上（主界面按钮语言：硬投影、悬停微抬、按压回平），定稿形态见 [左上角返回入口归档](docs/handoff/2026-09-09-左上角返回入口按钮化-kme7kme7-prog.md)。
- 2026-09-09 本轮：开发者占位符系统——右下角隐藏 "dev" 面板开启占位符模式后，题库与竞技场全量替换为生成的占位作品（与真实数据严格隔离、设置与占位投票仅存 localStorage），并可随机生成占位投票为榜单 UI 备料，见 [占位符模式与开发者面板归档](docs/handoff/2026-09-09-占位符模式与开发者面板-kme7kme7-prog.md)。
- 2026-09-09 本轮修复（代码审查发现）：占位投票与模型数量可能失配——切换占位模型数量时自动清空占位投票，`readPlaceholderVotes` 按当前阵容过滤兜底（防手工改 localStorage 的残留脏票）；`validate:placeholder` 扩至 9 项。
- 2026-09-09 本轮：偏好榜 `#rank`——原型 `prototypes/ranking.html` 定稿后移植为主站页面（综合/写作/网页三赛道、占位口径简易 Elo、暂定徽章、模型主题色档案卡、色块横推过场、雷达外侧静止内侧挪动）；入口在首页与竞技场揭晓区；档案卡主题色规范见决策 017，见 [偏好榜归档](docs/handoff/2026-09-09-偏好榜原型与榜单页-kme7kme7-prog.md)。
- 2026-09-10 本轮：投票落库——竞技场选择实时写入服务端 votes 表（对局级去重、登录门槛、决策 018/019），偏好榜改为拉全量流水客户端重放 Elo；开发者面板新增"开发者身份"免登录（`/api/auth/dev`）；占位模式投票写本地形成闭环；顺带修复 vite 代理 `changeOrigin` 导致 dev 下评论/登录全部 403 的既有 bug，见 [投票落库归档](docs/handoff/2026-09-10-投票落库与开发者免登录-kme7kme7-prog.md)。

## 最新交接

- 投票落库已完成并验证：typecheck / lint（0 错误）/ validate:arena（11 项）/ validate:placeholder（9 项）/ validate:leaderboard（7 项）/ validate:votes（新脚本，9 项）/ validate:comments / build 全部通过。浏览器端到端（IAB，真实模式）：dev 面板免登录 → 002 竞技场投 A →"你的选择已计入偏好榜"→ 换边重投同对 →"这一对作品你已经投过票了"→ `#rank` 出现墨池 1216 / 回声 1184（Elo 零和）各 1 场"暂定"；占位模式：竞技场投一票写本地 →"已写入本地演示数据"→ 占位榜单出现该票。
- 验证痕迹：本地 data 库留有 1 条 dev 用户的真实票（inkwell > echo）与 dev 账号——打开 `#rank` 即可看到真实链路效果，不需要可清除（votes 表清空即可回到空榜）。
- 本轮发现并修复既有 bug：vite 代理默认改写 Host，导致 dev（5173）下评论/登录/投票 POST 全部 403 同源拦截——`vite.config.ts` 显式 `changeOrigin: false`（生产不经 vite 不受影响）。
- 本轮改动**未提交**（等用户确认）。
- 更早一轮见 [偏好榜归档](docs/handoff/2026-09-09-偏好榜原型与榜单页-kme7kme7-prog.md)。

## 待办（下一步候选，非约束）

- 004–007 接入模型结果（操作步骤见 `docs/ARCHITECTURE.md` 扩充一节；上轮已验证 `public/works/` + `kind:'html'` 路径可行，注意 dist 需相对路径或构建时 `--base=./`；真实测试集在用户桌面 `AI测试流程设计/模型输出结果`）。
- 娱乐模式免登录投票与特别赛分流（用户长期方向，mode 已落库未启用，见决策 018/019）。
- 已知不一致：竞技场页"本场收录 N 个模型"未过滤 isDemo，与提示词库页口径不同（用户当前不可见，见 `docs/ARCHITECTURE.md` 技术备注）。
- 待用户拍板：002/003 虚构模型身份的长期取向。
- `docs/IDEAS.md` 全部条目均为候选，未经确认不得开发。

## 历史验证备注（2026-09-08 改名阶段）

- 当时通过：`npm run typecheck`、`npm run lint`（0 错误）、`npm run validate:arena`（11 项）、`npm run validate:scroll`；字标形态已经浏览器目视确认。各轮完整验证见 `docs/handoff/` 对应归档。

## 偏好榜原型迭代记录（已定稿并迁移）

- `prototypes/ranking.html` 为单文件视觉原型（另一个 AI 产出初版，本账号与其协作迭代六轮以上）：错峰入场、排名换位、左榜右档布局、六维雷达、深色信息头+浅色图表、切角硬投影强化、原型状态选择器（有排名/无投票/分类不足三种空态）、头部主题色光晕与斜纹的多轮接缝调整。
- 定稿后已迁移为主站 `#rank`（见上方"最新交接"），原型文件保留作视觉定稿记录。逐轮细节见 [偏好榜归档](docs/handoff/2026-09-09-偏好榜原型与榜单页-kme7kme7-prog.md)。
