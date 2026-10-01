# 架构、代码地图与本地验证

本文描述技术架构、代码地图、后端 API 面与本地运行验证。产品行为规则（路由语义、抽组规则、场内状态、账号评论语义）见 `docs/PRODUCT.md`。各文件细节以其文件头注释为准，本表只放一句话职责。

> 2026-09-29：线上动态 API 已由 `arenaofbias-server` 共享后端提供。本仓 `server/` 的 Express 邮箱实现与下文相关 API 表述是迁移前参考；当前邮箱契约、环境变量及部署顺序以共享后端的 `docs/api-contract.md` 和 `README.md` 为准。开发时可把 Vite 的 `/api` 代理指向本地共享后端。

共享正式题目由独立数据仓库的 `tasks/<id>/task.json` 登记，`arenaId` 映射稳定三位编号，`kind` 区分文字与网页。共享后端 `/api/prompts` 合并正式题与兼容历史题，前端 `lib/prompts.ts` 解析后供题库与竞技场使用；本仓内置种子只作请求失败时的回退。此登记不写社区 questions 表。

`promptVariants` 保存同一道题的长短原文，前端保留 `{id, label, prompt}` 并由 `components/prompt-variant-switch.tsx` 提供题库和待收录预览的切换按钮。没有可比较作品的题落提示词预览页。生产题库是否包含新增题，取决于后端实际消费的数据包版本，不能只据前端代码版本判断。

旧公测修复已按现行接口归并：主站首页 / 竞技场精简、每日挑战存档与跨标签同步、评价队列账号隔离、浏览器分享卡移动保存和脚本修复。共享后端仍需登录计票，兼容评价使用 `mid`；原 `/api/submissions` 和单体后端迁移没有合入当前源码。投稿入口指向 Gallery 的现行选题与提交流程，不调用旧接口。原始实现可从合并父提交 `e4c3980` 读取，完整取舍见本轮 beta-repair-merge 归档。

## 技术栈

- 前端：Vite 8 + React 19 + TypeScript，hash 路由由 `src/main.tsx` 分发；Tailwind 4（postcss）；页面样式为各页独立 CSS（`app/*.css`）。
- 当前后端：独立 `arenaofbias-server`，Node 内置模块与 SQLite（WAL）；本仓 Express 4 + better-sqlite3 是迁移前服务。
- 运行时：Node >=22.12.0（`package.json` engines）。
- 工具链：oxlint / oxfmt / tsc --noEmit。

## 代码地图

| 文件 / 目录 | 职责 |
| --- | --- |
| `src/main.tsx` | 入口与 hash 路由分发；`AccountProvider` 包裹全站；不启用 StrictMode（防入场动画 effect 开发模式重复执行）；`#arena`/`#random` 重定向随机竞技场 |
| `app/home.tsx` 等 | 首页三版 Hero（经典 `home` / 新版 `home-next` / 对决版 `home-duel`，决策 066-069）；定稿新版为默认，三版切换收进开发者面板（086） |
| `app/prompt-library.tsx` | 提示词库：目录/单题档案、搜索筛选、键盘选题；library.css 供预览页与首页公共片段 |
| `app/prompt-preview.tsx` | 无可比较结果提示词的预览页 |
| `app/ranking.tsx` | 偏好榜 `#rank`：三赛道 tab、Elo 排行、模型档案卡（主题色染头部，决策 017） |
| `app/play-menu.tsx` | 玩法菜单 `#play`（仪器档案风列表）：`MODES` + 管理员资格判定（2026-09-23） |
| `app/event.tsx` | 特别赛「鹈鹕大乱斗」独立页 `#event`（占位） |
| `app/guess.tsx` + `guess.css` | 模一把玩法页 `#guess`（057-065）：选择屏（每日+三档练习）、搜索补全（全库、不按池过滤）、七属性反馈表、揭晓条、分享、战绩；视觉维护见文件头「美化接手须知」 |
| `lib/guess-logic.ts` | 模一把判定核心（纯函数、双端同码）：数据集适配层（variants 合并组展开）/`judge()` 七属性判定/`answerForDate()` 两级派生（槽散列+组内轮转）/三档分池/`VENDOR_REGION` 厂商地区（062）。**规则只改这里**；契约见文件头 |
| `lib/guess.ts` | 模一把前端数据层：API 封装、每日对局**不落盘**（09-14 起，只存 `guess-settled:` 结算标记与 `guess-stats` 战绩）、练习局 gameId 管理 |
| `lib/guess-models.json` | 模一把数据集（102 答案槽/138 可猜名，含 21 个 variants 合并组，决策 061）：**追加新条目只放数组末尾**（答案按下标散列派生）；字段口径见 `docs/games/guess.md` |
| `app/page.tsx` | 竞技场舞台：入场序列（ARENA_TIMING 集中节拍，决策 076-077）、投票/锁定/揭晓、换组、Dialog、音效、快捷键 |
| `app/globals.css` | 竞技场全局视觉（spotlight、锁定、评论区）、`.page-wipe` 横扫过渡层 |
| `app/arena-refinement.css` | 竞技场视觉打磨层（056/071-078），在主样式后加载 |
| `lib/arena.ts` | 题库数据与核心逻辑，详见下节 |
| `lib/prompts.ts` / `prompts-seed.json` | 远端题库数据层（045）：启动拉 `/api/prompts`，失败回退内置种子；消费方以 `currentPrompts()` 为准 |
| `lib/works.ts` / `works-roster.json` | 远端作品数据层（040）：启动拉 `/api/works`，失败回退内置 roster；roster 同时是 works 表种子 |
| `lib/matchmaking.ts` | 轻量匹配（046）：声望分软性分档 + 熔断 + 冷门优先加权（109），参数集中 `MATCH_CONFIG`；`computeRatings` 全量重放 Elo 暗分 |
| `lib/ratings.ts` | 声望分数据层：拉 `/api/ratings`（含 games 出场数），未就绪按基础分/全均匀兜底（=均匀随机） |
| `lib/leaderboard.ts` | 榜单类型、标签与配色；本地 Elo/六维聚合仅供开发占位模式 |
| `lib/show1-board.ts` | 读取共享 server 的主站聚合榜单，装饰配色与文案、将画像转为 Map；真实模式不读取逐票流水 |
| `lib/votes.ts` | 投票数据层：`ArenaVote`/`validateVote`（与服务端镜像）/流水读取（永不过滤下架题）/`pairKeyOf` 对局去重 |
| `lib/comments.ts` | 评论类型与校验（与后端一致） |
| `lib/placeholder.ts` | 开发者占位符系统：播种伪随机占位模型/结果/投票；隔离方式见文件头 |
| `lib/track.ts` | 访客统计上报（042）：页面加载 POST /api/track 一次，失败静默 |
| `lib/game-transitions.ts` + `game-transitions.css` | 过场核心 `createGameTransition`（frame/bands/convoy/deal/folio/match，031-034/049/052/059/065/082）：rAF 推进 WAAPI 轨道、盖满才回调。**不能加模块导入**（check 脚本转译为 data: URL 测试） |
| `lib/ui-transitions.ts` | `SurfaceTransition` 可打断界面过渡；`wipeNavigate` 全屏横扫换页（随机入场在用） |
| `lib/scroll-tour.ts` / `lib/arena-scroll.ts` | 长文自动滚动巡览 / 竞技场命题定位 |
| `lib/decryption.ts` | 盲测揭晓「文档解密」：遮黑条错峰退开（用户点名保留，071） |
| `lib/text-swap-mask.ts` | 换题盖区外文字的纸色条先遮后揭（089）：`[data-swap]` 行级测量、`armed` 跨路由标记 |
| `lib/works-gate.ts` | 「下一题」纸幕的作品就绪门（096）：arm/release/逐侧上报/15s 兜底，跨路由模块级状态 |
| `lib/library-motion.ts` | 题库目录/档案错峰入场（047） |
| `lib/messages.ts` / `lib/locale.ts` | 中英 i18n（056）：中文键→英文值；语言存 `arena-language`；品牌字标不翻译（068） |
| `components/account.tsx` | 账号 Provider/登录注册 Dialog/账号按钮 |
| `components/afterparty.tsx` | 评论区：登录门槛、幂等 id、匿名观测员显示 |
| `components/vote-split.tsx` + `lib/vote-split.ts` | 选择人数反馈牌（072-074）：点击即时挂载、数据只负责填充、2 秒内收起 |
| `components/dev-panel.tsx` | 开发者面板：仅 kme7 可见，管理员玩法入口、首页版本切换与占位符工具；会话退出时卸载面板及动画引用 |
| `lib/home-edition.ts` | 首页版本本地偏好：`aob-home-edition` 读写 + `aob:home-edition-changed` 事件（面板写入、首页即时换版） |
| `components/ui/` | 只保留实际使用的 shadcn 组件（按需 add，016） |
| `server/index.js` | Express 全家桶：静态双入口、评论/作品/题目/投票/反应/模一把/访客统计 API、`PRAGMA user_version` 迁移、`/api/admin/*` 管理组、限流分组（070）、同源校验、`TRUST_PROXY`/`APP_ORIGIN` |
| `server/auth.js` | 账号：scrypt、cookie+sessions、`/api/auth/login` `/logout` `/me`、`/api/auth/dev` 免登录（回环/XFF 门禁，070）、`users.role`/邮箱列迁移 |
| `server/auth-util.js` | 账号公共工具：digest/normalize、密码与邮箱校验、scrypt derive（auth 与 auth-email 共用，保持单向依赖） |
| `server/mail.js` | 零依赖 SMTP 客户端（465/587、STARTTLS、AUTH PLAIN/LOGIN）+ 验证码邮件模板；`MAIL_DEV_LOG=1` 只打日志不真发 |
| `server/auth-email.js` | 邮箱账号体系（2026-09-24）：注册（必填邮箱+验证码）、`email/send`/`email/bind`、`password/reset`（重置后清全部会话）、`email_codes` 表、发码限流与冷却 |
| `server/turnstile.js` | Cloudflare Turnstile 人机验证（2026-09-24）：只守 `email/send`，零依赖 fetch 校验 siteverify；不配密钥整功能关闭 |
| `server/works-register.js` | 作品登记公共核心（043/044）：CLI 脚本与后台收件箱共用 |
| `app/admin/` | 后台页（041-045/063）：dashboard / log / works / inbox / prompts / users（用户管理）/ guess / placeholder（活动管理占位） |
| `scripts/validate-*.mjs` | 各域校验（arena/guess/placeholder/matchmaking/leaderboard/votes/comments/admin/locale）：自带临时 SQLite 与随机端口；guess 34 项 |
| `scripts/check-*.mjs` | 动效不变量断言（029）：wipe/surface/game/arena-scroll/library/vote-split，并入 `check:motion` |
| `scripts/register-works.mjs` | 作品批量登记 CLI（043） |
| `reference/` | 动效对照页（029）：各 `*-review.html`，dev server 下 `/reference/*.html` 访问 |
| `public/works/` | 内置演示样例 HTML；**新作品不走这里**（走 data/works，043） |
| `data/` `dist/` `outputs/` | 本地库 / 构建产物 / 部署归档，gitignored，勿手改 |

## lib/arena.ts 结构

- 类型：`Prompt`、`ModelResult`、`ResultContent`（四 kind 联合）、`Matchup`。
- 数据：`prompts`（内置兜底）、`modelResults`（内置兜底，即 roster JSON）。
- 函数：`resultsForPrompt`、`eligiblePairs`（同题非 demo 两两组合）、`pickMatchup`（排除上一组+随机翻转）、`randomArenaHash`（可排除当前题）。语义规则见 `docs/PRODUCT.md`。
- 状态机：`Phase = loading | intro | voting | locking | result | transition`；`Mode = blind | party | formal`（formal 永不揭晓、无评论区）；`transition` 统一承载换组/重播/切模式。
- `export const rounds = prompts`：legacy 别名，仅因旧代码引用保留。

## 迁移前后端 API 面（历史参考）

下表对应本仓 `server/`，供旧实现验证使用；当前接口、账号权限、限流和数据库迁移以共享后端 `docs/api-contract.md` 为准，不据此配置生产服务。

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/register` `/login` `/logout`；`GET /api/auth/me` | 注册必填邮箱+验证码（一邮箱一账号）；用户名 `^[a-z0-9_]{3,24}$`、密码 12–128；scrypt；登录防时序探测；注册即登录 |
| `POST /api/auth/email/send` | 发 6 位验证码：purpose=register/bind（按邮箱，占用明示 409）/reset（按账号名，不存在或未绑邮箱明示 400）；bind 须登录；同址 60 秒冷却、按 IP/目标限流；响应带打码邮箱；开启 Turnstile 时须带 `turnstileToken` |
| `GET /api/auth/turnstile` | 人机验证配置：`{siteKey}` 或未开启时 `{siteKey:null}` |
| `POST /api/auth/email/verify` | 验证码预校验（分步表单第二步门槛）：正确放行不消耗，错码计次（5 次作废） |
| `POST /api/auth/email/bind` | 登录后绑定/换绑邮箱（验码即验证）；`users.email` 唯一 |
| `POST /api/auth/password/reset` | 忘记密码：账号名+验证码+新密码；成功后删除该账号全部会话 |
| `POST /api/auth/dev` | dev 免登录（020/070）：仅回环或 `ALLOW_DEV_LOGIN=1`；带 XFF 且未设 `TRUST_PROXY` 直接拒 |
| `GET /api/comments?round=` | 按题最新 100 条，公开 |
| `POST /api/comments` | 登录 401/同源 403/JSON 415/校验 400/幂等 409 |
| `GET /api/works` `/api/prompts` | 已发布作品/题目清单，公开（040/045） |
| `GET /api/votes?scope=entertainment` / `scope=formal` | 共享后端返回库内 Show1 票，旧快照票不再合入；主站榜单已停止调用该逐票接口 |
| `GET /api/show1/leaderboard?scope=entertainment&category=all` | 服务端聚合榜单、综合统计、六维画像和题目覆盖；scope 为 entertainment/formal，category 为 all/text/web |
| `POST /api/votes` | 登录/同源/校验/票面与 works 表核对（039）；对局去重 409（code:pair）、同 UUID 幂等或 409（code:id）；formal 票非 admin 403（070） |
| `POST /api/track` | 访客上报（042）：同源即可，204 静默 |
| `POST /api/reactions`；`GET /api/reactions?prompt=` | 模型反应（054）：一人一题一模型一槽覆盖；登录写、公开读 |
| `GET /api/guess/today` | 模一把当日题面（dayKey/dayNumber/attributes/models 全量公开字段），匿名，无答案信息 |
| `POST /api/guess/check` | 判定：每日题按难度池派生（060），练习局带 gameId（064）；猜中或 final 才附答案；跨零点守护（070） |
| `POST /api/guess/practice/start` | 练习开局（064）：服务端随机抽题发 gameId，内存持有，重启失效 |
| `POST /api/guess/result` | 每日题结果上报（063）：answer_id 服务端重新派生防伪造；只收每日题（064）；迁移 012 起登录用户记 user_id（游客匿名，历史不回溯） |
| `GET /api/ratings?scope=entertainment` / `scope=formal` | 声望分（046）：按范围独立全量重放 Elo（基准 1200/K=32），供匹配，非排行榜；同一次重放顺带返回各模型出场次数 `games`（109，冷门优先加权用） |
| `GET/POST/PATCH/DELETE /api/admin/*` | 管理组（041-045/063）：stats、log（votes/comments/users/guess 四类）、works（清单带票数+PATCH 编辑/发布+DELETE 零票删除：库行与磁盘文件/目录一起清，有票 400）、models（作品体系模型清单，收件箱补全用）、users（用户管理：清单+PATCH 授权/重置密码/强制下线/DELETE/activity 详情，自操作防呆 400）、inbox（清单+register+DELETE+upload 页面直传 octet-stream 8MB+file 文本预览+serve 虚拟静态（文件夹子资源按相对路径吐，越界拒绝））、prompts（清单+POST+PATCH）、guess（stats+models GET/POST 追加模型）；未登录 401、非管理员 404 |
| `POST /api/dev/clear-my-votes` | dev 清自己的票重投（042），同 dev 门禁 |

横切行为：

- Cookie `arena_session`：httpOnly、path=`/api`、sameSite=lax、7 天；https 加 secure；sessions 表只存 token 的 SHA-256。
- 限流按路由分组（070）：social（评论/投票/反应，10/分）/ guess（判定/开局/上报，×3）/ track（×6），`RATE_LIMIT_PER_MIN` 为基础额度；auth 接口另有双维度限流；scrypt 并发上限 4。
- `/api` 全部 `Cache-Control: no-store`；请求体公开 4kb、admin 64kb。
- 同源校验 `Origin` == `APP_ORIGIN`；`TRUST_PROXY` 为可信代理 IP 列表（反代部署必设，070）。
- 静态托管：assets 长缓存、index.html no-cache、SPA 回退。

## 运行与验证

当前前端联调使用独立共享后端：在 `arenaofbias-server` 按其 README 启动服务（默认 3000），本仓执行 `npm run dev:web`（默认 5173）。Vite 用 `PORT` 选择后端端口、`VITE_PORT` 选择前端端口，代理保留原 Host。共享后端负责数据包拉取和数据库迁移，本仓不用复制数据库。

下面的 `npm run dev`、`npm start` 与旧服务专项验证用于迁移前实现；当前真实榜单需要共享后端的 `/api/show1/leaderboard`，不能把旧服务的启动成功当作当前 API 联调通过。

```powershell
npm install
npm run dev        # 开发：web 5173（HMR）+ api 3000（node --watch）
npm run build
npm start          # 生产形态：http://localhost:3000
```

检查命令：`typecheck`、`lint`、`validate:arena/scroll/placeholder/leaderboard/votes/admin/matchmaking/guess/email/comments/reactions`（均自带临时 SQLite 与随机端口；邮箱类用 `MAIL_DEV_LOG=1` 从日志捕码，不真发信）、`validate-locale.mjs`（直接 node 跑）；`check:motion` 校验全部动效不变量（或分开跑 `check:wipe/surface/game/arena-scroll`）。改动效遵循决策 029：先建/更新对照工具（`scripts/check-*.mjs` + `reference/*-review.html`）再改行为。

后台本地访问：`http://127.0.0.1:5173/admin.html`，使用管理员账号登录；本机自动验证仍可通过受回环门禁保护的 `/api/auth/dev` 登录以及 `/api/dev/clear-my-votes` 清理 dev 测试票。面板不再提供不可达的 dev 切号/清票控件。

环境变量（均有默认值，本地开发可不设）：`PORT`/`HOST`、`DATA_DIR`（SQLite 目录）、`RATE_LIMIT_PER_MIN`、`ADMIN_OWNER`（管理员引导，已被 dev 即管理员弱化）、`APP_ORIGIN`、`TRUST_PROXY`（反代必设）、`WORKS_DIR`（作品目录，大文件不入 git）、`WORKS_INBOX_DIR`（收件箱）。邮件验证码（2026-09-24）：`SMTP_HOST/PORT/USER/PASS`（个人邮箱 SMTP+授权码，如 smtp.163.com:465）+ 可选 `SMTP_FROM`/`SMTP_FROM_NAME`；`MAIL_DEV_LOG=1` 只打日志不真发（本地调试/测试，生产禁开）；节流参数 `MAIL_CODE_TTL_MS`/`MAIL_COOLDOWN_MS`/`MAIL_CODE_MAX_ATTEMPTS`/`MAIL_IP_MAX`/`MAIL_EMAIL_MAX`（默认 10 分钟有效、60 秒冷却、错 5 次作废、15 分钟每 IP 8 次/每邮箱 3 次）。不配 SMTP 时发码接口回 503。人机验证（2026-09-24）：`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`（Cloudflare Turnstile，只守发码接口；两把都不配则整功能关闭，回归测试用 `TURNSTILE_VERIFY_URL` 指向本地桩）。

已知环境限制：AI 沙箱内 `vite build` 可能因原生二进制与子进程限制失败（spawn EPERM 等），属环境限制而非代码问题，需在本地终端复核。

## 扩充内容操作步骤

1. 新增两站共用的正式题目：在独立数据仓库登记 task 与稳定 arenaId，按其收录流程发布数据包，再更新共享后端和前端消费版本。长短版放在同一道题的 promptVariants 中。历史题与社区题的管理操作以共享后端当前 API 契约为准，不再把本仓旧后台流程当成正式题登记入口。
2. 新增正式馆藏作品：按独立数据仓库 `docs/intake-workflow.md` 收录原作、截图、预览与来源，再发布数据包并更新消费版本；社区作品经共享后端投稿与审核。以下旧后台登记流程属于迁移前参考，不作为当前正式馆藏发布入口。
3. 新增模一把模型：后台「模一把」页追加（写 `data/guess-models-extra.json` 末尾，sinceDay 强制，063/070）；只能追加不能改。
4. `isDemo: true` 不计模型数、不配对，仅预览页可见。
5. 某题补齐两个不同 modelId 的结果后，`#arena/{id}` 自动从预览页变为竞技场。

## 已知不一致 / 技术备注

- 作品就绪接收在竞技场组件的 `useLayoutEffect` 中常驻，覆盖同题换组的 transition 和 intro；只接收当前 A/B iframe 的通知。舞台 `Work` 以作品 id 为 key，新作品不能复用旧窗口的就绪状态，重播原作品则不重载。先 `npm run build` 再 `npm run validate:work-ready`，使用独立浏览器与内存接口验证快加载、慢加载、单组重播、减少动态效果和超时出口；不连接真实数据库。浏览器路径可用 `THUMB_BROWSER` 指定，Windows 默认 Edge。

- 竞技场页「本场收录 N 个模型的 M 份结果」未过滤 isDemo，与题库页口径不一致；当前可进竞技场的题都没有 demo，用户不可见，未修。
- 评论列表后端 `LIMIT 100`，前端条数显示 "100+"。
- 迁移前数据关系为作品=works 表、题目=prompts 表，roster/seed JSON 作种子与前端兜底；相关 MIGRATIONS 是旧服务实现。当前正式题目来自独立数据包，社区业务数据由共享后端维护，具体 schema 与追加迁移以共享后端为准。
- 真实榜单请求 `/api/show1/leaderboard`，由共享 `arenaofbias-server` 完整聚合并缓存；本仓旧 `server/` 未接入新接口。联调与上线须使用新共享后端；接口不可用时显示加载失败，不回退下载全量票。
- vite dev 代理必须 `changeOrigin: false`（vite.config.ts 有注释）：否则同源校验在 dev 下全部 403。
- `app/observatory.css` 含大量已无引用的历史规则，待清理。

## 过场与首页版本（落点速查）

- 过场分工（052/059/065/082/084/089）：首页→菜单走 `frame`；首页→题库、桌面菜单→测评走 `convoy`；首页→榜单走 `bands`（字带=声望分前二模型名）；菜单→模一把走 `deal`；模一把内部选择↔游戏走 `folio`；娱乐「下一题」与窄屏菜单→测评走 match 双页纸幕（层挂 body、absolute 文档坐标随滚动、每帧重取新题场内 rect），盖区外 `[data-swap]` 文本行走 `TextSwapMask` 纸条先遮后揭；页眉「随机入场」走 `wipeNavigate`。竞技场返回、特别赛页内未接入。
- 调参：`reference/game-transitions-review.html`；节奏数值以 `gameTransitionTiming` 与对照页为准，不在文档复述。
- 防重入：模块自身不设跨实例全局锁（对照页要多实例预览），接入侧用模块级锁补齐。
- 首页三版（066-069/086）：`app/home.tsx`（经典）/ `home-next.tsx`（新版，定稿默认）/ `home-duel.tsx`（对决版），`aob-home-edition` 记忆；切换入口在开发者面板，不再出现在首页界面。新版采用已验收的档案 Hero，局部样式在 `app/home-hero.css`，对照原稿保留于 `reference/hero-review.*`；生产版复用真实账号与既有导航回调，不含预览工具条。卡片组平面层叠、每张卡片内部独立 preserve-3d，避免切题时相互穿插。

## 固定画布 HTML 适配（087）

- `lib/work-framing.ts`：`PROMPT_CANVASES` 按题启用（目前仅 001，1280×720），`WORK_CANVASES` 可按稳定作品 ID 配置内部尺寸例外。不要按 modelName 或 A/B 位置配置，也不要默认套给响应式网页题。
- `components/fixed-html-work.tsx/.css`：原 iframe 固定尺寸；ResizeObserver 测外层布局尺寸、contain 缩放居中，cleanup disconnect。React 仅更新外层 transform，不重载源文件；卡片与弹窗共用。作品内部滚动及布局问题仍是作品自身行为。
- `/reference/work-framing-review.html` 读取实际作品、宽度/比例测试；`node scripts/check-work-framing.mjs` 验证核心尺寸口径。旧 `scripts/frame-pelicans.mjs` 和作品内补丁仍留存，但 001 新渲染不传 `aob=prev`，不应为了适配屏幕再运行脚本改原文件。

## 逐作品校准与后台列表（088）

- 后台入口 /admin 或 /admin.html，hash #works 可直接进入作品管理。列表自动搜索（250ms 防抖/请求取消）、按题与发布状态筛选、每页 30 条；编辑标题/显示名不改变稳定 ID。
- app/admin/work-calibration.tsx 使用真实 FixedHtmlWork 预览，拖动更新归一化 offsetX/offsetY，完整画布可拖右下角调整尺寸；配置为 {width,height,zoom,offsetX,offsetY}。
- PATCH /api/admin/works/:id 接收 framing 对象或 null（移除覆盖）。server/work-framing.js 验证内部宽 320–3840、高 240–3840（整数）、zoom 0.25–4、偏移 -1–1。沿用管理员与同源保护；配置存于现有 content JSON，无数据库迁移，不写源文件。
- workCanvas 优先读取 content.framing；framedCanvas 先求 16:9 取景窗口，再 contain 内部画布并叠加缩放/偏移，展开弹窗也保持相同取景。无作品配置时沿用 087 默认。
- npm run validate:admin 在临时数据库验证权限、非法配置、公开端读取、重置和原文件不变；node scripts/check-work-framing.mjs 验证不同显示尺寸下的构图一致。
## 后台工作台布局

- src/admin.tsx 负责导航分组、当前位置和本机显示偏好（aob-admin-collapsed / aob-admin-compact）；app/admin/workspace.css 只由后台入口加载，统一现有模块布局。
- dashboard.tsx 复用 /api/admin/stats，提供刷新、加载/错误状态、工作流入口。#works?status=draft 为未发布作品入口，works.tsx 初始化读取状态；未新增服务端接口。

### match 揭幕抗阻塞

双页过场在盖满和 exitStart 均停靠，避免路由加载长任务跨过揭幕段。exitStart 后纸幕使用原生 WAAPI 播放，rAF 只观察 currentTime/更新文档锚点；完成后释放。已完成的标题/细线等轨道保持填充终态，不重播。对照页提供 1200ms 换页阻塞复现，check-game-transitions.mjs 覆盖长停顿、原生暂停/继续与结束清理。

### 「下一题」纸幕的作品就绪门（096）

`lib/works-gate.ts` 是跨路由的布防/放门标记：`gotoRandomArena` 进纸幕前 `armWorksGate()`，`match` 的 `holdGate: worksGateOpen` 让纸幕盖满后钉在 `exitStart`（`tick` 钳位 + 压 `nativeExit`，钉住态 `gtPhase` 仍 `entry`、层打 `data-gt-hold`），牌面兼任加载屏——holdnote 呼吸注记、duel 连线按 `data-gt-a/b` 逐侧填色。新竞技场 `pollWorksReady` 逐侧 `reportWorkReady`，双侧齐 `releaseWorksGate()` 放门扫出，揭幕落在就绪作品上，「正在接入试验场」整拍被纸幕吸收。放门点：双侧就绪、卡死计时器（落回 overlay+跳过兜底）、intro 清理（空格/卸载/重跑）、15s 兜底；`gotoRandomArena` 入口 `!worksGateOpen()` 防叠幕。只有 `gotoRandomArena` 布防——菜单入场、重播、正式换组不受影响。

## 分享输出（share-v2，替代 106–108 的服务端渲染）

- `components/share.tsx` + `app/share.css` 保留三个入口和弹窗交互：预览、下载 PNG、系统分享、复制链接及手动复制降级。分享链接使用根页的 `?share=`，接收者打开后由浏览器重新生成卡片；链接参数按类型重建，只含公开题目、作品、选择或竞猜记录，不含账号与令牌。
- `lib/share-client.ts` 从共享后端的公开 `/api/prompts`、`/api/works` 读取已发布题目和作品身份；竞猜答案来自结算时 `/api/guess/check` 给浏览器的公开结果。可读取的公开图片嵌入作品窗口，跨域图片受 CORS 限制；HTML/网页作品使用旧卡的 A/B 占位框。`lib/share-card.js` 沿用旧 SVG 版式、文案、换行、文本转义和 `qrcode` 二维码；浏览器将 SVG 画入 Canvas 后导出 PNG。共享后端不渲染或缓存分享图。
- `index.html` 直接声明 OG/Twitter 标签，`public/share-preview.png` 是统一的静态 1200×630 预览图；具体卡片内容仅在浏览器内生成，爬虫看到通用图。`lib/shared-duel.ts` 仍校验分享链接指定的 A/B 对局并保持顺序。
- `npm run validate:share` 验证 SVG 版式、转义、二维码、静态 OG 图及前端不调用旧分享 API；`reference/share-review.html` 使用前端生成器。上线前需分别验证浏览器生成和目标社交平台的实际抓取行为。
- `server/share*.js`、`server/fonts/`、`public/share-assets/` 与快照服务仍属于本仓库旧单体服务的遗留实现，不参与共享后端分享链路；本轮没有新增 npm 包或数据库迁移。


### 旧单体服务的作品快照与校准（108，非 share-v2 链路）
- `capture.html` / `src/work-capture.tsx` 是旧服务只读构建入口，现从公开 `/api/works` 按 id 读取作品，复用 `FixedHtmlWork` 与 `workCanvas`。1280×720 固定截图窗口，保留 framing 的内部画布、zoom、offset；非固定画布沿用预览参数 `aob=prev`，机位沿用原服务端桥。
- `server/work-thumbnails.js` 用隔离的无头 Chromium 页面等待文档、图片、字体、探针首帧与保存机位就绪，再等 2.2 秒实际渲染。限定本地服务地址，最多同时两页、有限等待队列，关闭页面和浏览器；不读取用户浏览器资料。
- `data/thumbs/<id>.png` 配套指纹 JSON（作品内容含 framing/camera、题号、渲染版本）。旧无指纹 PNG 不复用；分享时自动生成缺失/失效图，同一作品同指纹请求合并，成功后替换。截图失败返回 503，前端重试。代码升级改变截图表现时递增 fingerprint 版本；仅原文件资产改变而元数据不变时运行预生成脚本刷新。
- 生产先 `npm run build`，确保 `dist/capture.html` 存在；需要服务器安装 Chrome/Chromium（Windows 默认 Edge）。可用 `THUMB_BROWSER=/absolute/path/to/chromium` 指定可执行文件。`playwright-core` 不自带下载浏览器。服务端沙箱保持浏览器默认，不使用 `--no-sandbox`。
- `npm run thumbs:works -- --only id,id` 可离线预生成；遵循 DATA_DIR。原有无校准截图自动失效，无需手工清空 data。


### 正式测评隔离（2026-09-23）

- 作品、题库和账号共用；`votes.mode` 区分正式与娱乐。迁移 011 以 `(user_id,pair_key,(mode='formal'))` 唯一索引替代旧跨模式索引，不改历史行；服务启动不再重建旧索引。
- 共享后端 `/api/votes`、`/api/ratings`、`/api/show1/leaderboard` 的 `scope` 必填 entertainment/formal，非法或缺失为 400，未提供混合统计入口。库内票按保存时间和 ID 聚合；旧快照票已停用。清零两站投票和对局须由共享后端维护命令备份后显式执行，账号、作品和评论保留。
- `lib/ratings.ts` 的缓存与请求代次按范围独立；`currentMatchup` 接收范围，正式页面首次抽取、换组及投票后刷新均使用正式快照。榜单 `#rank` 默认娱乐，`#rank/formal` 默认正式，切换范围或赛道请求对应聚合结果；离开或切换时取消旧请求。
- `npm run validate:formal`：临时库验证迁移、双范围去重/幂等/权限、统计隔离、重启及缓存竞态。`npm run build` 后 `npm run validate:formal-ui`：独立浏览器和临时服务，真实登录投票、匿名结果、双继续、分榜及 320/390px 布局；截图写 `output/playwright/formal-*.png`。

- 管理员入口回归：先 `npm run build`，再 `node scripts/validate-admin-access.mjs`。临时库与独立浏览器验证 kme7 面板→玩法→正式测评、面板打开时退出并原页重新登录后的开合、wujisuan 无面板仍可正式评审；全程不调用 dev 登录。`--expect-bug` 用旧构建复现旧按钮死路与悬空动画引用。

## 当前主站静态发布

总域名 `https://arenaofbias.icu` 的独立总入口在 `/www/wwwroot/arenaofbias-home`；`node scripts/build-portal.mjs` 将 `portal/` 的 CSS/JS 内联为 `output/portal-dist/index.html`，保持根站只提供 `/` 的现行跳转规则。竞技场 `https://game.arenaofbias.icu` 的静态目录为 `/www/wwwroot/show1-dist`，Gallery 独立发布；共享后端的现行部署、数据库保护和回滚操作见 `arenaofbias-server/docs/deploy.md`。从已提交并推送的主站源码构建，验证静态文件 manifest 后在暂存目录切换；HTML 使用 no-cache，哈希资源保留长期缓存。旧站副本为 `show1-dist.prev`，既有上线与回滚证据见本仓 vote-release 和 shared-question-release 归档。

文档同步不要求重新部署。两个前端独立构建发布；不要运行下面已退役的 PM2 整站脚本，也不要用主站 checkout 覆盖共享后端或业务数据库。

## 迁移前 VPS 部署（2026-09-24，已退役）

- 当前生产站点为 `https://arenaofbias.icu`；PM2 进程 `arena`，目录 `/www/wwwroot/arenaofbias`，监听 `127.0.0.1:3000`。旧 systemd `arenaofbias` 已停用，不再使用旧整站 tar 命令。
- `npm run deploy:vps -- --check` 只读核对远端文件，输出变更清单并保存本机 `.local/deploy-vps/plan.json`；审阅清单后运行 `npm run deploy:vps`。必须先提交本轮代码；脚本只打包当前 Git HEAD，排除本地数据、凭据、未跟踪作品与旧截图目录。不会清理远端额外文件。
- 本机需要 Python 3 与 Paramiko（常规安装或既有 `.local/vps-python`）。默认读取 `.local/vps-credentials.txt`，也支持 `VPS_HOST` / `VPS_USER` / `VPS_PORT` 配合 SSH 密钥或 agent；主机公钥必须已在 `~/.ssh/known_hosts`。覆盖连接目标时不会把原保存的密码发给其他目标。凭据不打印、不进入上传包。
- 远端先在独立暂存目录构建，复核计划中的文件哈希未变化，再备份将覆盖的源码、构建文件与 SQLite 在线一致性快照；保留旧哈希 assets，最后替换三个入口 HTML。后端或共享 lib 内容变化才重启 PM2；仅换行差异、前端及文档同步不重启。
- 部署后逐文件核对源码哈希、三个入口及其引用资源响应，并检查 PM2。失败恢复本轮覆盖的代码与构建文件，绝不自动回退真库。备份在 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-时间-提交号/`。
- 脚本复用已安装的 `node_modules`；发现 package.json 的 dependencies/devDependencies 改变即中止，依赖升级须另行安排安装。不会自动删除远端多余源码；涉及删除/重命名时需单独核对旧文件引用。这是现有站点的同步流程，不是空机初始化脚本。
