# 架构、代码地图与本地验证

本文描述技术架构、代码地图、后端 API 面与本地运行验证。产品行为规则（路由语义、抽组规则、场内状态、账号评论语义）见 `docs/PRODUCT.md`。

## 技术栈

- 前端：Vite 8 + React 19 + TypeScript，hash 路由由 `src/main.tsx` 分发；Tailwind 4（postcss）；页面样式为各页独立 CSS（`app/*.css`）。
- 后端：Express 4 + better-sqlite3（WAL），无外部数据库服务。
- 运行时：Node >=22.12.0（`package.json` engines）。
- 工具链：oxlint / oxfmt / tsc --noEmit。

## 代码地图

| 文件 / 目录 | 职责 |
| --- | --- |
| `src/main.tsx` | 入口与 hash 路由分发；`AccountProvider` 包裹全站；挂载 `DevPanel`；统一样式导入顺序；不启用 StrictMode（文件内注释：避免入场动画 effect 在开发模式重复执行）；`#arena` / `#random` 重定向到随机竞技场；`#rank` 渲染偏好榜 |
| `app/home.tsx` + `home.css` | 首页 Hero、三类型预览切换、随机入场转场 |
| `app/prompt-library.tsx` + `library.css` | 提示词库：搜索、类型筛选、每题模型数/结果数（过滤 isDemo）、入口 |
| `app/prompt-preview.tsx` | 无可比较结果提示词的预览页：提示词全文 + isDemo HTML 样例 iframe（sandbox） |
| `app/ranking.tsx` + `ranking.css` | 偏好榜 `#rank`：综合/写作/网页三赛道 tab、Elo 排行表（暂定徽章、领奖台层次）、右侧模型档案卡（头部染模型主题色，决策 017；切模型走色块横推过场、名字在抹片掩护下更换、雷达外侧静止内侧插值挪动）、空态（无投票 / 分类数据不足）；`prototypes/ranking.html` 是其视觉定稿原型 |
| `app/play-menu.tsx` | 玩法菜单 `#play`（仪器档案风列表）：`MODES` 数据 + dev 资格判定（决策 028），正式测评入口指向 `#formal/{id}` |
| `app/event.tsx` | 特别赛「鹈鹕大乱斗」独立页 `#event`（占位：起源题 001 入口；复用 observatory.css 的 2D 仪器排版） |
| `app/page.tsx` | 竞技场舞台：入场动画序列、投票/锁定/揭晓、换组、展开 Dialog、音效（WebAudio 振荡器）、键盘快捷键；`Work` 按 `content.kind` 四分支渲染（image / text / web / html）；`WebWork` 为 003 的硬编码 React 演示模板（template a/b） |
| `app/globals.css` | 竞技场全局视觉（spotlight、锁定、评论区等）、页面横扫过渡层 `.page-wipe`（`wipeNavigate` 动态创建） |
| `app/account.css` | 登录/注册 Dialog 与账号按钮样式 |
| `lib/arena.ts` | 全部题库数据与核心逻辑，详见下节；`modelResults` 是内置兜底清单（启动前与 `/api/works` 拉取失败时使用，数据即 `lib/works-roster.json`）；`ResultContent` 的 html 变体支持 `src`（外部文件）或 `html`（内联字符串，占位作品用）；`randomArenaHash` 可传入自定义数据源 |
| `lib/works-roster.json` | 内置作品清单（身份 + 完整 content），三处共享：前端兜底（arena.ts）、服务端 works 表首启动种子、投票校验的数据基础（经 works 表）；新增作品只改这一处 JSON（后台建成后改为后台登记） |
| `lib/track.ts` | 访客统计上报（决策 042）：页面加载时 POST /api/track 一次（主站带初始 hash 路由，admin 报 /admin.html），失败静默；服务端中间件方案在 dev 下失效（vite 发页面，Express 看不到请求）故改此方案 |
| `lib/works.ts` | 远端作品清单数据层（决策 040）：`fetchWorks` 拉 `GET /api/works`（已发布作品，content 为 JSON 字符串，逐行解析、坏行跳过）；`loadWorks`/`getWorksState`/`subscribeWorks` 的小型 store（main.tsx 启动即拉取，就绪后重渲染）；`currentWorks()` 在未就绪时返回内置 `modelResults`——`currentResults`（占位关闭时）以此为准 |
| `lib/placeholder.ts` | 开发者占位符系统：占位模型/结果/投票生成（播种伪随机，重建结果不变；「随机强弱」开关开启后投票强弱掺随机盐、每次生成名次格局不同，默认关闭保持可复现）、面板设置与占位投票的 localStorage 读写、`current*` 数据源帮助函数（占位模式开启时全站读它，关闭时原样返回真实数据）；隔离与剥离方式见文件头注释；`hashSeed`/`mulberry32` 导出供榜单维度生成复用 |
| `lib/leaderboard.ts` | 榜单数据层：`leaderboardData(category, votes, scope)` 把传入投票聚合成排行榜行（占位口径简易 Elo：基准 1200、K=32、按时间序迭代；wins/losses/winrate/topics/暂定判定 <30 场），聚合前先按当前阵容过滤未知模型的票；口径 `BoardScope`（决策 026）：mixed 混入全部票，formal 只计 mode=formal 的票，无 mode 的占位票只在混入口径计入；`radarProfile`/`radarAverage` 生成播种的六维演示值；`currentVotes()` 为占位模式的默认投票来源 |
| `lib/votes.ts` | 投票数据层：`ArenaVote` 类型（对局级：winner/loser 的作品 id + 模型 id + mode）、`validateVote` 前端校验（形态规则与 `server/index.js` 镜像；服务端另按作品清单核对票面）、`pairKeyOf` 对局去重键、`submitVote`/`fetchVotes`、`voteToRecord` 流水→榜单聚合记录（带 mode，供只看正式口径过滤） |
| `lib/comments.ts` | 评论类型与 `validateComment` 字段校验（UUID、题号白名单、side、1–280 字），与后端规则保持一致 |
| `lib/scroll-tour.ts` | 长文作品按阅读速度自动滚动（smoothstep 缓动、可 Abort、后台标签不跳帧） |
| `lib/arena-scroll.ts` | 竞技场定位：下一帧将命题区滚到视口上方，允许路由归顶先完成；支持 reduced-motion，返回取消函数避免卸载后误滚动 |
| `lib/decryption.ts` | 盲测揭晓的「文档解密」：逐行测量身份文字、遮黑条错峰退开；`reveal()` 自起 rAF，减少动态效果直接落终态 |
| `lib/ui-transitions.ts` | 可打断的界面过渡与页面级横扫：`SurfaceTransition`（进出可从当前透明度/位移接续反向，开发者面板在用）；`wipeNavigate(hash, copy, timing?)` 全屏横扫换页——色块挂 body 独立于路由存活，transform 驱动扫入盖满时切路由、新页在遮挡下挂载、再扫出露出（首页主按钮与随机入场在用，文案随目的地）；默认节奏在 `defaultWipeTiming`（360/150/400），timing 覆盖仅供 reference 对照页调参 |
| `lib/utils.ts` | `cn()`（clsx + tailwind-merge） |
| `components/account.tsx` | `AccountProvider` / `useAccount` / 登录注册 Dialog / `AccountButton`；窗口聚焦自动刷新会话 |
| `components/afterparty.tsx` | 评论区：登录门槛、401 刷新会话并弹登录框、幂等 id、匿名观测员显示、刷新重试 |
| `components/dev-panel.tsx` + `app/dev.css` | 开发者面板：右下角低对比 "dev" 入口（后期上线删除 `main.tsx` 挂载即隐藏）；开发者身份免登录（`POST /api/auth/dev`）、占位符模式开关、模型数量、生成/清空占位投票（写后广播 `aob:placeholder-votes-changed`，榜单页监听后立即重读并重播入场）、随机强弱开关、占位模式徽标 |
| `components/ui/` | 只保留实际使用的 button、dialog、tabs、textarea 四个组件（2026-09-09 瘦身清掉其余 56 个未使用组件）；新增组件用 `npx shadcn@latest add <名>` 按需引入，CLI 不入依赖；`app/globals.css` 顶部内联了原 `shadcn/tailwind.css` 中用到的 data-* 状态变体 |
| `server/index.js` | Express：静态托管 dist/（主站 + admin 双入口）、评论 GET/POST、作品 GET（works 表，只吐已发布，决策 040）、投票 GET/POST（votes 表，对局级去重 `votes_user_pair` 唯一索引）、投票票面按 works 表核对（rid 真实、已发布、非 demo、属本题、与 mid 一致；同 UUID 回读比对全部字段，跨对局重放 409）、`PRAGMA user_version` 结构迁移（001 works 表 + 种子、002 page_views 表）、访客统计记录中间件（只记页面 HTML，IP 按当日盐哈希）、`/api/admin/*` 管理组（stats 仪表盘 / log 数据流水，requireAdmin 门禁：未登录 401、非管理员 404）、内存滑动窗口限流（评论与投票共用）、同源校验、`comments.user_id` 启动时自动 ALTER 迁移、`TRUST_PROXY` / `APP_ORIGIN` |
| `server/auth.js` | 账号：注册/登录/登出/`/api/auth/me`/开发者免登录 `/api/auth/dev`（固定 dev 账号，仅本机回环或 `ALLOW_DEV_LOGIN=1`）；scrypt（N=32768, r=8, p=1）；cookie 与 sessions 表；`auth_limits` 双维度限流；scrypt 并发上限 4；`users.role` 管理员标记（`ADMIN_OWNER` 引导期授权，决策 041） |
| `scripts/validate-arena.mjs` | 状态机 + 题库数据校验（transpile lib/arena.ts 后断言，11 项） |
| `scripts/validate-placeholder.mjs` | 占位符系统校验（10 项）：生成器结构、与配对函数集成、真实/占位数据隔离、切换模型数量后旧阵容投票被过滤、随机强弱开关（开启后格局变化、关闭时可复现）；arena.ts 与 placeholder.ts 拼合为一个模块后断言，localStorage 以 shim 代替 |
| `scripts/validate-leaderboard.mjs` | 榜单校验（8 项）：空票空榜、行数与排序、胜负自洽（games=wins+losses、总场次=2×票数）、Elo 零和、分类过滤（写作榜只计 text 题）、口径过滤（决策 026：只看正式只计 formal 票）、雷达确定性与值域、行元数据（PH sigil 与强调色、demo 结果不进榜）；三模块拼合，localStorage 以 shim 代替 |
| `scripts/validate-votes.mjs` | 投票校验（11 项）：前端 `validateVote`/`pairKeyOf`/`voteToRecord` 规则（含题号白名单、胜负同体、mode 拦截）；子进程起真实 server + 临时 SQLite，覆盖未登录 401、跨源 403、写入 201、对局去重 409、同 UUID 幂等重试、票面清单核对 400（伪造 rid / rid 与题号不符 / mid 与 rid 不符 / 演示作品）、同 UUID 跨对局重放 409（B1/B2 回归）、非法 payload 400、流水升序、服务端返回能通过前端校验、GET /api/works 迁移种子（5 条、已发布、content 合法 JSON）；拼合模块时把 works-roster.json 内联注入（data URL 解析不了相对路径） |
| `scripts/validate-scroll-tour.mjs` | 滚动巡览校验（mock rAF，5 项） |
| `scripts/validate-admin.mjs` | 管理后台校验（7 项，决策 041/042）：起真实 server + 临时 SQLite（带 `ADMIN_OWNER`），覆盖管理员标记（ADMIN_OWNER 账号 role=admin、普通账号 null）、admin 门禁（未登录 401 / 普通用户 404 / 管理员 200）、访客统计（/api/track 上报记录、跨源 403、stats 字段自洽、体检形态）、数据流水（投票/评论/注册记录、关键字过滤、未知类型 400）、dev 登录即管理员 + 清票接口（普通用户 403、清后重投 201、他人票不受影响）、评论按内容可搜、双入口构建产物存在 |
| `scripts/register-works.mjs` | 作品批量登记（决策 043，后台第二期的雏形）：`npm run register:works -- --source <目录> --prompt <题号> [--draft]`，解析「标题，模型名.html」→ 复制进 `data/works/<题号>/` → works 表入库（默认已发布）；文件名排序生成稳定 id，幂等可重跑；中文模型名掺短哈希防塌缩 |
| `scripts/check-arena-scroll.mjs` | 竞技场命题定位契约：延迟执行、平滑/减少动态效果、卸载取消与脱离 DOM 跳过 |
| `scripts/validate-comments.mjs` | 评论接口集成检查，需先启动后端；写本地 data 库并自清理 |
| `scripts/check-wipe.mjs` | 页面横扫过渡不变量断言（决策 029，8 项）：层挂 body、盖满才换路由、关键帧只动 transform、结束必清理、防重入、reduced-motion 直达、timing 覆盖生效；手写时钟 + 假 DOM，无需浏览器 |
| `scripts/check-surface.mjs` | SurfaceTransition 不变量断言（决策 029，7 项）：开/关中途反向从当前透明度/位移接续（不跳变）、状态机与 hidden 托管、已隐藏时 hide 空操作、reduced 直达、dispose 可复用；假 getComputedStyle 会采样动画进行中的值 |
| `lib/game-transitions.ts` + `app/game-transitions.css` | 新过场（决策 031–034）：`createGameTransition('frame'/'bands')`，rAF 推进共享 WAAPI 轨道、盖满才回调 `onCovered`、支持 play/pause/seek/dispose；frame 接首页主按钮（进 `#play`，防重入锁在 home.tsx），bands 经 `bandsNavigate` 接首页↔题库/偏好榜 |
| `reference/` | 动效与比例对照页（决策 029）：`wipe-review.html`、`surface-review.html`、`game-transitions-review.html`、`arena-layout-review.html`，dev server 下访问 `/reference/*.html`；后者以 iframe 载入真实竞技场并提供可用视口档位，调赛后布局、提示词展开和入场定位。 |
| `public/works/` | 内置演示样例 HTML（当前 `pelican-cycle.html`），由 kind:'html' 结果以 sandbox iframe 引用；**新作品不走这里**——后台/脚本登记的作品在 data/works（见 WORKS_DIR），/works 请求优先 data/works、回落此处 |
| `public/art/` | webp 素材（lunar、signal-a/b，首页预览与 WebWork 背景） |
| `data/` | SQLite 本地库（comments.db），gitignored，勿手改 |
| `dist/` | `vite build` 产物，gitignored |
| `outputs/` | 历史部署 tar.gz 归档，gitignored |
| `docs/` | 文档体系，见 `AGENTS.md` 文档地图 |

## lib/arena.ts 结构

- 类型：`Prompt`、`ModelResult`（id / promptId / modelId / modelName / title / isDemo? / content）、`ResultContent`（四 kind 联合）、`Matchup = [ModelResult, ModelResult]`。
- 数据：`prompts`（7 题）、`modelResults`（5 条：001 样例 + 002/003 各两条占位结果，即 `lib/works-roster.json` 的内置兜底）。`Story` 类型（heading/paragraphs/ending）在此定义，002 两篇小说的内容在 roster JSON 里。
- 函数：`resultsForPrompt`、`eligiblePairs`（同题、非 demo、两两不同 modelId 的全组合）、`pickMatchup`（优先排除上一组，随机选组并随机翻转左右）、`randomArenaHash`（在 eligiblePairs > 0 的题中均匀随机，可排除当前题，空池回退 `#prompts`）。语义规则见 `docs/PRODUCT.md` 抽取规则一节。
- 状态机：`Phase = loading | intro | voting | locking | result | transition`；`Mode = blind | party`；Action：`LOADED / READY / VOTE / REVEAL / SWITCH / ARRIVE / REPLAY / MODE`。`transition` 统一承载换组、重播、切模式，`ARRIVE` 时清除选择。
- `export const rounds = prompts`：legacy 别名；`round` 索引现仅标识当前 prompt，不再有"轮次"语义。

## 后端 API 面

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/register` | 用户名 `^[a-z0-9_]{3,24}$`（小写归一化）、密码 12–128；scrypt 加盐哈希存 `users.password_hash`（`scrypt:salt:hash`）；注册即登录 |
| `POST /api/auth/login` | 不存在的账号也用 dummySalt 做一次真 scrypt + timingSafeEqual 比较，防时序探测 |
| `POST /api/auth/logout` | 删除当前 session 并清 cookie |
| `GET /api/auth/me` | 会话查询，返回 `{ user }` |
| `POST /api/auth/dev` | 开发者免登录（决策 020）：仅本机回环 IP 或 `ALLOW_DEV_LOGIN=1` 时开放；固定 `dev` 账号首次使用时创建，密码随机生成不留存 |
| `GET /api/comments?round=xxx` | 按题取最新 100 条，联表 users 返回 username；无需登录 |
| `POST /api/comments` | 需登录（401）、同源（403）、JSON（415）、校验（400）、幂等插入（id 冲突或内容不符 409） |
| `GET /api/works` | 已发布作品全量清单（works 表 `published=1`，按登记时间升序），公开；content 为 JSON 字符串由前端 `lib/works.ts` 解析（决策 040） |
| `GET /api/votes` | 全量投票流水（promptId/winnerRid/winnerMid/loserRid/loserMid/mode/ts），按时间升序，公开、不带用户信息 |
| `POST /api/track` | 访客浏览上报（决策 042）：前端页面加载时上报一次 path，同源即可无需登录，204 静默（失败也 204）；跨源 403 |
| `GET /api/admin/stats?days=N` | 管理员专用：今日/昨日浏览与访客、近 N 日趋势（1–90）、累计票评注册作品数、Node 体检（内存/运行时长/平台）；未登录 401、非管理员 404 |
| `GET /api/admin/log?kind=&q=&limit=` | 管理员专用：投票/评论/注册三类流水（倒序，kind 不合法 400），q 关键字过滤（用户名/题号/内容），limit 1–200；未登录 401、非管理员 404 |
| `POST /api/dev/clear-my-votes` | 调试：清空 dev 自己的全部真实投票（决策 042）；仅 dev 账号 + 本机回环（或 ALLOW_DEV_LOGIN=1），同源；只影响 dev，其他用户的票不动 |
| `POST /api/votes` | 需登录（401）、同源（403）、JSON（415）、校验（400：UUID / 题号白名单 / 胜负不得同体 / mode ∈ blind\|party / 票面与 works 表核对——rid 真实、已发布、非 demo、属本题、与 mid 一致）；同对局已投换 UUID 重投 409、同 UUID 重试仅当票面完全一致才幂等 200，跨对局重放或票面不符 409（响应带 `code: pair/id` 区分对局重复与编号冲突）；rid/mid trim 后入库 |

横切行为：

- Cookie `arena_session`：httpOnly、path=`/api`、sameSite=lax、7 天；`APP_ORIGIN` 以 https 开头或请求为 https 时加 secure。sessions 表只存 token 的 SHA-256。
- 限流：评论每 IP 每分钟 `RATE_LIMIT_PER_MIN`（默认 10，内存滑窗）；auth 接口按 IP 30 次/15 分钟 + 账号名 10 次/15 分钟双维度（`auth_limits` 表，429 + Retry-After）；scrypt 并发上限 4（超出 503）。
- `/api` 全部响应带 `Cache-Control: no-store`。
- 同源校验：`Origin` 必须等于 `APP_ORIGIN`（未设置时取请求自身来源）；`TRUST_PROXY` 为逗号分隔的可信代理 IP 列表，用于 `req.ip` 取真实客户端。
- 请求体上限 4kb；解析错误统一转友好提示。
- 静态托管：dist/ 存在时带哈希产物长缓存（assets/art 7 天 immutable），index.html no-cache，未知 GET 路径 SPA 回退到 index.html。

## 运行与验证

```powershell
npm install
npm run dev        # 开发：web 5173（HMR）+ api 3000（node --watch）
npm run build
npm start          # 生产形态：http://localhost:3000
```

检查命令：`npm run typecheck`、`npm run lint`、`npm run validate:arena`、`npm run validate:scroll`、`npm run validate:placeholder`、`npm run validate:leaderboard`、`npm run validate:votes`、`npm run validate:admin`（均自带临时 SQLite 与随机端口，无需先起服务）；`npm run validate:comments` 需先 `npm start`（或 dev:server），操作本地 data 库并自清理；`npm run check:motion` 校验四类界面行为（wipe / surface / game / arena-scroll）的不变量，或分开跑 `check:wipe` / `check:surface` / `check:game` / `check:arena-scroll`，无需起服务。改动效遵循决策 029：先建/更新对照工具（`scripts/check-*.mjs` 断言 + `reference/*-review.html` 调参页）再改行为。

后台本地访问：`npm run dev` 后打开 `http://127.0.0.1:5173/admin.html`（vite 实际端口看启动输出）。dev 面板一键登录即管理员（决策 042），无需环境变量；生产部署给其他账号授权直接改库。重复测试投票被对局去重挡下（409「这一对作品你已经投过票了」）时，用 dev 面板的「清空重投」清掉 dev 的票再投。

环境变量（均有默认值，本地开发可不设）：

| 变量 | 作用 |
| --- | --- |
| `PORT` / `HOST` | 监听端口（默认 3000）/ 地址（默认 0.0.0.0） |
| `DATA_DIR` | SQLite 文件目录（默认 `<项目根>/data`） |
| `RATE_LIMIT_PER_MIN` | 评论每 IP 每分钟条数（默认 10） |
| `ADMIN_OWNER` | 后台管理员引导（决策 041，已被 042 的「dev 即管理员」大幅弱化）：该用户名的账号在启动时与登录时被标为 admin（幂等）。本地开发用 dev 面板一键登录即管理员，无需此变量；生产给其他账号授权直接改库 `UPDATE users SET role='admin' WHERE username='xxx'` |
| `APP_ORIGIN` | 站点完整来源（如 `https://域名`），用于同源校验与 secure cookie |
| `TRUST_PROXY` | 逗号分隔的可信代理 IP（如 nginx 同机部署时 `127.0.0.1`） |
| `WORKS_DIR` | 作品文件目录（决策 043，默认 `<DATA_DIR>/works`）：登记脚本与后台写入、Express 以 `/works/` 优先供给（回落 dist 内 public/works 的小型演示样例）；VPS 上指向固定位置，宝塔直接往里传文件。**大文件不入 git** |

已知环境限制：AI 沙箱内 `vite build` 可能因原生二进制加载与子进程限制失败（`spawn EPERM`、oxide / lightningcss 的 .node 文件无法加载），属环境限制而非代码问题，需在本地终端复核。

## 扩充内容操作步骤

1. `lib/arena.ts` 的 `prompts` 追加提示词：三位数字 id、`kind`（image / text / web）、文案字段。
2. 新增结果（后台/脚本路线，推荐）：`npm run register:works -- --source <目录> --prompt <题号>` 批量登记——文件名按「标题，模型名.html」命名，脚本复制进 data/works 并写 works 表（决策 043，详见该脚本说明）；`--draft` 可登记为未发布。手工路线：改 `lib/works-roster.json`（种子，仅空表时种入）+ 重启。HTML 作品多文件（index.html + assets/ 相对路径）同样支持：整目录放 `data/works/<题号>/<作品id>/`，content.src 指到其 index.html。
3. 同步两处评论题号白名单：`lib/comments.ts` 的 `validateComment` 与 `server/index.js` 的 `ALLOWED_ROUNDS`。
4. HTML 作品：文件放 `public/works/`，结果用 `content: { kind: 'html', src: '/works/xxx.html' }` 引用（sandbox iframe 预览）。
5. `isDemo: true` 的结果不计模型数、不参与配对与随机竞技场，仅预览页可见（语义见 `docs/PRODUCT.md` 内容真实性分级）。
6. 无需修改抽组逻辑；某题补齐两个不同 modelId 的结果后，`#arena/{id}` 地址自动从预览页变为竞技场（路由按 eligiblePairs 判定）。

## 已知不一致 / 技术备注

- 竞技场页"本场收录 N 个模型的 M 份结果"（`app/page.tsx`）统计未过滤 isDemo，与提示词库页口径不一致；当前可进竞技场的题都没有 demo 结果，用户不可见，未修。
- 评论列表后端 `LIMIT 100`，前端条数显示 "100+"。
- `rounds = prompts` 为 legacy 别名，仅因状态机与旧代码引用保留。
- 题号白名单现在有三处镜像：`lib/comments.ts`（评论）、`lib/votes.ts`（由题库派生）、`server/index.js`（`ALLOWED_ROUNDS`，评论与投票共用）；新增题号时同步（votes 前端侧随题库自动更新）。作品数据已单一来源：SQLite works 表（决策 040），`lib/works-roster.json` 是它的种子与前端兜底快照，手工加作品改 JSON 即可。
- works 表结构演进走 `server/index.js` 的 `MIGRATIONS`（`PRAGMA user_version` 驱动，启动自动补齐）；`content` 存 JSON 字符串，加展示字段优先在该 JSON 内扩展，不动表结构。首启动种子只在表空时执行，不会覆盖库内已有作品。
- 管理后台（决策 041）：同仓库双应用——`admin.html` → `src/admin.tsx`（门禁 + 布局）+ `app/admin/`（dashboard 仪表盘 / log 数据流水 / placeholder 占位页）+ `app/admin/admin.css`（朴素工作台风，与主站样式互不掺和）。会话复用主站 arena_session cookie。页面访问统计在 server/index.js 的中间件里（只记 HTML 页面，hash 路由的子页面不可见）。后台第二期：作品登记/发布开关、题目管理、收件箱文件浏览器、活动管理（占位页已就位）。
- `GET /api/votes` 返回全量流水（演示规模够用）；数据量上来后需换聚合接口，勿在现接口上静默截断——截断会让客户端 Elo 重放失真（见 `server/index.js` 注释）。
- vite dev 代理必须 `changeOrigin: false`（`vite.config.ts` 有注释）：否则服务端 sameOrigin 校验在 dev 下全部 403；生产不经 vite，不受影响。

## 品牌与 2D 仪器排版（2026-09-10）

- 空间版已整体移除（决策 027）：Three.js 场景、空间/经典切换、`app/observatory.tsx`/`home-spatial.tsx`/`archive-stage`/`spatial-motion`/`archive-audio` 均已删除，three 依赖已卸载。
- 保留部分：`app/observatory.css`（Event 页与 2D 仪器排版仍在用，含大量已无引用的历史规则，待清理）与 `app/spatial-fonts.css` + `public/fonts/`（MiSans 分包，全站页头字标使用）；`components/rolling-label.tsx`（榜单标题滚动）。
- `#formal/{promptId}` 路由进入正式测评：Arena 组件 `formal` prop → reducer 初始 mode='formal'，永不揭晓、无评论区；mode 全链路（lib/arena.ts Mode / lib/votes.ts / server VOTE_MODES）已放行 formal。

## 新过场（2026-09-11；frame 与 bands 均已接入主站，决策 032/033）

**两套均已接入生产**：档案锁定（frame）——首页主按钮（进玩法菜单 `#play`）；一体斜幕（bands）——首页→提示词库 / 偏好榜，及两页返回首页，走 `bandsNavigate`（1.25× 播放，决策 036：总长约 1120ms、盖满约 416ms）。两者均为盖满时切路由、接入侧模块级锁防重入（home.tsx 的 `frameTransitionRunning` 与 lib 内 `bandsNavRunning`）。页眉「随机入场」仍走 `wipeNavigate`。竞技场返回、特别赛页内链接等入口未接入（决策 033 边界）。视觉定稿见决策 034：网格维持 Codex 原版密度，frame 中央组件锁定框 22cqw / 字标 3.2cqw / 残影 27cqw。

- `lib/game-transitions.ts`：`createGameTransition(kind, options)`（kind 为 `frame` / `bands`；`gameTransitionTiming` 是时间轴来源）与导航封装 `bandsNavigate(hash)`。
- `app/game-transitions.css`：两套过场专用样式（纸灰绿 / 深墨 / 酸黄），生产与对照页共用的唯一来源，main.tsx 已挂载。
- `reference/game-transitions-review.html`：开发服务下打开同路径；直接导入上述模块与 `app/game-transitions.css`，支持播放、暂停/继续、重播、时间轴拖动、全屏层、速度、中段节奏、品牌文字和 reduced-motion 模拟。不是主站生产构建入口。
- `scripts/check-game-transitions.mjs`：22 项契约检查，`npm run check:game`（已并入 `check:motion`）。

### 最终视觉与节奏

- **档案锁定（frame）**：不透明纸页 420ms 上推盖满；四角方框收拢，字标从细线后滑入；整页继续向上退出 650ms。默认 hold=650ms，总长 1720ms。背景无长时间交叉渐变，中央无黑底 logo 牌。
- **斜向切片（bands，当前为一体斜幕）**：酸黄 / 纸色边缘与深墨主体嵌套在同一运动组件；斜边 -14°，同向横推。520ms 到达覆盖点，中段按 hold×0.35 计算并从 translateX(0%) 持续前移到 3%，随后 650ms 加速退出；默认总长 1397.5ms。已废弃三条独立飘带及其匀速/S 曲线方案。

### 生命周期与验证边界

控制器提供 `play / pause / seek / dispose`，播放与拖动使用同一组暂停的 WAAPI 轨道，由 rAF 统一推进；`seek` 不触发 `onCovered` 导航回调。完整覆盖时才回调，延迟帧跨过覆盖点时先钳到覆盖时刻，避免直接跳到露出阶段。结束或 dispose 清理动画与层；reduced 模式播放直接执行覆盖回调并清理。

默认层挂 body；对照页内嵌预览传 parent。接主站的调用者需接线 `onCovered` 与目标路由，并处理重复触发——模块自身**有意**不设跨实例全局锁（对照页需要多实例预览），首处接入（首页主按钮）以 home.tsx 的模块级 `frameTransitionRunning` 锁补齐；后续再接入其他入口时照此模式处理，或经用户拍板后把锁下沉进模块。

断言涵盖生命周期、覆盖回调、拖动隔离、暂停恢复、取消、reduced、不透明纸页覆盖点，以及一体幕片共享轨道和持续前移。视觉实测依赖浏览器；假 DOM 检查不证明任意屏幕比例下的像素覆盖。
