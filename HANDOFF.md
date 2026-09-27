# HANDOFF.md · 当前状态

## 2026-09-27 公测修复与 UI 精简（已提交推送并部署 VPS）

- 用户授权先修重要 bug，再全面审改 UI；三项产品方案已确认实施：娱乐匿名计榜（浏览器匿名标识 + 账号/浏览器去重 + IP/浏览器限流）、登录投稿进入隔离待审区、赞踩笑改为作品级并保留旧历史。每日挑战按同一浏览器保存进度、完成后当天锁定；练习不限次。
- GitHub main 已快进到 d899e47，但线上业务代码实际对应 origin/email-auth 的 1df778e；本轮修复分支 codex/public-beta-repair 从后者创建。只读核对 VPS：app/components/lib/server/src 与最新分支一致，远端额外待办已抄录在本文末部；原文快照在 .local/repair-20260926/。
- 重要 bug：每日挑战保存猜测轨迹与完成状态，刷新/退出重进续局，多标签通过 Web Locks 串行提交和结算；八次用尽也锁定，旧版仅有结算标记仍不可重开；服务器跨日拒绝旧题提交。猜中确切多模态模型反馈变绿。移动保存改为预取 PNG 后调用原生分享，并提供真实原图链接、长按保存和失败降级，桌面保留下载。
- 产品调整：娱乐匿名票真实计榜，签名 cookie + 浏览器/账号组合去重，持久 IP/浏览器/账号限流；正式仍需管理员。登录投稿进入隔离待审区，管理员通过后转入收件箱，再人工登记发布；HTML/ZIP 作品继续用不透明源 sandbox，原件与审核记录留存。赞/踩/笑按作品 rid 归属，旧模型级记录保留；补发队列按账号隔离，异步响应不会吞掉新的取消意图。
- UI：首页品牌缩小、精简重复文案；竞技场常驻紧凑导航、提示词折叠、移除重复步骤与大段说明，作品更靠上；平局按钮加强，双继续按钮统一为浅底边框/深底荧光文字。首页、竞技场、题库、榜单、玩法和投稿入口覆盖 1440/768/390/320px；投稿表单、审核页和两种分享页补测 390px，中英首页/竞技场目检。保留既有过场和作品本体。
- 工程遗留：清掉基线 9 条 lint 错误；相机测试改用脚本生成的 fixture，不再依赖未入库的 007 文件；隔离投稿截图通过单独就绪握手等待首帧余量、字体、可见图片和已保存机位，不把超时当截图就绪。
- 验证通过：typecheck、lint、build、check:motion、check:mobile、validate-locale、check-vote-split；email 27、admin 15、votes 12、formal 6、guess 38、reactions 6、comments 4、leaderboard 12、matchmaking 11、arena 13、share 10、placeholder 10、camera 8。新增 beta-api 9 组、每日存档与评价队列检查；浏览器 beta-ui 7 组（含投稿全流程、每日多标签/跨日/完成锁定、独立分享页）、work-ready 7、formal-ui 6、admin-access 3 均通过。运行日志 `.local/repair-20260926/`；截图 `output/playwright/beta-*.png`，不入库。
- 边界如实保留：移动分享为 Edge 触屏视口和能力模拟，未做真实 iOS/Android/QQ 系统保存验收。VPS 当前两件缺缓存的 006 作品只读检查均 `captureReady=true`，无页面/网络错误；历史五件的具体身份没有记录，不能宣称已全部复测。未重生成线上缓存或巡检全部 264 件作品。
- 用户于 2026-09-27 验收后明确授权“git一下，push”；本轮已提交并推送当前修复分支 codex/public-beta-repair，署名 Atmeplz（224206292+Atmeplz@users.noreply.github.com）。随后用户要求“vps上也同步一下”，已授权生产同步。既有未跟踪作品和旧 005 证据页保持原样。
- 业务与 UI 修复提交：`da27fc0`；整轮记录见 `docs/handoff/2026-09-27-公测修复与UI精简-Atmeplz.md`，本交接索引与归档另作收尾提交。
- 提交前已 fetch：origin/main 与 origin/email-auth 已到 0119e22；相对本轮基底 1df778e 的变化仅为交接/决策文档整理和既有截图等附件，无业务代码差异。本轮修复分支保留 1df778e 基底，未合并这些额外附件。
- 本地演示预览：`http://127.0.0.1:5319/#arena/002`（自建 `.local/repair-20260926/preview-data`，仅内置样例，不是线上完整作品库）；服务用本轮最新 dist 与 server 代码运行。
- 预览批注复验：已删除整条 system-footer；题号/标题与提示词入口组/模式标签统一垂直居中，完整提示词展开改为独占下方整行。Playwright 在 959×830（用户批注视口）、1440/768/390/320px 两种语言共 10 组检查收起与展开：无横向溢出、无运行错误，行内居中偏差 < 0.01px；截图已目检。补跑 typecheck/lint/build/check:arena-scroll/diff --check 均通过。记录 `.local/repair-20260926/ui-feedback-*.txt`，截图 `output/playwright/briefing-*.png`。
- 2026-09-27 首页降重：用户认可竞技场后要求继续精简首页。去掉重复题库/榜单入口、身份说明、VS 贴片、背景大字与页脚口号/步骤；保留品牌标题、一句比较说明、开始评测/随机入场与三种作品示例。页眉响应式收紧，修复 320px 字标/标题溢出，文字示例不再裁切，网页示例标题按卡片宽度缩放。主入口仍到玩法菜单，路由过场不变。
- 首页验证：typecheck/lint/build/check:motion/validate-locale 通过；内置浏览器覆盖 1440/959/768/390/320px × 中英 × 三种示例，共 30 组无横向溢出或文字裁切。开始评测、随机入场、投稿、题库、榜单导航及首页分享弹窗已实测；控制台无错误。检查记录 `.local/repair-20260926/home-light-*.json`，最终截图 `output/playwright/home-light-final.png` / `home-light-mobile.png`。本地预览入口为 `http://127.0.0.1:5319/#home`；原预览进程退出后已用相同隔离数据目录恢复。
- VPS 已部署业务/UI 修复及部署补丁 `20892d0`：PM2 arena 在线，PID 1338799、重启计数 534（本次业务发布重启一次）。迁移 013/014 已应用，数据库版本从 012 升至 014，quick_check=ok；264 件作品、588 张票、16 条评论、56 条旧评价、24 个用户、20 条猜题结算数量不变，逐表核对旧记录 ID 均无丢失。代码与一致性数据库备份在 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-20260927T152818Z-20892d00`。
- 部署核验：1038 份源码哈希、3 个构建入口及 20 项引用资源通过；公网 8 个页面/API 状态符合预期（投稿与审核匿名请求为 401），首页 10 个资源均 200 且与服务器构建一致。线上首页精简内容、竞技场进入 voting、完整提示词展开和旧 system-footer 移除均已浏览器核验，无控制台错误，未提交线上测试投票或上传。记录 `.local/deploy-20260927/`，截图 `output/playwright/vps-home-20260927.png` / `vps-arena-20260927.png`。
- 部署脚本已排除历史误入库的 `output/outputs` 报告，敏感路径仍硬阻断；打包专项验证覆盖 7 类禁止路径。远端最新待办已核对保留；无新增依赖，SMTP/Turnstile 与生产配置沿用。上线详情见 `docs/handoff/2026-09-27-公测修复上线-Atmeplz.md`；本次收尾文档随修复分支推送并同步 VPS。

下文 2026-09-25 及以前记录、末尾“仅登记”反馈均为历史快照；涉及本轮七项反馈、lint 和相机测试的状态以上述最新结论为准。


## 接手阅读顺序

1. 本文：最新状态、运行入口、仍需处理的事项。
2. `docs/DECISIONS.md`：既有用户决定，只能由用户显式推翻；优先看末尾最新条目。
3. 按任务读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/games/guess.md`。
4. 本轮详细记录：`docs/handoff/2026-09-27-公测修复与UI精简-Atmeplz.md`，上线记录：`docs/handoff/2026-09-27-公测修复上线-Atmeplz.md`；此前部署记录见 `docs/handoff/2026-09-24-检查收尾与部署-Atmeplz.md`，旧根目录完整内容见 `docs/handoff/2026-09-24-历史交接快照-Atmeplz.md`。历史记录中的旧待办/服务方式/提交限制不可直接当现状。

## 2026-09-25 提醒字居中真因 + 快门重构：盖满才换稿/进度条/退场落成品（已 commit e171d8d 并部署）

- **「还是歪的」真因（像素级量证）**：不是旋转——全局 `.account-dialog h2 { max-width: 330px }`（为登录页长标题避印章设的）被成功页短标题继承，330px 盒靠左使「登录成功。」整体吊在卡片中轴左 73px。修法 `.account-success h2 { max-width: none; margin: 0 auto 8px }`（app/account.css）；残差 6px 是内容盒左右内边距差的一半，与 ✓/说明完全同轴。上一轮去 rotate 修的是真问题但不是用户指的这个。
- **快门重构（用户原话「不论如何 都不能看到后面作品的加载过程」）**，根因三层：
  1. `shutter-in` keyframes 自带退场（0.61s 到点自己扫走），之后 ARRIVE 还在等就绪——加载裸奔再被「正在接入试验场」盖住。已拆成 `shutter-cover`（进场钉在盖满位）+ `shutter-exit`（仅 `.shutter-exit` 类=门控真等到就绪的 ARRIVE 才播，扫开直接落成品）（app/globals.css）。
  2. 换稿时机：点「同一题库继续」只暂存新对（nextPairRef），**快门盖满（500ms）才 setPair**——原来点击瞬间换稿，进场扫的 0.45s 里新作品加载从右缘缝里漏（app/page.tsx transition effect）。
  3. 换稿提交竞态：setPair 后等 iframe src 属性真变再等就绪；就绪判定加「文档地址对上当前 src」防旧文档假就绪（帧采样抓到过 2 帧裸加载）。
- 配套：快门上加 A 红/B 蓝双侧进度条（用户指定形态，就绪即填满队色）；门控放行的 ARRIVE 走 intro 快速通道——加载过场整段跳过、「正在接入试验场」遮罩不再挂载；8s 兜底放行把卡死状态带进 intro，跳过按钮立即可见（原要再叠 8s 计时）。首次入场/兜底路径行为不变。
- 验证：临时帧采样脚本 `scripts/.tmp-verify-transition.mjs` 13/13（换对/重播全程零裸加载帧、遮罩零出现、换源在盖满后 50ms、揭幕双侧 sent；fixture 需真实延迟+探针）；旧回归 validate-work-ready 5/5（慢作品断言按新口径改为 phase-transition）；快门保持期截图人工复核全盖+双条在跑。typecheck 干净、lint 基线 9。
- 改动文件：app/account.css、app/globals.css、app/page.tsx、scripts/validate-work-ready.mjs、docs/DECISIONS.md、HANDOFF.md。**已 commit `e171d8d` 并部署 VPS**（备份 aob-deploy-20260925T142201Z-e171d8d3；线上已验：居中规则/shutter-exit/shutter-progress 三标志全在、API 200）。临时验收脚本 scripts/.tmp-verify-transition.mjs 未入库（.tmp 惯例）。待用户线上复验：成功卡标题是否居中、换对局是否一幕到底不再见加载。

## 2026-09-25 提醒文字去歪斜 + 换对局快门钉到作品就绪（已 commit 07a6a37 并部署）

- **提醒字去歪**：用户两次反馈登录成功等提醒字是歪的。根因：拍落入场动画起始帧带 rotate(1.8deg)，落定其实是正的，但前 1/3 时程已不透明仍歪着。修法：`account-page-turn` 和表单切换 `account-page` 两个 keyframes 删起始 rotate（拍落位移/缩放/回弹保留）；装饰纸堆倾斜是设计本体没动。对照页 reference/account-turn-review.html 已同步。用户第一次反馈时改了之后仍报歪——因为**修复只在本地没部署**，线上照旧（部署后需用户在线上复验一次）。
- **换对局快门钉到就绪**：用户反馈娱乐模式换对局「过渡→半加载露出→接入试验场再盖→才好」。两层修法：① 服务端吐作品文档一律注入就绪探针（server/work-bridge.js `injectWorkProbe`，load+3帧+600ms 上报 aob:work-ready，8s 兜底）——此前 data-aob-probe 只存在于测试 fixture，真实作品就绪判定落在 interactive（three.js 还在编译着色器）；② 同一题库继续的 transition 快门从固定 620ms 改为等 waitWorksLoaded（探针口径，已从 intro effect 提升为组件级共用）才 ARRIVE，620ms 降为最短节拍，8s 超时兜底放给 intro 跳过出口。
- 验证：本地真浏览器逐帧采样——同题库继续快门 1620ms 结束（两作品 1406/1461 就绪之后）、换个题库纸幕 1462ms 扫出（探针 830/913 之后），全程零裸加载零加载遮罩闪现；typecheck 干净、lint 基线 9 无新增；测试投票已清。
- 改动文件：app/account.css、reference/account-turn-review.html、server/work-bridge.js、server/index.js、app/page.tsx、docs/DECISIONS.md、HANDOFF.md。**已 commit `07a6a37` 并部署 VPS**（备份 aob-deploy-20260925T130610Z-07a6a37b；线上已验证探针注入生效、API 200、PM2 在线）。待用户在线上复验：提醒字是否已正、换对局过渡是否一幕到底。

## 2026-09-25 内测开闸前模型数据治理（五组合并 + 榜单单题规则 + 家族名两套口径；已 commit 部署）

- 分支 email-auth 最新提交 `942265c`（视角校准构建时注桥）。本轮模型治理（数据+代码）经用户授权 commit 并部署 VPS。
- **两套显示口径（用户拍板）**：对局揭晓/题库/作品管理显示每件作品的具体型号（works.model_name，已按作品 id 从合并中还原：Claude Fable 5/5.1/5.2 Max、Gemini 3.7/3.8 Flash、Muse Spark 1.2/1.3、Claude Opus 5/5.5?）；**排行榜按 modelId 合并计算显示家族名**（lib/leaderboard.ts `FAMILY_BOARD_NAMES`：Claude Fable 5.x、Claude Opus 5.x、Gemini 3.x、Muse Spark 1.x、GLM-5.3-Flash）。后台登记/模型清单对合并条目返回家族名 + 备注（server `MERGED_MODEL_META`）；登记复用家族条目时显示名取家族名。
- 合并已上线（幂等脚本 `scripts/.tmp-merge-models.mjs` + `scripts/.tmp-restore-specific-names.mjs`，works/votes/reactions 三表同改+断言；线上 264 作品/195 票守恒、旧代号零残留）：ox-alpha→**GLM-5.3-Flash**（GLM-5.3 与 GLM-5.3-Flash 是两个模型，不并）、Fable 5/5.1/5.2 Max→`claude-fable-5.x`、Opus 5/5.5?→`claude-opus-5.x`（样本不足合并）、Gemini 3.7→`gemini-3.8-flash`、Muse 1.2→`muse-spark-1.3`；reactions.mid 同步迁移（同用户双条目反应按较新合并）。**DeepSeek V4 Pro（灰测0821凌晨）保留不动**（用户明示特殊）。**Seed 2.1 Pro 显示名已改 Doubao Seed 2.1 Pro**（id 不变）。详见 `docs/DECISIONS.md` 末两条。
- **榜单规则**：已发布作品只覆盖 1 道题的模型不进榜（一次覆盖星图/折线/墨池/回声占位条目与 9 个只有鹈鹕的模型；发布第 2 道题自动回榜；纯历史阵容不受影响；占位演示模式不适用）。
- 验证：typecheck 干净、lint 基线 9 无新增；本地浏览器实测榜单家族名/隐藏规则/作品页具体型号/登记下拉家族名与备注；线上库合并与名称还原后逐条校验。线上备份：`data/comments.db.pre-merge-*.bak` 与名称快照。
- 已知边界：收件箱模型下拉只按家族名/modelId 过滤——将来登记新版本（如 Gemini 3.9）想并入家族时需在后台把作品显示名改成具体型号（PATCH 作品模型名即可）；占位条目作品仍在题库可见（只是不进榜）。

## 2026-09-25 后台收件箱改版 + 用户管理页（分支 email-auth，已 commit b10c4e3 并部署 VPS）

- 本轮（收件箱改版 + 用户管理 + 模一把记名 + 数据流水模一把页签 + 字号）已 commit `b10c4e3`，连同分支上前两个提交（21ff18e 邮箱体系、1632613 Turnstile）一起于 2026-09-25 部署上线；PM2 arena 已补 SMTP_* + TURNSTILE_* 环境变量并 pm2 save。线上验证：turnstile 下发 siteKey、8 题/236 作品/188 票/5 用户原样、迁移 012 已应用（guess_results.user_id）。部署备份 `/www/wwwroot/arenaofbias-deploy-backups/aob-deploy-20260925T073352Z-b10c4e32`。**分支 email-auth 已 push（origin/email-auth = 928db81）。**

- 收件箱改版（用户拍板：页面直传、文字作品一文件一作品、卡片式带预览）：`/api/admin/models`（模型清单）、`inbox/upload`（octet-stream 直传 8MB，零依赖）、`inbox/file`（文本预览路由）、`inbox/serve`（虚拟静态：文件夹作品的相对子资源按内部路径吐，否则多文件作品预览渲染不出画面；前端 iframe 须落到 `<name>/index.html`——文档住在无斜杠 `<name>` 上时 `./assets/...` 会把名字段顶掉）、register 扩展（.txt/.md 文字作品空行分段纯库内存储、可选 modelId 复用现有模型身份）；前端 inbox.tsx 重写（上传区+卡片+模型组合框+记住上次题目），网页预览复用竞技场 FixedHtmlWork（16:9，比例即上场比例）。
- 用户管理页（用户拍板：四个操作全要）：`/api/admin/users` 组（清单+授权撤权+重置密码一次性展示+强制下线+删除账号），app/admin/users.tsx 新页；点用户名开详情弹窗（模一把战绩+最近投票/评论，`/api/admin/users/:id/activity`）；删除账号保流水（票/评论作者变匿名）；服务端硬性禁止操作当前登录账号。**作品删除放宽（用户拍板）：零票可删**——DELETE /api/admin/works/:id 库行+磁盘文件/目录一起清（文件夹作品删整个 <id>/ 目录），有票 400 提示下架；列表每行带票数。**模一把开始记名（迁移 012，用户拍板推翻 064 匿名口径）**：登录用户上报记 user_id，游客仍匿名、历史不回溯；数据流水加「模一把」页签。后台表格/副标字号 13→14。顺手修：`.admin-password-dialog` 的 display:flex 会压掉 dialog 未打开时的 UA 隐藏（弹窗常显）——加 `:not([open]) { display:none }`。
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


## 2026-09-26 模一把补充反馈待办（仅登记，未实施）

沿用上一轮范围：仅补充 VPS 远端待办，不使用落后的本地版本覆盖远端，不实施功能或部署。

- [ ] **手机端无法下载图片（用户报告，待复现修复）**。模一把在手机端无法下载图片；具体机型、系统、浏览器及触发步骤尚未提供。后续检查结果图片生成、下载与保存链路，覆盖移动浏览器和 QQ 内置浏览器场景；记录实测环境，确保用户能够保存图片。
- [ ] **每日挑战可以重复作答，不符合每日挑战定位（用户报告，待复现修复）**。用户明确每日挑战不应能够反复重做。后续核查当日完成状态的保存、恢复与重复进入限制，区分未完成对局的继续作答和完成后的重新挑战；检查刷新、退出重进等路径是否允许重开及重复计入战绩。具体复现入口、用户识别与限制实现待核对，不擅自扩大到练习模式。

本轮只记录上述两项，尚未复现或修复；文档写入后回读核对，不运行功能测试、不重启服务。

## 2026-09-25 群内首版公测反馈待办（仅登记，未实施）

用户明确：以下五项均为待办，本轮只更新 VPS 远端待办区。本地 D:\webarenabias 已落后多个版本，后续接手以远端最新状态为准，不得用旧本地整包覆盖远端。本轮未授权功能实施、Git commit/push 或代码部署。

- [ ] **模一把：多模态栏始终为黄色（用户报告，待复现修复）**。有人发现多模态那一栏一直显示黄色，直到猜出正确模型仍不变。后续检查属性比较与反馈颜色逻辑；验收应覆盖猜中模型时该栏的正确反馈，以及未猜中时的正常反馈。
- [ ] **娱乐模式：免登录投票入榜，保留防刷**。用户提出用浏览器指纹区分用户，解除必须登录才能入榜的限制，同时仍需防止乱刷。本项仅针对娱乐模式；指纹识别、投票去重与防刷的具体方案待设计验证，不能把“有指纹”直接当作已解决防刷。
- [ ] **用户投稿：上传自测结果、压缩包暂存与审核（候选功能）**。为扩大数据来源，考虑允许用户上传自己测得的结果；需要审核流程，可预留工作区暂存用户上传的压缩包，按规范命名，后续再处理。具体命名规则、投稿信息、暂存位置与审核入库流程待确定。远端已有管理员收件箱/直传能力，后续先核对可复用部分；本轮不创建上传入口、不接入作品、不自动发布。
- [ ] **“不分伯仲”按钮不够明显（视觉反馈）**。评估加强视觉效果，或放到红蓝两个按键中间凸显；两者是候选方向，尚未选定最终布局。后续需核对桌面与手机的可见性、点击体验，并遵循项目动效/视觉验证约定。
- [ ] **赛后评价：归属逻辑别扭，考虑删改（用户报告，待核对）**。用户反馈评价跟随提示词，而不是跟随模型。后续核对实际归属与交互语义，再决定修改或删除该功能；尚未决定保留方案或删除范围，本轮不改动评价逻辑及历史数据。

记录验证：五项已写入 VPS 最新文档并回读核对，原有文档内容保留。本轮仅文档记录，不运行功能测试、不重启服务。
