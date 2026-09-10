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
- 2026-09-10 本轮（已提交 9cc4907）：代码审查 + 修复——审查发现 `validate:votes` 假绿（check 未 await、login 缺 Content-Type、kill 竞态，此前 HTTP 断言从未真正执行）并修复；随后修复次要问题（409 加 code 区分 pair/id、晚到提交响应不再覆盖新一轮反馈、pairKeyOf 两端统一 localeCompare、ArenaMode 并入 arena 的 Mode、服务端 rid/mid trim）。遗留 B1/B2 两个已知 bug 未修（见待办）。
- 2026-09-10 本轮（已提交 e103891）：偏好榜赛道切换动画对齐原型——榜单不再按赛道重挂载（`key` 只留 replaySeed），切换走原型同款 FLIP 换位（offsetTop 记位、translateY 差值 1200ms、错峰 28ms、计分淡入、首行扫光 WAAPI 重放）；补上行底色 0.65s 过渡（榜首深底交叉淡化）、tab 滑块 0.8s、sigil 底色随名次过渡。**关键坑**：入场动画不能用常驻 CSS + 随名次变化的内联 animation-delay——delay 一变动画整段重播，换赛道时行会"消失后重新插入"；入场（重播）也改走 WAAPI，与原型同一机制。已在浏览器逐项实测：切换时行无 opacity/translateX 动画、纯 FLIP；重播仍整板入场。
- 2026-09-10 本轮（已提交 e103891）：开发者面板新增「随机强弱」开关——默认关闭时占位投票的模型强弱固定（ph-03 种子强度 1.400 顶格，所以老是第一，这是设计不是 bug）；开启后 `generatePlaceholderVotes` 的强弱种子掺入随机盐，每次生成的名次格局都不同（用户要看榜单换位动画）。同时修复生成/清空占位投票后榜单不刷新的问题：面板广播 `aob:placeholder-votes-changed`，榜单页监听后自动重读并重播入场（storage 事件同页不触发）。`validate:placeholder` 扩至 10 项。
- 2026-09-10 本轮（已提交 dcb2b59）：代码审查 + 修复落地——审查发现三处：决策 026「只看正式」榜单切换缺失（已补）、page.tsx 一处类型声明挤行（已修）、ui-transitions.ts 的 ContentTransition 死代码（已删）。「只看正式」实现：VoteRecord/voteToRecord 带 mode → leaderboardData 加 scope 口径（mixed/formal，无 mode 的占位票只在混入计入）→ 榜单页 rank-actions 加切换按钮（占位模式隐藏）。验证：typecheck / lint（0 错误）/ build / validate:arena（11）/ placeholder（10）/ leaderboard（扩至 8）/ scroll（5）/ votes（9，voteToRecord 断言随新结构更新）全过；浏览器端到端实测：dev 登录 → #formal/003 投票落库 mode=formal → 榜单只看正式显示该票（2 行）、混入 4 行、formal+网页赛道 2 行、formal+写作空态；切换可逆。截图存 gui-test-screenshots/。测试产生的 formal 票已从本地库清除。注意：先在 #formal/002 试投时被 409 对局去重挡下（用户凌晨的 blind 票占了同对局，mode 不分流去重——决策 021 语义，不是 bug）。
- 2026-09-10 本轮（未提交）：文档一致性修复——①PRODUCT.md：删除重复两遍的「当前未实现」章节与过时的「可切换的空间体验」章节（573b746 提交时空间版文档同步撞车遗留）、从「当前未实现」移除已实现的「只看正式」并在偏好榜/场内状态两处补记其口径语义；②ARCHITECTURE.md：校验项数更新（validate:placeholder 9→10、validate:leaderboard 7→8，均实跑核对）并补 `BoardScope` 口径、`voteToRecord` mode 描述；③HANDOFF.md：此前标「未提交」的各轮改为实际提交号（9cc4907 / e103891×2 / dcb2b59 / 573b746×2），悬空基线引用 133a129 注明已不存在。无代码改动；validate:placeholder（10）与 validate:leaderboard（8）实跑通过。
- 2026-09-10 本轮（未提交）：首页全屏过渡修复（用户报：进入评测的 Round Start 过渡设计有问题、会卡、色块盖满后直接消失无退场）——旧 `.lobby-wipe` 三个根因：clip-path inset 动画每帧整屏重绘（卡顿）；色块挂在 Home 组件内，路由一换组件卸载、色块瞬间消失（无退场）；主按钮现在去玩法菜单但文案仍是直连竞技场时代的 Round Start（语义错）。修复：`lib/ui-transitions.ts` 新增 `wipeNavigate(hash, copy)`——色块层动态挂在 body 上独立于路由存活，纯 transform 合成器横扫（扫入 360ms → 盖满停顿 150ms 内切路由、新页在遮挡下挂载 → 扫出 400ms 露出），文案随目的地（进菜单 SELECT YOUR GAME/Play Menu；随机入场 YOUR INSTINCT MATTERS/Round Start），reduced-motion 直接换页不扫；home.tsx 删 timer/wipe JSX，home.css 删全部旧 wipe 规则（含 lobby-cover 与 reduced-motion 覆盖），`.page-wipe` 样式进 globals.css（样式与动画参数注释写明不能回到 clip-path/组件内挂载的原因）。验证：typecheck / lint（0 错误）/ build 全过；浏览器实测两条路径——DOM 时间线（盖满帧 transform≈0 且 hash 未变→遮挡下 hash 切换→退场帧 translateX 递增→结束遮罩移除）+ 像素佐证（盖满帧 97%+ 墨色含酸黄文字、退场帧左亮右暗、终态两半屏全亮无残留）；截图存 gui-test-screenshots/t1-*、t2-*，像素分析脚本 scripts/wipe-pixel-check.mjs 留档。注意：IAB 后台标签帧节流会推迟动画 finished 回调（遮罩晚一两秒才移除），前台浏览器不受影响；Playwright 点击会被首页 lobby-rise 入场动画的 actionability 检查卡超时，坐标点击可绕过（测试手法，非页面 bug）。
- 2026-09-10 本轮（未提交）：动效对照工具体系（决策 029，用户拍板「改动效前先建对照工具」，分层 A 断言+对照页 / B 只对照页 / C 不管，断言只锁不变量不锁设计参数）——①`wipeNavigate` 抽出 `defaultWipeTiming`（cover 360/hold 150/exit 400 + ease）并支持第三参 `Partial<PageWipeTiming>` 覆盖（默认行为不变，供对照页调参）；②`scripts/check-wipe.mjs`（8 项不变量：默认参数即线上值、层挂 body+aria-hidden+文案结构、结束清理可复用、防重入不改目的地、盖满才换路由、关键帧只动 transform+偏移精确、timing 覆盖生效、reduced 直达）与 `scripts/check-surface.mjs`（7 项：完整开/关状态机、**开到一半立即关从当前透明度/位移接续**、已隐藏 hide 空操作、reduced 直达、dispose 取消且可复用、finish 同步收尾），模式同 validate-*：typescript 转译 + data URL 导入 + 手写时钟假 DOM，无需浏览器；npm 挂 `check:wipe`/`check:surface`/`check:motion`；③`reference/wipe-review.html`、`reference/surface-review.html` 对照页（dev server 下 `/reference/*.html`）：import 真实 `lib/ui-transitions.ts` 非复制品，滑杆调三段节奏/进退时长、缓动选择、文案输入、reduced 模拟、surface 页实时状态机读数与打断演示、wipe 页带旧版复刻按钮（clip-path 盖满即消失，手感对照）；页面顶部注明定稿后回写 `defaultWipeTiming`/构造参数。验证：check:motion 15 项、typecheck / lint（0 错误）/ build 全过；浏览器实测 wipe 页（默认 910ms 时间线：360 盖满→hash 翻转→510–910 扫出→921 层移除；滑杆 cover=600 实测盖满 631ms 总时长联动 1150；旧版复刻 601ms 即消失；reduced 不出层）与 surface 页（open→open 动画清理；打断演示反向动画第一帧 opacity=0.9615 即当时进行值，非 0 跳变；终态 closed+hidden+0 动画）。修复过程中两处对照页自身的坑：surface 打断演示在面板已开时 show() 是 1→1 无意义，改为先归位关闭态再演示；假动画 `finished` promise 被 cancel 时无人订阅会崩 Node 进程（浏览器无此问题），预挂空 catch。④应用户要求在 `AGENTS.md` 增补一条**建议性**规则「动效改动：改动效前优先先建/更新对照工具再改行为」（用户明确要求措辞为建议而非强制），指向 DECISIONS 029 与 ARCHITECTURE 验证小节——保证任何接手 AI 经必读的 AGENTS.md 可发现该工具体系。

## 最新交接

- 2026-09-10 空间版下线 + 正式测评落地（已提交 573b746）：用户拍板「3D 太丑去掉、空间版移除、品牌字标移植经典版、dev 身份拥有正式测评资格」（决策 027/028）。①删除 `app/observatory.tsx`、`home-spatial.tsx`、`components/archive-stage.tsx`、`experience.tsx`、`lib/spatial-motion.ts`、`lib/archive-audio.ts`、`scripts/validate-spatial.mjs`，卸载 three/@types/three，`main.tsx` 回到无切换的纯经典路由；`app/observatory.css` 与 MiSans 字体包保留（Event 页与移植的字标在用，含待清理的死规则）。②品牌移植：`.lobby-brand` 与竞技场 `.brand strong` 改 MiSans 400/800 双字重、BIAS 去酸底块（决策 027）。③正式测评：`#formal/{promptId}` 路由 + Arena `formal` prop（reducer 初始 mode='formal'，永不揭晓、无评论区）；mode 全链路放行 formal（arena.ts Mode / votes.ts / server VOTE_MODES）；玩法菜单按 `user?.username==='dev'` 判定资格（决策 028），未登录锁定「需要资格」。验证：typecheck / lint（0 错误）/ build / validate:arena（11）/ placeholder（10）/ leaderboard（7）/ scroll / votes（9）全过；浏览器实测：登出锁定、dev 解锁、#formal 投票后身份仍「未知模型 / IDENTITY ENCRYPTED」、评论区替换为匿名提示、题库/特别赛页正常。注意：测试登出接口时发现无 body 的 POST 会被 auth 中间件 415 挡（与 dev 登录同坑，需带空 JSON）。
- 2026-09-10 玩法结构落地（已提交 573b746）：按决策 023–026 重整——新首页主按钮进 `#play`；玩法菜单 `app/play-menu.tsx`（MODES：正式测评/娱乐测评/鹈鹕大乱斗）；特别赛占位页 `app/event.tsx`；竞技场废除娱乐站队（page.tsx 模式切换 UI 换成静态「娱乐测评」牌，reducer 内部 mode 保留）。验证：typecheck / lint（0 错误）/ build / validate:arena（11）/ placeholder（10）/ leaderboard（7）/ spatial（3）/ scroll 全过。PRODUCT/ARCHITECTURE 已同步（其中"空间体验/菜单 3D"描述已随本轮 027 作废，见最新一条）。
- 2026-09-10 玩法结构对齐（文档轮，无代码改动，已随 573b746 入库）：用户否定空间版首页 hero（变化过大、颜色偏淡、视觉重心不对），并明确产品骨架——首页职责是「进入」，要抓眼球、允许 3D 做氛围背景，但视觉重心必须是进入**玩法菜单页**的主按钮；菜单列玩法，点进才开始评测；玩法分三层（名称暂定）：**正式测评**（资格制、全程匿名、无评论区）、**娱乐测评**（选完才揭晓身份、有评论区，废除全程公开的娱乐站队）、**特别赛**（鹈鹕大乱斗类常驻/轮换独立页、独立成榜）；榜单归属：正式+娱乐混榜、可切换只看正式（决策 026）；3D 档案阵列只允许放题库页且要收敛尺寸、必须能快速检索；菜单页优先 3D、效果不好退仪器档案风卡片。已落实：README「首页与玩法结构」与榜单段、DECISIONS 023–026、IDEAS E06/P06。（落地实现见上一条"玩法结构落地"。）
- 2026-09-10 空间体验改造（已被 027 下线；CSS/字体等幸存资产随 573b746 入库；当时基线提交 133a129 在后续重组中已不存在）：用户明确授权完整视觉更新，决策 022。新增默认空间版首页/题库（Three.js 原创纸页档案阵列、选中抽取、相机跟随、点选/横拖、检索、全文展开、进入竞技场横推转场）；MiSans 字体、短标题滚动、默认关闭的原创合成音效。竞技场/榜单/样例页统一新版纸张与仪器层次，竞技场补评审阶段轨道；雷达快切改为从当前显示值接续。左下角空间版/经典版切换保留旧界面，保存偏好；内存报告不高于 2GB 时默认经典，WebGL 故障及空间组件异常回退。
- 核心文件：`app/observatory.tsx`、`app/observatory.css`、`components/archive-stage.tsx`、`components/experience.tsx`、`components/rolling-label.tsx`、`lib/spatial-motion.ts`、`lib/archive-audio.ts`；入口 `src/main.tsx` 动态加载三维模块。新增字体包（全部约25MB，按字符请求）。
- 本轮验证：typecheck、lint、build；validate:arena（11）、placeholder（10）、leaderboard（7）、scroll（5）、votes（9）、新增 spatial（3：30/120fps一致、无回弹、反向接续）通过。IAB 实测桌面/390px手机首屏、搜索联动、档案展开/进入竞技场、跳过巡览、未登录选择与揭晓评论、榜单及网页空态、经典切换与恢复空间版。修复截图发现的标题与模型重叠、手机导航挤压、滚动编号继承小字号；入口热更新增加 root 卸载。
- 验证边界：未做低性能真机跑分或人工听辨；未强制触发 WebGL 上下文丢失。build 有 Three.js 独立块551KB（gzip约138KB）的体积提醒，已按需加载；字体CSS约600KB级，后续可进一步按需拆分。未跑 validate:comments（未改评论链路，避免写用户本地库）。暂无新 Blender 资产需求。未 commit / push，等待用户体验评审。

- 2026-09-10 审查与修复轮：对 bab6af1 投票落库做了完整代码审查（含临时端口起真实服务端逐项实测）。核心结论：服务端 8 项行为（401/403/201/409/幂等/换作品可再投/400/公开读取不带 userId）全部符合设计，对局级去重语义与用户原话一致；但 `validate:votes` 此前的"3/3 通过"是假绿——已修复并验证（正常 3/3 exit 0、故意改坏断言 exit 1）。详见待办里的遗留 bug。
- 验证：typecheck / lint（0 错误）/ build / validate:arena（11）/ validate:placeholder（9）/ validate:leaderboard（7）/ validate:votes（9，3/3）全部通过；409 code 区分与 trim 经真实服务端实测。
- 审查与修复轮的改动已由用户提交为 9cc4907「修复了投票的一百亿个bug」。其后一轮（榜单动画对齐原型 + 随机强弱开关）的改动也已入库（并入 e103891，与风格改造第一批同一次提交）。验证全过：typecheck / lint（0 错误）/ build / validate:arena（11）/ validate:placeholder（10）/ validate:leaderboard（7）；浏览器实测 FLIP 纯换位、重播入场、随机强弱三轮生成三种榜首、生成后榜单自动刷新。
- **风格改造基线**：上述提交是视觉风格改造前的回退点（用户计划进行一轮视觉风格改造；若改造效果不佳可能整体回退到该版本）。
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
