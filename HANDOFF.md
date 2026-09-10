# HANDOFF.md · 当前状态

本文件是状态仪表盘：只放当前状态与阅读指引，每轮收工时更新。耐久事实（产品规则、架构、决策）归 `docs/` 各文档，本文不复述；冲突时以交接日志与 git 为准。

## 接手阅读顺序

1. `AGENTS.md`（协作约束，会被自动注入）
2. 本文
3. `docs/handoff/` 里日期最新的一份交接日志
4. 按需查阅：产品行为 `docs/PRODUCT.md` ｜ 架构与运行 `docs/ARCHITECTURE.md` ｜ 决策 `docs/DECISIONS.md` ｜ 想法库 `docs/IDEAS.md`
5. 首次接手先读 `README.md`（长期定位与原则）

## 当前状态（2026-09-10）

- 当前提交：见 git。Vite + React 前端、Express + SQLite 后端；提示词库 + 竞技场 + 账号评论与投票体系；题库 7 题，其中仅 002/003 可配对（占位内容，虚构模型身份，见 `docs/PRODUCT.md` 内容真实性分级）。
- 2026-09-08 完成文档体系改造与全站改名 arenaofbias（字标 ARENA OF ＋ 酸底切角 BIAS 块）。
- 2026-09-09 Atmeplz 轮：换组防泄漏（决策 014）；作品 iframe 沙箱放行 `allow-same-origin` 修复 3D 黑屏（决策 015）；依赖瘦身 node_modules 365MB→230MB（决策 016）。
- 2026-09-09 本轮：左上角返回入口动效——竞技场 brand 由纯 div 变 `#home` 链接；字标本体保持朴素，动效只做在 mark 图标上（主界面按钮语言：硬投影、悬停微抬、按压回平），定稿形态见 [左上角返回入口归档](docs/handoff/2026-09-09-左上角返回入口按钮化-kme7kme7-prog.md)。
- 2026-09-09 本轮：开发者占位符系统——右下角隐藏 "dev" 面板开启占位符模式后，题库与竞技场全量替换为生成的占位作品（与真实数据严格隔离、设置与占位投票仅存 localStorage），并可随机生成占位投票为榜单 UI 备料，见 [占位符模式与开发者面板归档](docs/handoff/2026-09-09-占位符模式与开发者面板-kme7kme7-prog.md)。
- 2026-09-09 本轮修复（代码审查发现）：占位投票与模型数量可能失配——切换占位模型数量时自动清空占位投票，`readPlaceholderVotes` 按当前阵容过滤兜底（防手工改 localStorage 的残留脏票）；`validate:placeholder` 扩至 9 项。
- 2026-09-09 本轮：偏好榜 `#rank`——原型 `prototypes/ranking.html` 定稿后移植为主站页面（综合/写作/网页三赛道、占位口径简易 Elo、暂定徽章、模型主题色档案卡、色块横推过场、雷达外侧静止内侧挪动）；入口在首页与竞技场揭晓区；新增 `validate:leaderboard`（7 项）；档案卡主题色规范见决策 017，见 [偏好榜归档](docs/handoff/2026-09-09-偏好榜原型与榜单页-kme7kme7-prog.md)。
- 2026-09-10 本轮（已提交 bab6af1 + 合并 fd58cd4）：投票落库——竞技场选择实时计入偏好榜；votes 表对局级去重（决策 021）、投票需登录（决策 020）、开发者面板免登录（`/api/auth/dev`）、GET /api/votes 全量流水公开；同时修复存量 dev 代理 403（vite `changeOrigin: false`）。注意：fd58cd4 合并曾覆盖丢失决策 018/019，已按「编号不复用」以 020/021 补录（归档日志文末有勘误）。见 [投票落库归档](docs/handoff/2026-09-10-投票落库与开发者免登录-kme7kme7-prog.md)。
- 2026-09-10 本轮（未提交）：代码审查 + 修复——审查发现 `validate:votes` 假绿（check 未 await、login 缺 Content-Type、kill 竞态，此前 HTTP 断言从未真正执行）并修复；随后修复次要问题（409 加 code 区分 pair/id、晚到提交响应不再覆盖新一轮反馈、pairKeyOf 两端统一 localeCompare、ArenaMode 并入 arena 的 Mode、服务端 rid/mid trim）。遗留 B1/B2 两个已知 bug 未修（见待办）。
- 2026-09-10 本轮（未提交）：偏好榜赛道切换动画对齐原型——榜单不再按赛道重挂载（`key` 只留 replaySeed），切换走原型同款 FLIP 换位（offsetTop 记位、translateY 差值 1200ms、错峰 28ms、计分淡入、首行扫光 WAAPI 重放）；补上行底色 0.65s 过渡（榜首深底交叉淡化）、tab 滑块 0.8s、sigil 底色随名次过渡。**关键坑**：入场动画不能用常驻 CSS + 随名次变化的内联 animation-delay——delay 一变动画整段重播，换赛道时行会"消失后重新插入"；入场（重播）也改走 WAAPI，与原型同一机制。已在浏览器逐项实测：切换时行无 opacity/translateX 动画、纯 FLIP；重播仍整板入场。
- 2026-09-10 本轮（未提交）：开发者面板新增「随机强弱」开关——默认关闭时占位投票的模型强弱固定（ph-03 种子强度 1.400 顶格，所以老是第一，这是设计不是 bug）；开启后 `generatePlaceholderVotes` 的强弱种子掺入随机盐，每次生成的名次格局都不同（用户要看榜单换位动画）。同时修复生成/清空占位投票后榜单不刷新的问题：面板广播 `aob:placeholder-votes-changed`，榜单页监听后自动重读并重播入场（storage 事件同页不触发）。`validate:placeholder` 扩至 10 项。

## 最新交接

- 2026-09-10 审查与修复轮：对 bab6af1 投票落库做了完整代码审查（含临时端口起真实服务端逐项实测）。核心结论：服务端 8 项行为（401/403/201/409/幂等/换作品可再投/400/公开读取不带 userId）全部符合设计，对局级去重语义与用户原话一致；但 `validate:votes` 此前的"3/3 通过"是假绿——已修复并验证（正常 3/3 exit 0、故意改坏断言 exit 1）。详见待办里的遗留 bug。
- 验证：typecheck / lint（0 错误）/ build / validate:arena（11）/ validate:placeholder（9）/ validate:leaderboard（7）/ validate:votes（9，3/3）全部通过；409 code 区分与 trim 经真实服务端实测。
- 审查与修复轮的改动已由用户提交为 9cc4907「修复了投票的一百亿个bug」。其后一轮（榜单动画对齐原型 + 随机强弱开关）的改动也已入库（见 git log 最近一次动画提交，改动即上述 7 个文件）。验证全过：typecheck / lint（0 错误）/ build / validate:arena（11）/ validate:placeholder（10）/ validate:leaderboard（7）；浏览器实测 FLIP 纯换位、重播入场、随机强弱三轮生成三种榜首、生成后榜单自动刷新。
- **风格改造基线**：上述提交是视觉风格改造前的回退点；若改造效果不佳可能整体回退到该版本。
- 2026-09-10 本轮（已提交）：盲测揭晓解密动画——`lib/decryption.ts` 的 `DocumentDecryption`（`reveal()` 自起 rAF，目标选择器作为构造参数；逐行测量 TreeWalker + Range、错峰 0.22 铺开 / 0.78 窗口、缓动 0.4t² + 0.6(1-t)^(16/3)），遮黑条 CSS 在 `app/globals.css`（ink 色 #20221d）。接线在 `app/page.tsx`：盲测揭晓（phase→result）时 layout effect 内先盖住 `.model-identity` 再逐行退开，用户看不到未遮盖的真实身份；娱乐模式/减少动态效果不解密。
- 2026-09-10 本轮（已提交）：视觉风格改造第一批——①滚动数字：新依赖 `@kitlangton/rolling-number@0.4.1`（MIT，许可存 `public/licenses/rolling-number.txt`），运动参数 460ms + motionBlur（库不读系统减少动态设置，各使用处显式传 `animated={!reduced()}`）；接到榜单行（名次/评分/次数）、档案卡（当前名次/评分/参与比较）与头部总票数。②可打断过渡：`lib/ui-transitions.ts` 的 `SurfaceTransition`（进 300ms/退 200ms，中途反向从当前透明度与位移接续），接到开发者面板开合——注意面板由条件渲染改为常驻挂载 + `hidden` 托管，且 `.dev-panel[hidden]` 需显式 `display:none`（class 的 display:flex 会盖掉 UA 的 hidden 规则）。③终端索引细节：`globals.css` 新增 `.term-ticks` 刻度尺（主刻度 72px/次刻度 12px），接到榜单表头上沿与题库计数行下方；榜单 tab 加 mono 编号（01/02/03）。用户评价"不够激进"，后续批次会继续加码，见 [风格改造第一批归档](docs/handoff/2026-09-10-风格改造第一批-kme7kme7-prog.md)。
- 上一轮投票落库见 [投票落库归档](docs/handoff/2026-09-10-投票落库与开发者免登录-kme7kme7-prog.md)（注意其验证一节中 validate:votes 记录已被文末勘误更正）。

## 待办（下一步候选，非约束）

- **已知 bug B1**（小概率、诚实客户端不触发）：同 UUID 跨对局提交返回 201 并回显旧对局的票——`server/index.js` POST /api/votes 的 INSERT OR IGNORE 回读校验只比对了 userId 未比对字段一致性；修法是回读后比对 promptId/双方 rid 与 mid，不一致按 409 处理。
- **已知 bug B2**（刷票面）：服务端只做形态校验不认识作品清单，伪造 rid 可绕过对局级去重（同一对模型换假 rid 重复计票）；建议 004–007 接入真实作品时把 rid→promptId/mid 映射校验下沉服务端。
- **部署警告**：反代（nginx/Caddy）之后不设 `TRUST_PROXY` 时 req.ip 恒为回环 → `/api/auth/dev` 对公网开放、per-IP 限流失效；部署文档需要写明。
- 004–007 接入模型结果（操作步骤见 `docs/ARCHITECTURE.md` 扩充一节；上轮已验证 `public/works/` + `kind:'html'` 路径可行，注意 dist 需相对路径或构建时 `--base=./`；真实测试集在用户桌面 `AI测试流程设计/模型输出结果`）。接入后真实投票才开始有跨题意义（当前真实模式每题只有一对模型，投完即 409）。
- 已知不一致：竞技场页"本场收录 N 个模型"未过滤 isDemo，与提示词库页口径不同（用户当前不可见，见 `docs/ARCHITECTURE.md` 技术备注）。
- 待用户拍板：002/003 虚构模型身份的长期取向。
- `docs/IDEAS.md` 全部条目均为候选，未经确认不得开发。

## 历史验证备注（2026-09-08 改名阶段）

- 当时通过：`npm run typecheck`、`npm run lint`（0 错误）、`npm run validate:arena`（11 项）、`npm run validate:scroll`；字标形态已经浏览器目视确认。各轮完整验证见 `docs/handoff/` 对应归档。

## 偏好榜原型迭代记录（已定稿并迁移）

- `prototypes/ranking.html` 为单文件视觉原型（另一个 AI 产出初版，本账号与其协作迭代六轮以上）：错峰入场、排名换位、左榜右档布局、六维雷达、深色信息头+浅色图表、切角硬投影强化、原型状态选择器（有排名/无投票/分类不足三种空态）、头部主题色光晕与斜纹的多轮接缝调整。
- 定稿后已迁移为主站 `#rank`（见上方"最新交接"），原型文件保留作视觉定稿记录。逐轮细节见 [偏好榜归档](docs/handoff/2026-09-09-偏好榜原型与榜单页-kme7kme7-prog.md)。
