# 架构、代码地图与本地验证

本文描述技术架构、代码地图、后端 API 面与本地运行验证。产品行为规则（路由语义、抽组规则、场内状态、账号评论语义）见 `docs/PRODUCT.md`。各文件细节以其文件头注释为准，本表只放一句话职责。

## 技术栈

- 前端：Vite 8 + React 19 + TypeScript，hash 路由由 `src/main.tsx` 分发；Tailwind 4（postcss）；页面样式为各页独立 CSS（`app/*.css`）。
- 后端：Express 4 + better-sqlite3（WAL），无外部数据库服务。
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
| `lib/leaderboard.ts` | 榜单聚合：Elo 重放（平局各 0.5，048）、阵容=已发布∪流水历史模型（045）、口径 `BoardScope`（026）；六维画像 `computeRadarProfiles`，权重来源=流水快照→题库→均分（091/093） |
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

## 后端 API 面

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
| `GET /api/votes?scope=entertainment` / `scope=formal` | 对应范围的全量投票流水（含联表快照 promptKind/promptWeights/双方显示名），公开，**不按上架状态过滤**——下架题/作品的历史票保留在榜单、按原权重重放（045⑤/093） |
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

1. 新增题目：后台「题目管理」新增（编号自动，默认草稿）→ 上架；题号白名单收口到 prompts 表，无需改代码。
2. 新增作品：后台「收件箱」页直接拖拽上传 .html/.txt/.md，或手动丢 `data/inbox/` → 登记（默认草稿；文字作品一文件一作品、空行分段、纯库内存储）→ 「作品管理」发布；批量走 `npm run register:works`；多文件作品=整个文件夹（根目录 index.html）。模型名输入框自动补全现有模型，选中即复用其 modelId 与规范显示名，无匹配则登记时新建。注意：本机 Windows 上 `fs.rmSync` 对非 ASCII 路径会静默失败/崩进程（2026-09-25 实测），删收件箱条目统一走 server 里的 `removeEntry`（unlink/rmdir）。
3. 新增模一把模型：后台「模一把」页追加（写 `data/guess-models-extra.json` 末尾，sinceDay 强制，063/070）；只能追加不能改。
4. `isDemo: true` 不计模型数、不配对，仅预览页可见。
5. 某题补齐两个不同 modelId 的结果后，`#arena/{id}` 自动从预览页变为竞技场。

## 已知不一致 / 技术备注

- 作品就绪接收在竞技场组件的 `useLayoutEffect` 中常驻，覆盖同题换组的 transition 和 intro；只接收当前 A/B iframe 的通知。舞台 `Work` 以作品 id 为 key，新作品不能复用旧窗口的就绪状态，重播原作品则不重载。先 `npm run build` 再 `npm run validate:work-ready`，使用独立浏览器与内存接口验证快加载、慢加载、单组重播、减少动态效果和超时出口；不连接真实数据库。浏览器路径可用 `THUMB_BROWSER` 指定，Windows 默认 Edge。

- 竞技场页「本场收录 N 个模型的 M 份结果」未过滤 isDemo，与题库页口径不一致；当前可进竞技场的题都没有 demo，用户不可见，未修。
- 评论列表后端 `LIMIT 100`，前端条数显示 "100+"。
- 数据单一来源：作品=works 表（roster JSON 是种子与前端兜底），题目=prompts 表（seed JSON 同理）；表结构演进走 `MIGRATIONS`（`PRAGMA user_version`），content 存 JSON 字符串、加字段不动表。
- `GET /api/votes` 返回全量流水（演示规模够用）；数据量上来后需换聚合接口，勿静默截断（会让客户端 Elo 重放失真）。
- vite dev 代理必须 `changeOrigin: false`（vite.config.ts 有注释）：否则同源校验在 dev 下全部 403。
- `app/observatory.css` 含大量已无引用的历史规则，待清理。

## 过场与首页版本（落点速查）

- 过场分工（052/059/065/082/084/089）：首页→菜单走 `frame`；首页→题库、桌面菜单→测评走 `convoy`；首页→榜单走 `bands`（字带=声望分前二模型名）；菜单→模一把走 `deal`；模一把内部选择↔游戏走 `folio`；娱乐「下一题」与窄屏菜单→测评走 match 双页纸幕（层挂 body、absolute 文档坐标随滚动、每帧重取新题场内 rect），盖区外 `[data-swap]` 文本行走 `TextSwapMask` 纸条先遮后揭；页眉「随机入场」走 `wipeNavigate`。竞技场返回、特别赛页内未接入。
- 调参：`reference/game-transitions-review.html`；节奏数值以 `gameTransitionTiming` 与对照页为准，不在文档复述。
- 防重入：模块自身不设跨实例全局锁（对照页要多实例预览），接入侧用模块级锁补齐。
- 首页三版（066-069/086）：`app/home.tsx`（经典）/ `home-next.tsx`（新版，定稿默认）/ `home-duel.tsx`（对决版），`aob-home-edition` 记忆；切换入口在开发者面板，不再出现在首页界面。

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

## 分享输出（106–108）

- `components/share.tsx` + `app/share.css`：结果分享弹窗、全站底部分享、图片请求取消/110s 超时（含首次作品冷启动）/重试、PNG blob 下载与系统分享、剪贴板手动复制降级；关闭释放 object URL，快捷键不会穿透打开的 Dialog。
- `server/share.js`：GET `/api/share` 返回 canonical/image/title，GET `/share` 返回无需 JS 的独立 HTML，GET `/share/card.png` 和 `/share/og.png` 输出 PNG。对决只读取已发布题与同题不同模型作品，保留传入 A/B 顺序；不读写账户或投票。guess 只接受日期、胜负、1–8 行七格 h/n/m/u，不接收调用方指定的答案，服务端复用已加载额外模型的每日答案派生器生成真实答案；明确为个人分享而非服务端认证成绩。
- `server/share-card.js`：共享 SVG 版式、文本转义/换行/完整模型名自适应、二维码。`server/share-worker.js` 使用 resvg 在独立 Worker 栅格化，串行队列至多 12 个待执行、48 张/24MiB 内存缓存、15s 渲染超时；请求先校验发布状态，再查图片缓存。未落盘图片或新增数据库表。
- `server/fonts/NotoSansSC.ttf` 是随仓库部署的 OFL 中文字体（约 10 MB），确保 Linux 不依赖系统字体；许可证及来源见同目录 NOTICE.md/OFL.txt。新增运行依赖 `@resvg/resvg-js`、`qrcode`。
- `lib/shared-duel.ts` 解析分享页 CTA 的 `?duel=[promptId,aId,bId]`。路由等待远端清单后校验并传 Arena initialPair，失效时显示不可用，不偷偷重抽；按普通娱乐流程选择计票，完全独立于后台测试对局。
- 生产根 HTML 的 `<!-- social-meta -->` 在 Express 响应时补全绝对 OG/Twitter 标签；Vite 开发入口有对应 transform，`/share` 前缀代理至 API（含 `/share-assets`）。`public/share-assets/` 承载分享页静态样式与交互。协议依据：https://ogp.me/ 。
- **部署**：安装新增依赖，连同 `server/fonts/`、`public/share-assets/`、`server/share*.js` 部署，设置 `APP_ORIGIN=https://实际域名`；反代必须把 `/share`、`/share/*.png` 交给 Express，并让根 HTML 经过 Express（若根由 nginx 静态直出，动态 OG 不会注入）。原 `/api`、`/works` 反代规则保留。站点与图片需公网匿名可访问。本地无法验证微信/QQ/X 平台抓取和缓存行为；未接微信 JS-SDK，不能保证微信生成自定义卡片。
- `npm run validate:share`：内存 SQLite + 临时 HTTP 端口验证发布边界、字段转义、实际 PNG 尺寸、附件下载、日期/反馈格校验、下架后缓存拒绝等 10 组检查。`reference/share-review.html` 直连真实渲染器，对照 A/B/平局、模一把成功/失败、全站邀请与两种图片比例，不写真实投票。`reference/guess-review-stage.ts` 的隔离结算现在使用当天真实日期，便于验证分享链路。


### 作品快照与校准（108）
- `capture.html` / `src/work-capture.tsx` 是只读构建入口，通过 `/api/share-work/:id` 获取已发布作品，直接复用 `FixedHtmlWork` 与 `workCanvas`。1280×720 固定截图窗口，保留 framing 的内部画布、zoom、offset；非固定画布沿用预览参数 `aob=prev`，机位沿用原服务端桥。
- `server/work-thumbnails.js` 用隔离的无头 Chromium 页面等待文档、图片、字体、探针首帧与保存机位就绪，再等 2.2 秒实际渲染。限定本地服务地址，最多同时两页、有限等待队列，关闭页面和浏览器；不读取用户浏览器资料。
- `data/thumbs/<id>.png` 配套指纹 JSON（作品内容含 framing/camera、题号、渲染版本）。旧无指纹 PNG 不复用；分享时自动生成缺失/失效图，同一作品同指纹请求合并，成功后替换。截图失败返回 503，前端重试。代码升级改变截图表现时递增 fingerprint 版本；仅原文件资产改变而元数据不变时运行预生成脚本刷新。
- 生产先 `npm run build`，确保 `dist/capture.html` 存在；需要服务器安装 Chrome/Chromium（Windows 默认 Edge）。可用 `THUMB_BROWSER=/absolute/path/to/chromium` 指定可执行文件。`playwright-core` 不自带下载浏览器。服务端沙箱保持浏览器默认，不使用 `--no-sandbox`。
- `npm run thumbs:works -- --only id,id` 可离线预生成；遵循 DATA_DIR。原有无校准截图自动失效，无需手工清空 data。


### 正式测评隔离（2026-09-23）

- 作品、题库和账号共用；`votes.mode` 区分正式与娱乐。迁移 011 以 `(user_id,pair_key,(mode='formal'))` 唯一索引替代旧跨模式索引，不改历史行；服务启动不再重建旧索引。
- `/api/votes`、`/api/ratings` 的 `scope` 默认 `entertainment`，另可选 `formal`，非法值 400；各范围完整重放历史，未提供混合统计入口。后台管理总览/流水仍可查看两类记录。
- `lib/ratings.ts` 的缓存与请求代次按范围独立；`currentMatchup` 接收范围，正式页面首次抽取、换组及投票后刷新均使用正式快照。榜单 `#rank` 默认娱乐，`#rank/formal` 默认正式，切换范围重读流水。
- `npm run validate:formal`：临时库验证迁移、双范围去重/幂等/权限、统计隔离、重启及缓存竞态。`npm run build` 后 `npm run validate:formal-ui`：独立浏览器和临时服务，真实登录投票、匿名结果、双继续、分榜及 320/390px 布局；截图写 `output/playwright/formal-*.png`。

- 管理员入口回归：先 `npm run build`，再 `node scripts/validate-admin-access.mjs`。临时库与独立浏览器验证 kme7 面板→玩法→正式测评、面板打开时退出并原页重新登录后的开合、wujisuan 无面板仍可正式评审；全程不调用 dev 登录。`--expect-bug` 用旧构建复现旧按钮死路与悬空动画引用。

## VPS 部署（2026-09-24）

- 当前生产站点为 `https://arenaofbias.icu`；PM2 进程 `arena`，目录 `/www/wwwroot/arenaofbias`，监听 `127.0.0.1:3000`。旧 systemd `arenaofbias` 已停用，不再使用旧整站 tar 命令。
- `npm run deploy:vps -- --check` 只读核对远端文件，输出变更清单并保存本机 `.local/deploy-vps/plan.json`；审阅清单后运行 `npm run deploy:vps`。必须先提交本轮代码；脚本只打包当前 Git HEAD，排除本地数据、凭据、未跟踪作品与旧截图目录。不会清理远端额外文件。
- 本机需要 Python 3 与 Paramiko（常规安装或既有 `.local/vps-python`）。默认读取 `.local/vps-credentials.txt`，也支持 `VPS_HOST` / `VPS_USER` / `VPS_PORT` 配合 SSH 密钥或 agent；主机公钥必须已在 `~/.ssh/known_hosts`。覆盖连接目标时不会把原保存的密码发给其他目标。凭据不打印、不进入上传包。
- 远端先在独立暂存目录构建，复核计划中的文件哈希未变化，再备份将覆盖的源码、构建文件与 SQLite 在线一致性快照；保留旧哈希 assets，最后替换三个入口 HTML。后端或共享 lib 内容变化才重启 PM2；仅换行差异、前端及文档同步不重启。
- 部署后逐文件核对源码哈希、三个入口及其引用资源响应，并检查 PM2。失败恢复本轮覆盖的代码与构建文件，绝不自动回退真库。备份在 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-时间-提交号/`。
- 脚本复用已安装的 `node_modules`；发现 package.json 的 dependencies/devDependencies 改变即中止，依赖升级须另行安排安装。不会自动删除远端多余源码；涉及删除/重命名时需单独核对旧文件引用。这是现有站点的同步流程，不是空机初始化脚本。
