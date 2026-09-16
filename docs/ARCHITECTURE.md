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
| `app/home.tsx` 等 | 首页三版 Hero（经典 `home` / 新版 `home-next` / 对决版 `home-duel`，决策 066-069），底部切换 `aob-home-edition` |
| `app/prompt-library.tsx` | 提示词库：目录/单题档案、搜索筛选、键盘选题；library.css 供预览页与首页公共片段 |
| `app/prompt-preview.tsx` | 无可比较结果提示词的预览页 |
| `app/ranking.tsx` | 偏好榜 `#rank`：三赛道 tab、Elo 排行、模型档案卡（主题色染头部，决策 017） |
| `app/play-menu.tsx` | 玩法菜单 `#play`（仪器档案风列表）：`MODES` + dev 资格判定（028） |
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
| `lib/matchmaking.ts` | 轻量匹配（046）：声望分软性分档 + 熔断，参数集中 `MATCH_CONFIG`；`computeRatings` 全量重放 Elo 暗分 |
| `lib/ratings.ts` | 声望分数据层：拉 `/api/ratings`，未就绪按基础分兜底（=均匀随机） |
| `lib/leaderboard.ts` | 榜单聚合：Elo 重放（平局各 0.5，048）、阵容=已发布∪流水历史模型（045）、口径 `BoardScope`（026） |
| `lib/votes.ts` | 投票数据层：`ArenaVote`/`validateVote`（与服务端镜像）/流水读取（永不过滤下架题）/`pairKeyOf` 对局去重 |
| `lib/comments.ts` | 评论类型与校验（与后端一致） |
| `lib/placeholder.ts` | 开发者占位符系统：播种伪随机占位模型/结果/投票；隔离方式见文件头 |
| `lib/track.ts` | 访客统计上报（042）：页面加载 POST /api/track 一次，失败静默 |
| `lib/game-transitions.ts` + `game-transitions.css` | 过场核心 `createGameTransition`（frame/bands/convoy/deal/folio，031-034/049/052/059/065）：rAF 推进 WAAPI 轨道、盖满才回调。**不能加模块导入**（check 脚本转译为 data: URL 测试） |
| `lib/ui-transitions.ts` | `SurfaceTransition` 可打断界面过渡；`wipeNavigate` 全屏横扫换页（随机入场在用） |
| `lib/scroll-tour.ts` / `lib/arena-scroll.ts` | 长文自动滚动巡览 / 竞技场命题定位 |
| `lib/decryption.ts` | 盲测揭晓「文档解密」：遮黑条错峰退开（用户点名保留，071） |
| `lib/library-motion.ts` | 题库目录/档案错峰入场（047） |
| `lib/messages.ts` / `lib/locale.ts` | 中英 i18n（056）：中文键→英文值；语言存 `arena-language`；品牌字标不翻译（068） |
| `components/account.tsx` | 账号 Provider/登录注册 Dialog/账号按钮 |
| `components/afterparty.tsx` | 评论区：登录门槛、幂等 id、匿名观测员显示 |
| `components/vote-split.tsx` + `lib/vote-split.ts` | 选择人数反馈牌（072-074）：点击即时挂载、数据只负责填充、2 秒内收起 |
| `components/dev-panel.tsx` | 开发者面板：dev 免登录、占位符开关、清票重投 |
| `components/ui/` | 只保留实际使用的 shadcn 组件（按需 add，016） |
| `server/index.js` | Express 全家桶：静态双入口、评论/作品/题目/投票/反应/模一把/访客统计 API、`PRAGMA user_version` 迁移、`/api/admin/*` 管理组、限流分组（070）、同源校验、`TRUST_PROXY`/`APP_ORIGIN` |
| `server/auth.js` | 账号：scrypt、cookie+sessions、`/api/auth/dev` 免登录（回环/XFF 门禁，070）、`users.role` 管理员 |
| `server/works-register.js` | 作品登记公共核心（043/044）：CLI 脚本与后台收件箱共用 |
| `app/admin/` | 后台页（041-045/063）：dashboard / log / works / inbox / prompts / guess / placeholder（活动管理占位） |
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
| `POST /api/auth/register` `/login` `/logout`；`GET /api/auth/me` | 用户名 `^[a-z0-9_]{3,24}$`、密码 12–128；scrypt；登录防时序探测；注册即登录 |
| `POST /api/auth/dev` | dev 免登录（020/070）：仅回环或 `ALLOW_DEV_LOGIN=1`；带 XFF 且未设 `TRUST_PROXY` 直接拒 |
| `GET /api/comments?round=` | 按题最新 100 条，公开 |
| `POST /api/comments` | 登录 401/同源 403/JSON 415/校验 400/幂等 409 |
| `GET /api/works` `/api/prompts` | 已发布作品/题目清单，公开（040/045） |
| `GET /api/votes` | 全量投票流水（含联表快照），公开，**永不过滤**——下架题/作品的历史票保留在榜单（045⑤） |
| `POST /api/votes` | 登录/同源/校验/票面与 works 表核对（039）；对局去重 409（code:pair）、同 UUID 幂等或 409（code:id）；formal 票非 admin 403（070） |
| `POST /api/track` | 访客上报（042）：同源即可，204 静默 |
| `POST /api/reactions`；`GET /api/reactions?prompt=` | 模型反应（054）：一人一题一模型一槽覆盖；登录写、公开读 |
| `GET /api/guess/today` | 模一把当日题面（dayKey/dayNumber/attributes/models 全量公开字段），匿名，无答案信息 |
| `POST /api/guess/check` | 判定：每日题按难度池派生（060），练习局带 gameId（064）；猜中或 final 才附答案；跨零点守护（070） |
| `POST /api/guess/practice/start` | 练习开局（064）：服务端随机抽题发 gameId，内存持有，重启失效 |
| `POST /api/guess/result` | 每日题结果上报（063）：answer_id 服务端重新派生防伪造；只收每日题（064） |
| `GET /api/ratings` | 声望分（046）：全量重放 Elo（基准 1200/K=32），供匹配，非排行榜 |
| `GET/POST/PATCH/DELETE /api/admin/*` | 管理组（041-045/063）：stats、log、works（清单+PATCH 编辑/发布）、inbox（清单+register+DELETE）、prompts（清单+POST+PATCH）、guess（stats+models GET/POST 追加模型）；未登录 401、非管理员 404 |
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

检查命令：`typecheck`、`lint`、`validate:arena/scroll/placeholder/leaderboard/votes/admin/matchmaking/guess`（均自带临时 SQLite 与随机端口）、`validate-locale.mjs`；`validate:comments` 需先起服务；`check:motion` 校验全部动效不变量（或分开跑 `check:wipe/surface/game/arena-scroll`）。改动效遵循决策 029：先建/更新对照工具（`scripts/check-*.mjs` + `reference/*-review.html`）再改行为。

后台本地访问：`http://127.0.0.1:5173/admin.html`，dev 面板一键登录即管理员（042）。重复测试投票被去重挡下时用 dev 面板「清空重投」。

环境变量（均有默认值，本地开发可不设）：`PORT`/`HOST`、`DATA_DIR`（SQLite 目录）、`RATE_LIMIT_PER_MIN`、`ADMIN_OWNER`（管理员引导，已被 dev 即管理员弱化）、`APP_ORIGIN`、`TRUST_PROXY`（反代必设）、`WORKS_DIR`（作品目录，大文件不入 git）、`WORKS_INBOX_DIR`（收件箱）。

已知环境限制：AI 沙箱内 `vite build` 可能因原生二进制与子进程限制失败（spawn EPERM 等），属环境限制而非代码问题，需在本地终端复核。

## 扩充内容操作步骤

1. 新增题目：后台「题目管理」新增（编号自动，默认草稿）→ 上架；题号白名单收口到 prompts 表，无需改代码。
2. 新增作品：文件丢 `data/inbox/` → 后台「收件箱」登记（默认草稿）→ 「作品管理」发布；批量走 `npm run register:works`；多文件作品=整个文件夹（根目录 index.html）。
3. 新增模一把模型：后台「模一把」页追加（写 `data/guess-models-extra.json` 末尾，sinceDay 强制，063/070）；只能追加不能改。
4. `isDemo: true` 不计模型数、不配对，仅预览页可见。
5. 某题补齐两个不同 modelId 的结果后，`#arena/{id}` 自动从预览页变为竞技场。

## 已知不一致 / 技术备注

- 竞技场页「本场收录 N 个模型的 M 份结果」未过滤 isDemo，与题库页口径不一致；当前可进竞技场的题都没有 demo，用户不可见，未修。
- 评论列表后端 `LIMIT 100`，前端条数显示 "100+"。
- 数据单一来源：作品=works 表（roster JSON 是种子与前端兜底），题目=prompts 表（seed JSON 同理）；表结构演进走 `MIGRATIONS`（`PRAGMA user_version`），content 存 JSON 字符串、加字段不动表。
- `GET /api/votes` 返回全量流水（演示规模够用）；数据量上来后需换聚合接口，勿静默截断（会让客户端 Elo 重放失真）。
- vite dev 代理必须 `changeOrigin: false`（vite.config.ts 有注释）：否则同源校验在 dev 下全部 403。
- `app/observatory.css` 含大量已无引用的历史规则，待清理。

## 过场与首页版本（落点速查）

- 过场分工（052/059/065/078）：首页→菜单走 `frame`；首页→题库、菜单→测评走 `convoy`；首页→榜单走 `bands`（字带=声望分前二模型名）；菜单→模一把走 `deal`；模一把内部选择↔游戏走 `folio`；娱乐「下一题」走 convoy 区域过场（层挂 body、按场内 rect 定位）；页眉「随机入场」走 `wipeNavigate`。竞技场返回、特别赛页内未接入。
- 调参：`reference/game-transitions-review.html`；节奏数值以 `gameTransitionTiming` 与对照页为准，不在文档复述。
- 防重入：模块自身不设跨实例全局锁（对照页要多实例预览），接入侧用模块级锁补齐。
- 首页三版（066-069）：`app/home.tsx`（经典）/ `home-next.tsx`（新版，默认）/ `home-duel.tsx`（对决版），`aob-home-edition` 记忆；哪版定稿待用户拍板。
