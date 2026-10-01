# HANDOFF.md · 当前状态

## 2026-10-01 · 上线收口提交与 VPS 发布已获授权（进行中）

- 用户明确要求「commit并且push，把这一部分更新到vps」。再次 fetch 后仍以 `f304d26` 为最新主线基线；推送目标为本仓 `origin` 的当前 `codex/paper-ink-theme` 分支，署名核实为 GitHub `Atmeplz` / `224206292+Atmeplz@users.noreply.github.com`。
- 发布只覆盖竞技场 `/www/wwwroot/show1-dist`。已只读核对现行 Nginx：根域独立总入口、game 竞技场、Gallery 独立站；共享后端版本仍为 `2448803`。从提交源码隔离构建，排除他人未跟踪作品，完整哈希校验后保留原目录切换；不运行已退役的 PM2 整站脚本。
- 本地功能验证见下节；本次干净发布包构建、远端清单和线上验收结果将在完成后归档。当前尚未切换生产目录。

## 2026-10-01 · 上线收口已本地完成（未提交、未部署）

- 用户在计划后明确「执行」。实施前再次 fetch，`HEAD = origin/main = f304d26`，没有新增远端提交。只改封面映射、版本按钮、首页弹窗挂载和主题默认逻辑；现有总入口 / 竞技场 80% 缩放与过场保持原实现，未据未回答的首页范围问题改动路由缩放。
- `src/main.tsx` 已移除 BetaNotice 导入与挂载。无保存偏好、非法值或存储不可用时，首帧启动脚本与 `lib/theme.ts` 均默认 paper；手选墨色继续持久化，主动跟随系统保存 `system`，清除偏好回浅色。共用长短按钮改为 surface-inset 底 / acid 字，题库与待收录预览同步。
- 17 个新题封面已由内置 image_gen 独立生成，存入 `public/art/prompt-cover-009.webp` 等（009–014、016、018–027），均 2:1、总计 4,756,442 字节。FFmpeg 仅作 quality 88 WebP 转码；001–008 原封面保持，未配置题仍兜底。提示词与原图文件名见 `docs/artwork/2026-10-01-prompt-covers.md`，摘要见 ARTWORK。
- 验证：typecheck、lint、build、check:theme、validate:theme、`validate-library-pages.mjs`、git diff --check 全部通过。题库回归纸/墨 × 1440/390 四组逐题验证 17 图解码、2:1、大小图映射一致，以及分页/搜索/键盘、014/016 题库与预览长短切换、选中色与展览馆入口一致、无内测弹窗；零 pageerror。主题覆盖深色系统首次浅色、手选与显式系统刷新、跨标签、禁用存储。旧性能检查仍观测到 6× CPU 长帧，未改动画，不据通过宣称低端恒定帧率。
- 17 图总览和真实公开题目快照的纸/墨桌面/手机截图已目检，证据 `output/release-readiness-20261001/`。本地预览 `http://127.0.0.1:5294/#prompts`，封面总览 `/review-covers`；临时服务 `.local/release-readiness-20261001/preview.mjs` 使用公开题目快照，作品/账号为空的隔离数据，不代表真实后端联调。未执行线上登录/投票/投稿或部署。源码、图片均未 commit / push；未写归档。
- 原有未跟踪 public/works 目录及 ZIP 未动。当前 `dist` 是工作区本地验证构建，不作为可直接上传的发布包；后续发布应从已核对的源码与本轮资源单独构建，排除他人未跟踪作品，沿用 game 静态目录与现行总入口拓扑。

## 2026-10-01 · 上线前收口计划（本轮仅核查与计划）

- 用户追加截图要求：移除内测弹窗、默认浅色、除主页面外 80% 缩放；强调不要大改，尽快筹备上线。再次 fetch 后发现上游新增 `f2cae06` / `f304d26` 两个提交，已将当前分支从 `3d0102d` 快进至 `f304d26`。同步前仅暂存本会话的两份文档，恢复时 DECISIONS 追加位置冲突已保留双方条目解决；原有未跟踪作品不动。
- 最新远端已实现总入口跨站过场、竞技场全站 CSS zoom=.8 与页脚 GitHub。当前根域为独立左右分屏总入口，竞技场为 `game.arenaofbias.icu`；公网只读核实两入口 200、game 已有 entry-boot，默认主题仍跟随系统。不能再按根域直接托管竞技场的旧拓扑发布。
- 最小实施顺序：① 移除 `src/main.tsx` 的 BetaNotice 导入与挂载，验证新访客不再弹；② `index.html` 首帧与 `lib/theme.ts` 统一无偏好时默认 paper，计划保留显式手选与跟随系统选项，并更新相关已有断言；③ 仅改共用长短原文按钮的选中配色，检查题库/预览页纸墨状态；④ 补齐 17 题封面并接入同源大小图映射，保留现有 001–008 封面；⑤ 复用已有缩放，只按确认后的首页范围做必要调整。暗色不做整体重设计，验收若出现本轮涉及的明显不可读或失效问题，逐点修复。
- 缩放范围尚待用户回答已提出的澄清：排除的是独立总入口，还是竞技场 `#home`。前者与远端现有实现一致；后者才需按路由限定缩放并复验切页遮罩与高度。确定前不改缩放，也不扩到 Gallery。
- 发布前验证计划：typecheck、lint、build、主题现有检查；桌面/手机核对无内测弹窗、默认浅色及手选持久化、17 图加载与缩略图裁切、两题长短切换；如缩放发生调整，加做首页往返、过场盖满、作品窗口/弹窗/页脚无溢出。保持现有后端、数据包与过场实现，先给本地验收结果再进入发布步骤。
- 本轮实跑 typecheck、check:theme 通过；只读 game API 再核实 25 题、17 个占位封面、014/016 两题含长短版本。未运行 build/lint/浏览器或生产写操作（本轮尚未实施），仅更新交接与决策；未生成图片、commit、push 或部署。

## 本轮补充：竞技场页脚 GitHub（2026-10-01，已上线，未 commit/push）

- 用户要求线上竞技场底部增加仓库入口，共用 `components/legal-footer.tsx` 新增「GitHub ↗」，新标签前往 `https://github.com/kme7kme7-prog/arenaofbias`；沿用纸/墨配色与手机换行。
- typecheck、lint、build 通过；本地 Edge 纸/墨×1440/390 的首页、菜单、题库、榜单链接与无溢出检查通过，首页实际点击验证新标签目的地址（GitHub 响应使用测试桩）。
- 发布 `github-footer-preview-20261001T074422Z`，仅更新 game 静态目录；811 文件、5 变化、0 删除，保留历史哈希资源与入场协议。原目录为 `/www/wwwroot/show1-dist.prev-github-footer-preview-20261001T074422Z`，清单在 `/root/github-footer-preview-20261001T074422Z`；总入口、Gallery、后端和数据未改。
- 公网 Edge 纸/墨×1440/390 验证真实页脚 href/新标签属性、80% 比例、入口就绪退场、无横向溢出与页面异常；截图在忽略目录 `output/github-footer-release`。沿用用户先上线检查授权，未 commit/push。

## 本轮补充：过场先上线供用户检查（2026-10-01，未 commit/push）

- 用户明确提供正式 Gallery 源码 `wsnxxxs/ArenaGalleri`，确认协作者权限，要求「先别 commit，先上线，我先检查」。此授权覆盖本轮三个入口的静态预览发布，不覆盖共享后端、业务数据或上游其他功能发布。
- 核查线上 backend 2448803 与 API/.server-version 一致，已定位到上游 main 中完整 2448803e93104eb22f0eb2474dd04514f03f4c7e；根站已经改为 /www/wwwroot/arenaofbias-home，game 指向 show1-dist，Gallery 指向 gallery。未沿用旧文档的根站路由或重启服务。
- 总入口 Nginx 只在 `/` 提供 HTML，其他路径重定向 game；新增 scripts/build-portal.mjs 将过场 CSS/JS 内联进单文件，再发布，保持现行跳转和 Nginx 配置。
- Gallery checkout 确认来源为用户指定仓库；fetch 后上游 main=4e5ee04，含多项其他未上线功能，本轮不捎带发布。使用当前线上功能基线（本地 61587f6 的 site/build 工具与线上 4717910 一致）归档，加本轮 app.js/index.html/entry-boot.js 工作区补丁，在服务器独立目录消费已发布的固定作品包。预览 buildInfo.frontendCommit 标记为 portal-preview-20261001T073255Z，不伪装为已提交源码 SHA。
- 暂存构建：Gallery syntax 42/0、test 14/14、assemble 121 件/56 个 site 文件、CI intake 0 错/4 个既有模型包大小提示。逐项确认 data.json 除 buildInfo 外与当前线上相同，未换作品包或写数据库。第一次暂存遇到 Python tar filter 兼容差异；调整受限路径提取后，Node cpSync 又不接受数据目录符号链接，改为独立暂存普通复制并重新验证，均发生在正式切换前。
- 本轮线上发布 ID portal-preview-20261001T073255Z。三个目录完整 SHA-256/集合校验后先切 game/Gallery，再启用根站；game 808 文件（8 变化）、Gallery 1556（4 变化）、portal 1（1 变化），删除 0，保留旧哈希 assets。原目录分别保存在 `/www/wwwroot/show1-dist.prev-portal-preview-20261001T073255Z`、`gallery.prev-portal-preview-20261001T073255Z`、`arenaofbias-home.prev-portal-preview-20261001T073255Z`；审计/manifest/恢复脚本在 `/root/portal-preview-20261001T073255Z`，本地包和证据在忽略目录 output/portal-release-preview。
- 内联入口再次通过隔离跨站 12 成功/10 失败检查与 lint。发布后真实无头 Edge：两目标×1440/390 共 4 组到达盖满→就绪→退场、无横向溢出/页面异常/HTTP 错误；桌面实际从总入口点击，手机直接访问入口标记。竞技场桌面刻意延迟真实首屏图请求 1.6s 验证保持遮罩。线上截图目检通过；这里只检查入场与首页，未执行注册、投稿、盲评或投票。
- 公网根站内联动画、两个子站带版本门控响应正确，线上 zoom=0.8；API 仍为 2448803，数据包/121 件作品保持。本轮没有 commit 或 push；两仓工作区补丁与文档保留，供用户检查后决定。

## 本轮：总入口跨站过场与 80% 默认比例（2026-10-01，本地，未提交/部署）

- `portal/` 为本轮新增的总入口静态源码，以当日公网 HTML 为基线，保留文案与布局。两侧文字淡出，所选色块 650ms 铺满后才跳转子站 `?entry=portal`；浏览器返回恢复可点击状态，修饰键和无 JS 原生外链保留。该目录单独发布到总域名，不混入 game dist。
- 两站 HTML 的 head 同色伪元素保护首帧；共用 classic `entry-boot.js` 门控（本仓 public 源与 Gallery site 镜像完全一致）等数据/渲染、字体、可见首屏图片解码与两帧布局后，650ms 横向揭幕。加载错误或 25s 超时显示重试/返回入口，失败锁定，迟到资源不揭幕；成功清理 query，不影响原 hash 和其他参数。HTML 完全不可达仍是浏览器网络错误页。
- Show1 `lib/portal-entry.ts` 仅入口到达等待作品与题库真实读取完成，builtin 回退视为失败；Gallery 初次 `await route()` 后接入相同门控，数据 catch 同时转失败。未改 API、真实作品、登录或已有站内动效时间轴。
- 按用户确认，`app/site-scale.css` 整个竞技场页面 CSS zoom=.8；满屏页面补偿 viewport 单位，菜单与首页页脚仍到底。并非浏览器 zoom 设置，用户若此前手动调过 80%，需调回浏览器 100% 避免双重缩放。
- 本仓 typecheck、lint、build、check:game、check:theme、check-portal-entry 通过。隔离 Edge 三独立 origin 的真实源页面：两个目标×1440/390/2048×正常/减少动态效果共 12 组，慢首屏图片 hold→解码就绪→揭幕→返回通过；数据/图片/主模块/样式失败及加速超时共 10 组、失败锁定和重试通过，正常组零 pageerror、无遮罩空隙/横向溢出。直接访问墨色不加遮罩，80% 菜单页脚到底。截图在忽略目录 output/portal-entry，桌面/手机首页及失败态目检通过。最初测试误将 HTML 根路径响应为二进制下载，修正测试 MIME 后复验通过。
- 现有 validate-route-transitions 的纸/墨×桌面/手机×正常/减少动态效果 8 组通过，验证了 80% 下站内过场盖满与清理。validate-work-sizing 的普通 HTML、固定画布、内置网页两侧共 30 个视口案例通过；原断言在 80% 下遇到 iframe clientHeight 与 innerHeight 相差 1 CSS 像素的取整，现严格校验 canvas 匹配内层 viewport、外层尺寸允许该 1px 取整，灰边几何断言保持，网页 footer 几何转回布局坐标比较。
- Gallery 本轮 check（42 文件）与 14/14 test 通过；此 checkout 无 datapack.json 与 .datapack，npm build 和 CI intake 因缺少数据配置/three.module.js 无法完成。浏览器 Gallery 用 source + 合成档案/图片，不冒充正式作品包验收。本轮仅公网读取总入口 HTML 基线，不改线上站点；未 commit、push、部署。

更新于 2026-10-01。本文件只保留接手状态；每轮过程和当时的验证结论见 [docs/handoff/](docs/handoff/)。历史中的“未提交 / 待上线”不代表当前待办。

## 2026-10-01 · 新题封面与版本按钮配色：接手核查

- 用户本轮要求先梳理任务、务必拉取最新仓库。已先读交接并检查工作区，再执行 fetch 与 `git pull --ff-only origin main`；当前分支 `codex/paper-ink-theme` 从 `09387a9` 无冲突快进 20 个提交至 `3d0102dd1ab1dd4346380c75dbb7028e9d7fe62a`，与本次拉取的 `origin/main` 一致。原有未跟踪 `public/works/005/`、`006/`、`007/` 和 ZIP 保留。
- 截图所指待办已对照最新源码及正式站只读 `GET /api/prompts`：当前 25 题中，001–008 已有专用封面；009–014、016、018–027 共 17 题使用图集末格的纸张堆占位。`app/prompt-library.tsx` 的 `coverStyle` 同时控制右侧封面及左侧缩略图，后续补图需一起接入。015/017 不在当前公开清单，长短版不拆题。
- 配色待办定位到 `components/prompt-variant-switch.css`：选中按钮目前为 accent 底、on-accent 字；截图意图是参照 `.archive-enter` 的深底、强调色文字。该组件同时用于题库与待收录预览，后续应遵循既有纸面黄绿 / 墨色暖橙令牌及键盘选中语义。当前未改样式或交互。
- 本轮范围为同步与梳理，未生成图片或实施功能，未 commit / push / 部署。核对了仓库职责、封面映射、共用组件及正式题目清单；未启动应用或运行构建、类型检查及浏览器测试。主站前端即可承接上述两项待办，正式题目与作品仍由共享后端和独立数据包提供。

## 验证码垃圾邮件提示（2026-10-01，仅提交与推送）

- 用户授权提交两个前端的现有提示修改并推送。`components/account.tsx` 的 `sendCode` 为注册、账号绑定和找回密码追加「没收到请检查垃圾邮件箱。」；`lib/messages.ts` 补齐英文翻译，找回密码原提示也通过 `t` 翻译。
- 本轮重跑 typecheck、lint、build 均通过；未做浏览器发码效果、真实 SMTP / Turnstile 或生产交互验证，本轮仅提交现有文案，未部署。
- 本仓分别推送 origin/main 与 fork/main；Gallery 在独立仓库提交。归档：[email-spam-hint](docs/handoff/2026-10-01-email-spam-hint-wsnxxxs.md)。

## 联系邮箱修改（2026-10-01，仅提交与推送）

- 用户授权提交现有修改并推送；`lib/legal.ts` 的 CONTACT 改为 `arenagallari@outlook.com`。
- typecheck、lint 通过；本轮未构建、未做浏览器验证（仅邮箱字符串修改），未部署、未修改 Gallery 仓库。
- 归档：[contact-email](docs/handoff/2026-10-01-contact-email-wsnxxxs.md)。

## 四仓整理（2026-10-01，仅推送，不部署）

- 用户授权整理四仓、合并完成分支、提交和推送，并清理无用的独立工作树。本轮不部署、不修改生产数据或已发布静态目录；此前轮次的部署授权不适用于本轮。
- 主站保留 `f1a7d0e` 的注册邮箱和旧账号计票适配，`codex/shared-question-docs` 已全部进入主线，无需重复合并。维护基线为 `main`，同步 `origin/main` 与 `fork/main`；旧文档工作树在确认推送后清理。
- 本轮复跑 typecheck、lint、build、`validate-email-gating.mjs`、`validate-reaction-queue.mjs` 均通过。没有改动功能代码，没有重复浏览器或真实邮件验证；两站与共享后端的邮箱新流程仍需后续配套部署才在现网生效。
- 当前整理记录见 [repository-housekeeping](docs/handoff/2026-10-01-repository-housekeeping-wsnxxxs.md)。下面各轮“未推送”描述的是当时状态，以本节及本轮归档为准。

## 本轮：注册验证邮箱与旧账号计票资格（2026-10-01，已本地提交，未推送、未部署）

- 注册表单必填邮箱与验证码；匿名发码 purpose=register，沿用已有 Turnstile 发码门禁，注册提交只带账号、密码、邮箱与验证码。旧账号通过 `/api/auth/me` 的 email 判断绑定状态，仍可登录与游玩。
- Show1 有效未绑定投票的 200 `{counted:false,reason:'unbound'}` 显示未计入与绑定入口，不显示成功或刷新配对评分。未绑定点击表态不改本地计数/队列；403 email_required 打开绑定界面、恢复服务端计数并丢弃已拒绝的待同步项。评论区继续隐藏。
- 隐私正文和 PRODUCT 同步；DECISIONS 追加用户本轮对旧自愿绑定决定的变更。依赖共享后端注册与资格门禁改动，不能独立视为现网已生效。
- 验证：typecheck、lint、build 通过；`node scripts/validate-email-gating.mjs` 和既有 `validate-reaction-queue.mjs` 通过。真实 Chromium + 本地 API 桩的 390px 注册发码/提交通过，未携带注册 Turnstile token，无 pageerror/横向溢出；截图目检通过，位于忽略目录 output/playwright。未做真实 SMTP/Cloudflare、生产写操作或两站部署；共享后端真实联调由后端本轮记录说明。
- 归档：[email-registration-gating](docs/handoff/2026-10-01-email-registration-gating-wsnxxxs.md)。
## 本地待发布：深色模式可读性（2026-10-01）

- 用户反馈深色首页「开始评测」几乎融入背景，其他元素也不够清楚。调整 `app/theme-tokens.css` 的深色文字与边框配色，以及 `app/theme.css` 的深色主按钮、示例/账号选中态和题库/榜单选中标记。用户随后否定暖橙整块填充，现改为墨色面、亮边线、压印与错位硬阴影，橙色用于文字与选中标记；浅色配色和既有动效时间轴保持原样。
- 按用户要求，从历史提交 `613f912` 恢复新版首页左侧主操作下方的 `next-discover`（题库/榜单两项、图标、说明、响应式样式），移除页眉重复的两项链接，保留投稿入口。只恢复该区，不恢复其余旧首页装饰和说明。入口位置与深色材质决定已追加至 DECISIONS；PRODUCT 同步入口位置。
- 本轮 `check:theme`（含主题动效约束）、typecheck、lint、build 通过。本地 Vite 5187：Tabbit 核对实际控件颜色；Tabbit 截图超时，改用无头 Edge 完成截图与目检。首页纸/墨 1440px、390px，深色登录弹窗、玩法菜单、题库、榜单失败态均已检查；首页窄屏及上述桌面页无横向溢出，最终验证无 pageerror，浅色 token 块与 HEAD 逐字一致。证据在忽略目录 `output/theme-readability/`。验收脚本首次因初始化脚本访问沙盒 iframe 的 localStorage 报错，补上顶层窗口限制后复验通过。
- 本轮未启动共享后端，题库使用内置回退数据，榜单为 API 不可用状态；未验证真实榜单数据、真实对局、登录提交或生产页面。未 commit、push、部署；原有 `portable-design-system.zip` 改动保留未动。
- 入口复原后重新通过主题检查、typecheck、lint、build；纸/墨桌面及 390px 首页已目检，断言两个链接位于主操作下面且页眉不重复，并实际点击验证题库/榜单跳转。最终截图更新于上述证据目录。

## 本地待发布：过场装饰脱离遮罩修复（2026-10-01）

- 用户指出首页主入口边框在遮罩进入前出现、离开后仍悬空，偏好榜过场也异常。实际逐帧确认 `gt-material-corners` 与 `gt-material-bands` 原为固定过场层的子元素，未归入移动纸面；现将两者挂到对应 plate 内，并为 plate 增加 overflow 裁切。文字仍独立静止，盖满换路由、退出前隐藏文案及帧时门控保持原样。
- 修改前先补 `scripts/check-game-transitions.mjs` 的装饰归属断言，原实现明确失败；修正后纸/墨六种过场不变量通过。对照页 `reference/game-transitions-review.html` 同步逐帧检查说明。
- 本地无头 Edge：纸/墨、1440px/390px 的 frame/bands 各检查 5 个时点（共 40 个），端点纸面与装饰均离开视口，文字仅在盖满段可见；16 张入/出截图在忽略目录 `output/motion-intake/`，纸色桌面入/出已目检。纸/墨真实点击主入口和榜单共 4 段完整播放记录，均经过盖满换页并完成过场清理，无 pageerror。未启动共享后端，不据此宣称真实对局或榜单数据验收。
- 主题约束、typecheck、lint、build、git diff --check 通过；未 commit、push、部署。此前首页与主题改动、原有 ZIP 修改均保留。

## 本地待发布：竞技场 HTML 窗口底部灰条修复（2026-10-01）

- 用户反馈双方作品底部出现旧版没有的灰条。历史提交 `da27fc0` 将普通作品窗口改为响应高度（最高 620px），而 `app/library.css` 的普通 HTML iframe 仍固定 560px；浏览器 fixture 在 2048×1200 复现两侧底部各 60px 灰色底板。窄屏则会反向裁掉过高的 iframe。
- `app/arena-refinement.css` 仅为竞技场 `work-inner` 直接子级的普通 HTML iframe 增加 block 与 height:100%，使作品视口随窗口同步；固定画布组件、题库预览与放大弹窗未改。
- 新增 `scripts/validate-work-sizing.mjs`：构建前旧版用 --expect-bug 复现，修复构建后纸/墨、普通/固定画布、4 个连续 resize 尺寸共 16 组（每组两侧）通过。普通 iframe 与内置自适应 canvas 尺寸一致、底部间隙为零；固定画布保持 1280×720 原生尺寸与 16:9 展示。无 pageerror，纸色桌面前后截图已目检，证据在忽略目录 `output/work-sizing/`。
- build、lint、typecheck、git diff --check 通过。验证使用隔离内存作品，不连接真实后端或验证全部正式原作；未 commit、push、部署。此前所有改动与原有 ZIP 保留。

## 当前工程与发布状态

- 2026-10-01 主站页脚补全：按用户给定拼写将 CONTACT 改为 arenagallari@outlook.com，条款及隐私中联系方式随常量同步，更新日期为 2026-10-01。LegalFooter 版权说明后直接展示邮箱和既有「闽ICP备2026019671号-2」链接（备案仍按 arenaofbias.icu 正式域名显示），移出导航区重复备案链接，窄屏允许长邮箱换行。新版和对决版首页此前漏接共用页脚，本次补齐。
- typecheck、lint、check:theme、最终 build 通过；隔离无头 Edge 将本地构建映射到正式 host，纸/墨×1440/390 共 4 组检查首页/菜单/题库/榜单邮箱与备案链接、条款/隐私邮箱、无横向溢出及零 pageerror。截图已目检；首次验收暴露新版首页缺页脚，补齐并重建后复验通过。没有请求生产页面或执行任何生产写入；未提交、推送、部署。

- 2026-10-01 用户要求暂锁鹈鹕大乱斗：玩法菜单该行改为无链接、无点击处理、不可聚焦的禁用展示，状态与锁标记写「暂未完成」，补英文。其他玩法入口保持；#event 占位页保留。typecheck、lint、git diff --check 通过；本轮未跑构建和浏览器验证。未提交、推送、部署。

- 2026-10-01 深色「同一题库继续」可读性：app/theme.css 曾将深底按钮及箭头覆盖为 on-accent 暗色，导致与背景融合。现仅深色此按钮改用 acid 亮字/箭头、surface-raised 底和 control-line 边框，保留底部强调线；浅色与按钮逻辑不改。
- check:theme、build 通过；无头 Edge 隔离竞技场纸/墨×1440/390 共 4 组，正常/悬停的文字与箭头对比度均 ≥4.5:1，无 pageerror；深色截图已目检，证据 output/continue-contrast。未连接真实后端或进行投票；未提交、推送、部署。

- 2026-10-01 展览馆跨站入口：lib/gallery-links.ts 集中正式 Gallery 首页、#/arena 盲测、#/questions 题库地址。首页三个版本加入小型「展览馆 ↗」入口；正式测评菜单改为普通外链、所有访客可点击，行内及菜单下方说明跳转展览馆。提示词档案右下按钮统一外链展览馆题库并改文案。既有正式测评深链和服务端权限未改，娱乐等其他菜单入口保持。
- 从 Gallery 现行前端路由及公网 data.json 核对地址；web open 无法访问，PowerShell 公网 GET 可用。validate-library-pages 扩展三个实际外链点击、跳转提示及窄屏溢出，纸/墨×1440/390 四组通过；外站导航使用隔离页面拦截，未启动或投票真实盲测。typecheck、lint、build 通过；DECISIONS 与 PRODUCT 同步。未提交、推送、部署。

- 2026-10-01 玩法菜单页脚与题库目录分页：截图为 #play，内容区缺 flex:1 导致法律页脚横线停在中部。app/home.css 仅给 play-classic-main 增加 flex 与宽度，使内容不足一屏时页脚位于底部，长内容自然滚动。
- PromptLibrary 左侧每页 8 题，页码与前后页控件沿用档案纸面样式；页码由当前选择派生，右侧前后题及方向键跨页同步目录，键盘焦点在换页后保持到选中题。搜索/分类覆盖全部并从第一页开始，空结果与单页隐藏分页。新增中文/英文标签。
- validate-library-pages 用 25 题隔离 fixture 验证纸/墨×1440/390 共 4 组：页脚到底、末页不足 8 条、搜索/分类重置、右侧跨页与键盘焦点、无横向溢出及零 pageerror；截图已目检。测试首次使用错误 #library 路由超时，修正为 #prompts 后全组通过。typecheck、lint、build、check:theme 通过，未连接正式后端；未提交、推送、部署。

- 2026-10-01 恢复模一把历史入场：用户指出入场变了，定位到主题提交 613f912 把旧密牌改成通用双叶。仅取其父版本 lib/game-transitions.ts 的 deal 分支恢复叠牌飞入、问号密牌、七条线索和双半展开，720ms 盖满、650ms 停留、650ms 展开保持历史节奏；沿用当前主题 token 与防卡顿/减少动态效果引擎。榜单与返回首页 push 未改。
- check:game 增加历史构图、七线索及盖满/展开时点约束；对照页描述同步。新增 validate-guess-entry：纸/墨×1440/390×常规/减少动态效果 8 组实际菜单点击，盖满切页、清理及零 pageerror 通过，桌面及窄屏截图目检。API 为隔离空题 fixture，未连接真实后端；首次 fixture 缺 models 字段导致页面异常，补齐契约后全组复验通过。check:game、check:theme、typecheck、lint、build 通过。未提交、推送、部署。

- 2026-10-01 追加返回方向纠正：上一轮仅将榜单入场换为 push，榜单返回仍留 bands，菜单/竞技场返回仍为 frame。用户指出旧过场仍出现后，现 homeNavigate 统一反向 push（从右盖满、向左退出），榜单 header 直接使用 homeNavigate；历史 bandsNavigate('#home') 调用也转该入口，防止遗漏复用点。纸/墨均横轴，盖满换页、锁与减少动态效果保持。
- check:game 的首页返回断言改为单一反向 push 轨道；validate-route-transitions 补实际「进入榜单→返回首页」往返，并断言菜单、竞技场、榜单三类返回全部没有旧切片/大字。对照页支持 push 正反向，DECISIONS 追加用户更正。未提交、推送、部署。
- 本轮 check:game、typecheck、lint、build、git diff --check 通过；纸/墨×桌面/手机×常规/减少动态效果 8 组、完整榜单 fixture 4 组的入场及三类返回均通过。新页面首次出现时遮罩盖满，返回使用反向水平色块，零 pageerror；验证未连接正式后端。

- 2026-10-01 用户随后否定榜单入口视觉，现改为经典 push 单色块横推：380ms 从左盖满、140ms 停留切页、460ms 向右退出，纸/墨都用水平轴。纸色深墨、墨色浅色，6px 强调色前沿；没有文案、彩条、装饰框。bandsNavigate 对 #rank/#rank/formal 路由选择 push，其余方向保持现有过场。新增类型不改变其他六种过场时间轴。
- check:game 增加 push 双主题单一轨道、无文案、横轴、掉帧与减少动态效果断言；对照页添加「07 色块横推」。validate-route-transitions 更新横推逐帧约束并通过 8 组主题/尺寸/减少动态效果 + 4 组完整榜单 fixture 实际点击；无 pageerror，首次新路由出现时遮罩盖满。纸色中段截图已目检，证据在 output/motion-intake/push-inspect-*-after.png。typecheck、build、lint、check:game、check:theme、git diff --check 通过。未验证生产榜单，未提交、推送或部署。

- 2026-10-01 追加返回首页与榜单过场：主菜单及竞技场 logo 返回首页接 `homeNavigate`，反向 frame 盖满才切首页，独立防重入锁并支持减少动态效果，修饰键保留链接原行为。赛后偏好榜链接也接现有 bands 导航。
- 偏好榜仍有文案层自带 inset 大底板/边框：盖满时突现、退场前突隐，与移动纸幕脱节。已改该层为透明、无边框，由移动材质承遮挡与边线；保留文案静止、仅全遮挡时显示。纸色逐帧前后截图目检在忽略目录 output/motion-intake/bands-inspect-*，不以先前已修装饰归属代替此次修复。
- check:game 增加返回首页反向轨道、盖满切路由、防重复、减少动态效果和榜单文案无独立大底板约束。新增 validate-route-transitions：纸/墨×1440/390×常规/减少动态效果共 8 组实际点击菜单返回、竞技场返回、首页进入榜单；另加 4 组有两行榜单数据的入场验证。无 pageerror，盖满点与退场落页均正确。接口使用隔离 fixture（含失败态与完整聚合榜单），没有连接正式后端。
- typecheck、build、lint、check:game、check:theme、git diff --check 通过；首次 lint 的测试常量声明问题已修正并复验。未提交、推送、部署；此前改动及原有 ZIP 保留。

- 2026-10-01 追加跨题高度伸缩：用户反馈不同题目切换时页面突然增高/降低。新 `lib/arena-layout.ts` 在布防作品门时保存旧两侧视口高度，新竞技场 layout effect 首帧继承并用 520ms height 动画过渡到各自自然高度；结束清除临时 height/transition，保留普通自适应与固定画布比例。门控等待伸缩结束，区域纸幕逐帧跟随实际边界。减少动态效果跳过伸缩，卸载/resize 清理动画。
- `validate-arena-entry --layout` 增加真实点击跨题双向伸缩、多个中间尺寸、伸缩期禁止纸幕退出和完成后恢复自然 CSS 的断言；测试作品为隔离普通 iframe/固定画布，未据此宣称全量正式作品或生产验收。对照页与 check-arena-scroll 同步规则。未提交、推送、部署。
- 本轮 typecheck、build、lint、check:game、check:arena-scroll 通过；跨题浏览器回归覆盖纸/墨、正常/减少动态效果、1440×1000/390×844，共 8 组双向换题。两种尺寸下均经过连续中间高度，动画期纸幕不退场，完成后临时样式清除，无 pageerror。git diff --check 通过。

- 2026-10-01 追加上级纸幕门控：用户要求不露出独立「正在接入试验场」。根因为 waitWorksLoaded 提前放门，而 intro 又先等纸幕退出才 setWorksSettled。现先在幕后完成就绪/显示/加载提示收场，再放门，然后等待退出接后续巡览；普通同源 iframe 等 document complete。上级纸幕不再在 8/15 秒自动放行，15 秒后幕内提供返回题库按钮。深链无纸幕的既有跳过行为保留。
- 新增 validate-arena-entry：旧构建逐帧复现退场期间 loader 与 works-hold 可见；纸/墨、常规/减少动态效果的慢探针作品实际点击入场均无泄漏；未就绪 15 秒仍盖满且返回题库出口可用。check:game 补入释放顺序断言，对照页说明与 DECISIONS 同步。验证用内存 fixture，不连接正式后端；未提交、推送或部署。
- 最终 build、typecheck、lint、check:game、check:theme、git diff --check 通过；validate-work-ready 原有纸/墨 14 段同题换组、重播、超时与隔离作品回归通过。该脚本更新的已跟踪生成报告已还原，避免将本地验收产物纳入源码改动。

- 2026-10-01 追加窗口适配：用户提供 003 luna/ORBITAL 截图，确认是内置 `WebWork`，并非普通 iframe。历史巡览样式把 `.web-work` 设为 height:auto/min-height:100%、hero 设为 flex:none/min-height:360px；外层窗口增高后，底部产生 196px 空白。`app/globals.css` 仅将该内置网页预览恢复为 height:100% 与 hero flex:1 0 auto，保留最小主画面高度及小窗口滚动。
- `validate-work-sizing` 扩展内置双网页和 390×600 短屏：修改前 --expect-bug --web-only 复现空白；修复后纸/墨、普通 iframe/固定画布/内置网页、5 个连续尺寸共 30 组（每组两侧）验证无多余空白，短屏底部可滚动看到。两份内置网页实际组件与 lunar.webp 已截图目检。build、lint、typecheck 通过，未连接正式后端、未部署；上一轮仅测容器 fixture 的结论不能覆盖内置网页，本次补齐该缺口。

- `main` 是当前维护基线。纸 / 墨主题、可选邮箱、浏览器分享卡、共享题库长短原文和服务端聚合榜单均已进入主线；本轮归并了 `show1-vote-processing` 上遗漏的题库文档跟进，以及旧公测修复中适用于当前接口的前端与工具改动。
- 本仓维护主站前端；[ArenaGalleri](https://github.com/wsnxxxs/ArenaGalleri) 维护独立 Gallery 前端；[arenaofbias-server](https://github.com/kme7kme7-prog/arenaofbias-server) 独占动态 API 和业务数据库；私有 `arenaofbias-data` 维护正式题目、原作、注册表与数据包。
- 当前正式题目由共享数据包登记稳定 `arenaId`，共享后端兼容历史题；长短原文属于同一题号。真实榜单读取 `/api/show1/leaderboard`，不下载逐票流水。当前管理入口是 `https://api.arenaofbias.icu/admin/`；本仓 `server/`、`/admin.html` 和 PM2 整站发布脚本属于迁移前实现。
- 上一次发布归档记录（2026-09-30，当前由下文新发布覆盖）：主站静态源码 `9805416`，共享后端源码 `f4685c9`，生产数据包 `4c926d5`，Gallery 静态源码 `ccfd11d`。主站 25 题（20 共用 + 5 历史）、Gallery 20 题 / 83 件；014 SupernovAI、016 云山巨城支持长短原文，但两题尚无真实结果。该轮整理时未部署，此后四仓发布见下文。
- 两站旧票和旧对局已在 vote-release 中备份后清零；账号、作品、评论等保留。不要把历史快照票重新汇入榜单，也不要用旧数据库备份覆盖后续业务数据。

## 当前已发布（2026-10-01 Brisbane）

- 现场切换时间：2026-09-30T17:19:05Z（Brisbane 2026-10-01 03:19:05）。

- 用户授权的四仓统一发布（含新增 38 件作品）已完成并已推送。Show1 实际上线源码为 79266513b295fb6ce8892f0afd08fbd32f61ab09；origin/main 与 fork/main 已快进同步。后续交接文档提交不代表再次部署。
- 共享后端实际上线源码为 566782e54a403c79a5ca4257a34a4beb6caa8d54、数据库 v22，正式包 20 题/121 件；Show1 公开 25 题（20 共用 + 5 历史）。数据仓源码 638937a、产物 39a2fa4、发布 CI 36731686651 成功；消费者已升级最新作品包。
- Gallery 首页精简经用户追加授权推送部署，于 2026-09-30T17:40:14Z（Brisbane 03:40:14）更新为 4717910e115413941586f170e808a32a05c1d258；固定数据包、Show1 与共享后端运行版本不变。
- 本仓法律/隐私/备案/AI 标识、16 个头像、账号绑定与 30 天会话文案、临时评论隐藏及首页配套文案已发布。提示词变体是既有主线能力。头像所依赖共享后端会话 avatar 与 PATCH /api/me 同步上线。
- 已提交源码的干净 export 上 typecheck、lint、build 通过。npm ci 因锁文件缺 @emnapi/core@1.11.3、@emnapi/runtime@1.11.3 失败；本轮通过连接已验证原 checkout 的 node_modules 构建，没有修改依赖或锁文件，此为发布门禁例外。
- 静态 802 文件逐项 SHA-256 与精确文件集合核对通过；替换 26 文件、移除 8 个旧 hash 资产，旧目录 show1-dist.prev 保留。Nginx 原配置未改，配置检查通过。
- 公网首页、使用条款与节目录、#privacy 直达均已验证；条款与隐私在 375px 下 clientWidth=scrollWidth=375，截图目检正常、无横向溢出，console error 0。Gallery 的 viewport override 未生效，实际仍为 1270/1280px，本轮未完成 Gallery 窄屏验收；此前隔离移动验证保留为历史。
- 四道生产测试题在部署、备份及各题零作品零票核对后，于 2026-09-30T17:19:52.309Z 由管理员 kme7 通过 API 软删除。其余用户 27、作品 267、votes 0、matches 1、comments 16、reactions 56 保留；完整备份与版本以共享后端交接为准。
- 未执行生产注册、邮箱或换头像写操作；此前隔离验收仍有效。未全量验证新增 38 件真实 fold、真实 Luna/capture 或真机。Gallery 旧 PR #1 仍待确认是否关闭，本轮不合并。
- 本轮归档：[legal-avatar-release](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)，准备阶段正文保留，文末已追加实际发布记录。
## 本轮已发布功能与历史验收（起于 2026-09-30）

- 评论区暂时隐藏：`app/page.tsx` 中 `COMMENTS_ENABLED = false`，娱乐测评菜单文案同步去掉评论区（`app/play-menu.tsx`、`lib/messages.ts`）。typecheck、lint 通过；未跑浏览器验收与 check:* 动效脚本。见 DECISIONS 2026-09-30 条目。
- 账号绑定文案：账号弹窗把「绑定邮箱」改为「账号绑定」（邮箱是其中一种方式），成功提示、注册与找回密码说明同步调整并补英文（`components/account.tsx`、`lib/messages.ts`）。typecheck、lint 通过，未跑浏览器验收。旧管理页 `app/admin/users.tsx` 的「未绑定邮箱」未改。
- 条款与隐私：新增 `#terms`、`#privacy`（可用 `#terms/cite` 这类地址直达某一节），页面在 `app/legal.tsx`，正文在 `lib/legal.ts`。正文与 ArenaGalleri `site/legal.js` 一致，只有站名（偏见试验场）、本站简介、适用范围、站内链接、「本地偏好」（本站有语言与本地战绩）和「你的权利」的入口说明按站点替换，改动时两边一起改；已逐节比对，19 节只有这些预期差异。暂无英文正文，英文界面显示仅中文的说明。
- 页脚：首页、玩法菜单、题库、榜单的页脚后加了法律信息行（`components/legal-footer.tsx`）：版权、AI 生成说明、条款、隐私、联系邮箱，以及只在 arenaofbias.icu 上显示的 ICP 备案号（`lib/legal.ts` 的 `BEIAN`，迁到 arena.arenagalleri.com 前补新号）。
- AI 生成标识：对局两侧栏头与放大预览标题。注册弹窗加了同意说明。
- 头像：`public/avatars/` 共 16 个 SVG，与 Gallery 相同，id 在 `lib/avatars.ts`。账号按钮显示头像，账号面板可以点选更换（`PATCH /api/me`）。依赖共享后端的头像改动（`/api/auth/me` 返回 avatar），本轮已一起发布。
- 验证：typecheck、lint 通过。本地 vite + 共享后端用无头 Chrome 核对了条款 / 隐私页（纸、墨两种主题、手机宽度无横向滚动）、页脚、注册同意说明、对局栏头标识、头像点选更换，无 console error；未跑 check:* 动效脚本。
- 文案校正：账号弹窗改为「登录状态保留 30 天」，与共享后端会话有效期和隐私政策一致。评论区隐藏期间，首页主视觉与页脚的「03 聊两句」改为「03 看揭晓」，页脚标语改为「先凭直觉选，再揭晓是哪个模型。」（英文同步）。恢复评论时可以一并改回。typecheck、lint 通过。`docs/PRODUCT.md` 本轮已同步共享后端的 30 天会话、2–24 位账号与 8–128 位密码规则。

## 分支整理

| 分支 | 处理与理由 |
| --- | --- |
| `email-auth` | 已由 PR #2 合入主线，删除远端遗留分支。 |
| `show1-vote-processing` | 功能已在主线；本轮把独有的共享题库文档合入并收尾，删除远端和本 checkout 的旧工作分支。 |
| `codex/shared-question-docs` | 已占用独立 worktree；内容随上项归并，保留本地 checkout 与运维证据。 |
| `codex/public-beta-repair` | 已归并 4 个独有提交：保留首页 / 竞技场精简、每日进度和分享等适用修复；旧单体后端及不兼容投稿 / 匿名票 / 作品评价接口留在合并父提交历史。清理 `origin` / `fork` 远端分支，不影响共享后端工作分支。 |

主站整理时上游没有开放 PR。数据仓 PR #5 的 38 件作品现已合并、推送并发布产物，本轮四仓消费者升级已完成，正式共用题库为 20 题/121 件。

## 接手注意与剩余事项

- 新题实际作品继续走数据仓完整收录流程；数据侧因文档提交发布新包，不要求消费方自动更新 pin。两个前端和共享后端按各自验证与发布流程更新。
- 旧修复分支已包含脚本 lint 修复，本轮完整 lint 通过；锁文件可选依赖缺失导致的历史 `npm ci` 问题仍未修依赖。`validate:guess` 的相邻两日必不同断言与现有答案池冲突；`check-vote-split` 仍检查已经移除的 `work-reveal` CSS 动画。两份检查的失败点未由本轮改动引入，保留为维护事项。
- 新合入每日挑战在同一浏览器保存进度，完成后当天只读；练习仍可重新开局。评价队列继续使用共享后端的 `mid` 契约，并修复账号 / 题目隔离及并发取消。主站仍需登录计票，投稿入口使用 Gallery 的当前共享流程；不启用旧单体专用接口。
- 历史调试脚本及 `output/playwright/work-ready-after.json` 曾被提交；本轮未清理这些文件或本地生成物。相机专项依赖本机作品 fixture，历史分享超时、低端真机 / 高 DPR / 真 Turnstile 与全部原作交互不在本轮验证范围。
- 模一把防剧透、难度与模型字段查证、特别赛及多人玩法仍是独立产品或内容工作；遵循 [docs/DECISIONS.md](docs/DECISIONS.md)，不把 [docs/IDEAS.md](docs/IDEAS.md) 当任务清单。
- 主站静态目录 `/www/wwwroot/show1-dist`，旧站保留为 `show1-dist.prev`；投票发布备份与证据在 `/root/arenaofbias-vote-release-20260930-c0ab6ac/`。当前发布与数据库回滚细则以共享后端 `docs/deploy.md` 和下列发布归档为准。
- 先前整理轮次初始工作区干净、配套三仓只改文档；随后四仓功能及最新作品按用户授权统一提交、推送和发布。忽略的作品、凭据、生成物、独立 worktree 和历史浏览器证据均保留，不无差别清理。

## 阅读入口与历史索引

- [README.md](README.md)：仓库分工、开发入口与长期定位。
- [docs/PRODUCT.md](docs/PRODUCT.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：当前行为、共享后端联调、历史实现边界及静态发布。
- [本轮法律、头像与四仓发布](docs/handoff/2026-10-01-legal-avatar-release-wsnxxxs.md)：授权、门禁与文末实际部署结果。
- [本轮仓库整理](docs/handoff/2026-09-30-repository-cleanup-wsnxxxs.md)：文档归并、分支证据和验证边界。
- [旧修复归并](docs/handoff/2026-09-30-beta-repair-merge-wsnxxxs.md)：前端修复取舍、当前 API 兼容、共享后端工作隔离和本轮验证。
- [共享题库最终上线](docs/handoff/2026-09-30-shared-question-release-wsnxxxs.md)、[投票发布与清零](docs/handoff/2026-09-30-vote-release-wsnxxxs.md)：历史生产记录、备份及回滚证据。
- [共享题库实现及文档跟进](docs/handoff/2026-09-30-shared-question-intake-wsnxxxs.md)、[投票聚合实现](docs/handoff/2026-09-30-show1-vote-processing-wsnxxxs.md)、[分支同步](docs/handoff/2026-09-30-vote-branch-sync-wsnxxxs.md)：已完成过程。
- [双主题上线](docs/handoff/2026-09-30-竞技场双主题-Atmeplz.md)、[主题交付](docs/THEME-DELIVERY.md)：纸 / 墨方案、构建与验收边界。
- [可选邮箱](docs/handoff/2026-09-29-email-auth-v2-wsnxxxs.md)、[浏览器分享](docs/handoff/2026-09-29-share-v2-wsnxxxs.md)、[模态判色](docs/handoff/2026-09-29-模态判色修复-Atmeplz.md)：已合入的近期功能。
- [内测收口历史](docs/handoff/2026-09-25-内测开闸前收口-kme7kme7-prog.md)、[更早交接](docs/handoff/2026-09-24-历史交接快照-Atmeplz.md)：迁移前邮箱、后台、模型治理与快门记录。
