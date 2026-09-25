# HANDOFF.md · 当前状态

## 接手阅读顺序

1. 本文：最新状态、运行入口、仍需处理的事项。
2. `docs/DECISIONS.md`：既有用户决定，只能由用户显式推翻；优先看末尾最新条目。
3. 按任务读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/games/guess.md`。
4. 本轮详细记录：`docs/handoff/2026-09-24-检查收尾与部署-Atmeplz.md`；旧根目录完整内容：`docs/handoff/2026-09-24-历史交接快照-Atmeplz.md`。历史记录中的旧待办/服务方式/提交限制不可直接当现状。

## 2026-09-25 后台收件箱改版 + 用户管理页（分支 email-auth，已 commit b10c4e3 并部署 VPS）

- 本轮（收件箱改版 + 用户管理 + 模一把记名 + 数据流水模一把页签 + 字号）已 commit `b10c4e3`，连同分支上前两个提交（21ff18e 邮箱体系、1632613 Turnstile）一起于 2026-09-25 部署上线；PM2 arena 已补 SMTP_* + TURNSTILE_* 环境变量并 pm2 save。线上验证：turnstile 下发 siteKey、8 题/236 作品/188 票/5 用户原样、迁移 012 已应用（guess_results.user_id）。部署备份 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-20260925T073352Z-b10c4e32`。**分支 email-auth 已 push（origin/email-auth = 928db81）。**

- 收件箱改版（用户拍板：页面直传、文字作品一文件一作品、卡片式带预览）：`/api/admin/models`（模型清单）、`inbox/upload`（octet-stream 直传 8MB，零依赖）、`inbox/file`（文本预览路由）、`inbox/serve`（虚拟静态：文件夹作品的相对子资源按内部路径吐，否则多文件作品预览渲染不出画面；前端 iframe 须落到 `<name>/index.html`——文档住在无斜杠 `<name>` 上时 `./assets/...` 会把名字段顶掉）、register 扩展（.txt/.md 文字作品空行分段纯库内存储、可选 modelId 复用现有模型身份）；前端 inbox.tsx 重写（上传区+卡片+模型组合框+记住上次题目），网页预览复用竞技场 FixedHtmlWork（16:9，比例即上场比例）。
- 用户管理页（用户拍板：四个操作全要）：`/api/admin/users` 组（清单+授权撤权+重置密码一次性展示+强制下线+删除账号），app/admin/users.tsx 新页；点用户名开详情弹窗（模一把战绩+最近投票/评论，`/api/admin/users/:id/activity`）；删除账号保流水（票/评论作者变匿名）；服务端硬性禁止操作当前登录账号。**模一把开始记名（迁移 012，用户拍板推翻 064 匿名口径）**：登录用户上报记 user_id，游客仍匿名、历史不回溯；数据流水加「模一把」页签。后台表格/副标字号 13→14。顺手修：`.admin-password-dialog` 的 display:flex 会压掉 dialog 未打开时的 UA 隐藏（弹窗常显）——加 `:not([open]) { display:none }`。
- 顺手修复：本机 Windows `fs.rmSync` 对非 ASCII 路径静默失败/崩进程（纯中文名直接 exit 127 崩掉）——收件箱删除统一走 `removeEntry`（unlink/rmdir 递归），旧「删除中文名条目」路径同样中招已一并修。
- 测试：`validate:admin` 14 项全绿（收件箱改版/用户管理/模一把记名与用户动态三专项）；typecheck/lint 无新增错误；三页均浏览器实测截图目检（测试数据已清）。`vite.config.ts` 现支持 `VITE_PORT`/`PORT` 平移端口（本地另一项目占了 5173/3000，当前 dev 在 5273/3210）。
- 待办：用户验收 → commit。email-auth 分支上叠着未推送工作（邮箱体系 21ff18e + 人机验证 1632613 + 本轮两块）。

## 2026-09-24 邮箱账号体系（分支 email-auth；主体 21ff18e + 人机验证 1632613 均已 commit，未 push）

- 用户拍板：个人邮箱 SMTP 发信（163，授权码在 `.local/smtp-credentials.txt`，发件地址 kme7kme7@163.com）；注册必填邮箱+验证码。已实现：注册/绑定/换绑/忘记密码全流程、零依赖 SMTP 客户端（`server/mail.js`，不引 nodemailer 以免动 VPS node_modules 安装流程）、`server/auth-email.js` + `server/auth-util.js`（从 auth.js 抽公共工具）。
- 安全口径：6 位码 10 分钟有效一次性、错 5 次作废、60 秒冷却、按 IP/邮箱 DB 限流、reset 不泄露邮箱占用、重置密码后清全部会话、库里只存哈希。`MAIL_DEV_LOG=1` 打日志不真发（测试用，生产禁开）。
- 前端：账号弹窗新增注册验证码字段、忘记密码模式、会员视图邮箱行（打码显示）+绑定/换绑模式；新文案中英双语已入 `lib/messages.ts`。
- 人机验证层（已 commit 1632613，Cloudflare Turnstile，见决策末条）：只守发验证码接口，`server/turnstile.js` + 账号弹窗 widget；不配 `TURNSTILE_*` 密钥整功能关闭。密钥获取与 PM2 配置指引在 `.local/turnstile-keys.txt`。真机全链已实测（widget → Cloudflare 校验 → 163 真发信）。
- 测试：`npm run validate:email` 27 项全过（含第二阶段本地桩密封验证人机门禁）；7 个用到注册的既有脚本全部改为 MAIL_DEV_LOG 捕码注册，`validate:comments` 顺势从打本机 3000 改为自起临时库。已实测绿：email(27)/admin(11)/votes(12)/reactions(6)/formal(6)/comments(4)/admin-access(3)/formal-ui(6)/guess(38)/arena/matchmaking(11)/share(10)/check:mobile/typecheck/build/validate-locale。未跑：`validate:camera`（本机缺 007 fixture，既有原因）。
- 待办：VPS 部署时把 `TURNSTILE_*`（连同 SMTP_*）配进 PM2 并重启；合并 email-auth 到 main 与 push 均待用户发话。deploy:vps 流程不变（无新依赖）。

## 2026-09-24 收尾状态

- 用户明确授权检查、整理、提交推送 Git 与同步 VPS；本轮业务与部署代码提交 `5253de4`，起点 `e93fc09`。负责人 GitHub 身份为 Atmeplz，署名邮箱 `224206292+Atmeplz@users.noreply.github.com`。本轮收工还包含交接归档提交。
- 双继续按钮、005 就绪通知丢失修复、正式测评与娱乐数据隔离、管理员入口修复全部已完成并在 VPS 运行。没有新发现的业务阻塞需要在本次同步前继续实施。
- 正式评审需 `role=admin`，全程匿名、不揭晓、不评论、不分享、无模型反应或选择人数反馈。正式与娱乐共用作品/题库/账号，但投票去重、声望分、出场数、榜单和六维画像分开。管理员账号直接从玩法菜单进入；开发者面板仍仅 kme7 可见。
- 双继续按钮顺序仍为左“换个题库继续”、右“同一题库继续”；正式两条路径保持正式模式。就绪监听贯穿换组全过程，不以超时强放行为替代。
- 线上共有 8 题、236 作品，其中 008 已有 60 件文字作品，旧“待导入”已关闭。迁移版本 11；核查时有 188 张娱乐 blind 票、0 张正式票、5 评论、30 反应。数字是核查快照，后续自然变化正常。

## 生产运行与同步

- 站点：`https://arenaofbias.icu`；目录 `/www/wwwroot/arenaofbias`。
- 服务：PM2 `arena`，监听 `127.0.0.1:3000`，`APP_ORIGIN=https://arenaofbias.icu`；旧 systemd `arenaofbias` 已停用。不要恢复旧整站 tar + systemctl 部署。
- `npm run deploy:vps -- --check` 只读检查并保存计划，审阅后 `npm run deploy:vps`。必须先 commit；脚本只上传 Git HEAD，排除凭据、本地数据和未跟踪作品；暂存构建、复核远端哈希、备份后替换入口，保留旧 assets。详见 ARCHITECTURE 的 VPS 部署小节。
- 本机 VPS 登录信息已存在 `.local/vps-credentials.txt`，管理员凭据在 `.local/admin-wujisuan.txt`，均忽略；此机没有 `id_ed25519`，使用保存的密码经 SSH 主机公钥校验连接。不得输出凭据或传入源码包。
- 已完成代码部署备份：`/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-20260924T062541Z-5253de4c/`，含覆盖源码、构建文件与 SQLite 一致性备份；本次无需重启，PID 1073082 / restart 526 保持不变。后续文档归档同步另生成按时间/提交号命名的备份。
- 数据保护：188 票、236 作品、8 题、5 评论、30 反应部署前后逐行摘要一致；172 件 HTML 作品入口文件全部存在。不要把备份数据库直接覆盖线上新数据。

## 本轮验证

- 通过：typecheck、build；formal(6)、votes(12)、leaderboard(12)、matchmaking(11)、admin(11)、arena(13)、reactions(6)、guess(38)、share(10)、placeholder(10)、scroll(5)；check:motion、check:mobile、validate-locale、check-vote-split、diff --check。
- 浏览器通过：work-ready(5)、formal-ui、admin-access；临时库中验证投票/隔离/权限/重登录和 320/390px 布局，截图已目检。公网 wujisuan 直接进入 `#formal/008` 到 voting，零 pageerror、零 dev 请求、零投票 POST；测试会话退出。
- 部署通过：985 份源码哈希、三个入口及其引用资源共 20 次响应核验；8 个公网页面/API 请求均 200。Python 语法、shell 语法、上传包排除规则、Git archive 的 Linux LF 验证通过。首次暂存执行被 Windows CRLF 拦下，尚未改线上；修复导出参数后成功。
- 未全绿：全量 lint 在两个原有脚本中报 6 错；定向 lint 另有 account 的 EffectSetState、dev-panel 的 prefer-tag-over-role 两项既有错误。未顺手修改。
- 未完成：validate:camera 因本机缺少 `data/works/007/007-muse-spark-1.3-18356-2` fixture 而无法运行。未跑独立 comments 套件、真机和全部作品视觉/性能巡检；本轮未改相应业务，评论链路由 admin 回归覆盖部分行为。

## 真正剩余事项与范围

- 工程维护：修复上述 lint 遗留；让相机校验不再依赖未入库的本机作品。它们均为既有问题，本次未扩范围实施。
- 模一把防剧透仍待产品方案：前端可推导每日答案，`final:true` 与分享卡也能取答案，单拆前端模块不能解决；分享导出带答案是用户既有要求，不得擅自撤销。
- 008 背景/提示词仍是用户允许的占位稿，待用户补写。难度精调与存疑模型字段查证也是后续内容工作。
- 历史记录中的 5 件 006 分享快照超时本轮未重测，不据此宣称已解决。可安排单独复核。
- 鹈鹕竞赛场/多人玩法等仍在构思，IDEAS 不是实施清单。沿用原作鹈鹕、保留丑/抽象/不像鹈鹕的表达，不自动美化或实现新玩法。

## 本机遗留文件

- 他人未跟踪 `public/works/005/`、`006/`、`007/` 与 `public/works/works_2026-09-11,a-k.zip` 原样保留，未提交、未删除、未部署。
- `data/`、`dist/`、`output/`、`outputs/`、`.local/` 为本机数据/生成物/运维记录，不入库；本轮临时审计在 `.local/closeout-20260924/`，浏览器截图在 `output/playwright/`。
- 旧 005 卡死浏览器标签页曾被用户要求保留证据；本轮没有触碰。不能因修复已上线就擅自刷新该旧页面。
