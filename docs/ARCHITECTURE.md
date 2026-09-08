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
| `src/main.tsx` | 入口与 hash 路由分发；`AccountProvider` 包裹全站；统一样式导入顺序；不启用 StrictMode（文件内注释：避免入场动画 effect 在开发模式重复执行）；`#arena` / `#random` 重定向到随机竞技场 |
| `app/home.tsx` + `home.css` | 首页 Hero、三类型预览切换、随机入场转场 |
| `app/prompt-library.tsx` + `library.css` | 提示词库：搜索、类型筛选、每题模型数/结果数（过滤 isDemo）、入口 |
| `app/prompt-preview.tsx` | 无可比较结果提示词的预览页：提示词全文 + isDemo HTML 样例 iframe（sandbox） |
| `app/page.tsx` | 竞技场舞台：入场动画序列、投票/锁定/揭晓、换组、展开 Dialog、音效（WebAudio 振荡器）、键盘快捷键；`Work` 按 `content.kind` 四分支渲染（image / text / web / html）；`WebWork` 为 003 的硬编码 React 演示模板（template a/b） |
| `app/globals.css` | 竞技场全局视觉（spotlight、锁定、评论区等） |
| `app/account.css` | 登录/注册 Dialog 与账号按钮样式 |
| `lib/arena.ts` | 全部题库数据与核心逻辑，详见下节 |
| `lib/comments.ts` | 评论类型与 `validateComment` 字段校验（UUID、题号白名单、side、1–280 字），与后端规则保持一致 |
| `lib/scroll-tour.ts` | 长文作品按阅读速度自动滚动（smoothstep 缓动、可 Abort、后台标签不跳帧） |
| `lib/utils.ts` | `cn()`（clsx + tailwind-merge） |
| `components/account.tsx` | `AccountProvider` / `useAccount` / 登录注册 Dialog / `AccountButton`；窗口聚焦自动刷新会话 |
| `components/afterparty.tsx` | 评论区：登录门槛、401 刷新会话并弹登录框、幂等 id、匿名观测员显示、刷新重试 |
| `components/ui/` | 只保留实际使用的 button、dialog、tabs、textarea 四个组件（2026-09-09 瘦身清掉其余 56 个未使用组件）；新增组件用 `npx shadcn@latest add <名>` 按需引入，CLI 不入依赖；`app/globals.css` 顶部内联了原 `shadcn/tailwind.css` 中用到的 data-* 状态变体 |
| `server/index.js` | Express：静态托管 dist/、评论 GET/POST、内存滑动窗口限流、同源校验、`comments.user_id` 启动时自动 ALTER 迁移、`TRUST_PROXY` / `APP_ORIGIN` |
| `server/auth.js` | 账号：注册/登录/登出/`/api/auth/me`；scrypt（N=32768, r=8, p=1）；cookie 与 sessions 表；`auth_limits` 双维度限流；scrypt 并发上限 4 |
| `scripts/validate-arena.mjs` | 状态机 + 题库数据校验（transpile lib/arena.ts 后断言，11 项） |
| `scripts/validate-scroll-tour.mjs` | 滚动巡览校验（mock rAF，5 项） |
| `scripts/validate-comments.mjs` | 评论接口集成检查，需先启动后端；写本地 data 库并自清理 |
| `public/works/` | HTML 作品文件（当前 `pelican-cycle.html`），由 kind:'html' 结果以 sandbox iframe 引用 |
| `public/art/` | webp 素材（lunar、signal-a/b，首页预览与 WebWork 背景） |
| `data/` | SQLite 本地库（comments.db），gitignored，勿手改 |
| `dist/` | `vite build` 产物，gitignored |
| `outputs/` | 历史部署 tar.gz 归档，gitignored |
| `docs/` | 文档体系，见 `AGENTS.md` 文档地图 |

## lib/arena.ts 结构

- 类型：`Prompt`、`ModelResult`（id / promptId / modelId / modelName / title / isDemo? / content）、`ResultContent`（四 kind 联合）、`Matchup = [ModelResult, ModelResult]`。
- 数据：`prompts`（7 题）、`modelResults`（5 条：001 样例 + 002/003 各两条占位结果）、`stories`（002 两篇硬编码文字）。
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
| `GET /api/comments?round=xxx` | 按题取最新 100 条，联表 users 返回 username；无需登录 |
| `POST /api/comments` | 需登录（401）、同源（403）、JSON（415）、校验（400）、幂等插入（id 冲突或内容不符 409） |

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

检查命令：`npm run typecheck`、`npm run lint`、`npm run validate:arena`、`npm run validate:scroll`；`npm run validate:comments` 需先 `npm start`（或 dev:server），操作本地 data 库并自清理。

环境变量（均有默认值，本地开发可不设）：

| 变量 | 作用 |
| --- | --- |
| `PORT` / `HOST` | 监听端口（默认 3000）/ 地址（默认 0.0.0.0） |
| `DATA_DIR` | SQLite 文件目录（默认 `<项目根>/data`） |
| `RATE_LIMIT_PER_MIN` | 评论每 IP 每分钟条数（默认 10） |
| `APP_ORIGIN` | 站点完整来源（如 `https://域名`），用于同源校验与 secure cookie |
| `TRUST_PROXY` | 逗号分隔的可信代理 IP（如 nginx 同机部署时 `127.0.0.1`） |

已知环境限制：AI 沙箱内 `vite build` 可能因原生二进制加载与子进程限制失败（`spawn EPERM`、oxide / lightningcss 的 .node 文件无法加载），属环境限制而非代码问题，需在本地终端复核。

## 扩充内容操作步骤

1. `lib/arena.ts` 的 `prompts` 追加提示词：三位数字 id、`kind`（image / text / web）、文案字段。
2. `modelResults` 追加结果：结果 id 全库唯一、promptId 指向已存在的题、modelId 稳定（同一模型跨题复用同一 modelId）、content.kind 与作品形态一致。
3. 同步两处评论题号白名单：`lib/comments.ts` 的 `validateComment` 与 `server/index.js` 的 `ALLOWED_ROUNDS`。
4. HTML 作品：文件放 `public/works/`，结果用 `content: { kind: 'html', src: '/works/xxx.html' }` 引用（sandbox iframe 预览）。
5. `isDemo: true` 的结果不计模型数、不参与配对与随机竞技场，仅预览页可见（语义见 `docs/PRODUCT.md` 内容真实性分级）。
6. 无需修改抽组逻辑；某题补齐两个不同 modelId 的结果后，`#arena/{id}` 地址自动从预览页变为竞技场（路由按 eligiblePairs 判定）。

## 已知不一致 / 技术备注

- 竞技场页"本场收录 N 个模型的 M 份结果"（`app/page.tsx`）统计未过滤 isDemo，与提示词库页口径不一致；当前可进竞技场的题都没有 demo 结果，用户不可见，未修。
- 评论列表后端 `LIMIT 100`，前端条数显示 "100+"。
- `rounds = prompts` 为 legacy 别名，仅因状态机与旧代码引用保留。
- 投票不写入任何存储（无对应 API），选择只存在于前端状态（见 `docs/PRODUCT.md` 场内状态一节）。
