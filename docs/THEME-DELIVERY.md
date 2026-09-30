# 竞技场纸 / 墨双主题 · 第二段交付

2026-09-30 · 基于已合并的 `origin/main@38dad57` · 用户已授权在无冲突后推送和部署；发布状态以根目录 HANDOFF 与本轮归档为准。

用户确认继续实施，并要求严格遵守首次需求与人类直觉。第一段的令牌映射、73 个关键帧及全部过渡声明分类保留在 [THEME-PLAN.md](THEME-PLAN.md)。本次采用 A「过墨 / 揭纸」。

用户随后重申既定的「深色下浅绿风格变为橙色」要求，当前交付已纠正：纸面酸绿、墨色暖橙。旧方案中的墨色黄绿品牌映射不再适用。

## 交付入口

- **完整逐文件补丁**：[arena-paper-ink.patch](../outputs/theme/arena-paper-ink.patch)。已有文件为 unified diff；新文件从空文件起给出完整内容，包括全部新增 CSS。补丁以 `38dad57` 为基线，不包含作品、数据库、构建目录和验收截图。
- **新增 CSS 全量**：[主题令牌](../app/theme-tokens.css)、[主题控件与动效](../app/theme.css)、[对照页样式](../reference/theme-review.css)。这些链接指向实际源文件，不是节选。
- **生产动效对照**：启动 Vite 后访问 `http://127.0.0.1:5173/reference/theme-review.html`。可切纸 / 墨，重播六种过场，钉住对战等待门后再释放。
- **本机验收资料**：[截图目录](../outputs/theme/screenshots/)、[动画增删清单](../outputs/theme/animation-audit.json)、[双主题作品就绪结果](../outputs/theme/work-ready-after.json)、[降速测量](../outputs/theme/theme-performance.json)。生成资料在忽略目录 `outputs/theme/`，不入库。

## 实际行为与设计

### 主题与颜色

`index.html` 同步内联脚本先读取 `aob-theme`。只有 `paper` / `ink` 是有效手选；键不存在、无效或存储不可用时跟随系统。脚本在应用模块之前设置 `data-theme`、`color-scheme`、浏览器主题色和首屏底色。导航主按钮一击切到另一种材质；右侧菜单可选「跟随系统 / 纸面 / 墨色」。恢复系统会删除手选键。系统变化不覆盖手选，跨标签修改与清除也会同步。

颜色集中在 `app/theme-tokens.css`，由 `globals.css` 导入，兼容现有 Tailwind 令牌及页面类名。保留 980 个按文字 / 表面 / 边线 / 信号区分的旧色兼容令牌，避免为了统一颜色而改变纸面的层次。新增界面应优先使用下表语义令牌，不再扩充十六进制色名令牌。

| 角色 | 纸面 | 墨色 | 实际用途 |
| --- | --- | --- | --- |
| `--background` | `#d9ddda` | `#121211` | 页面底层 |
| `--paper` | `#dfe3dd` | `#191918` | 主要表面 |
| `--card` / `--popover` | `#e8eae6` / `#e7eae4` | `#1e1e1c` / `#242421` | 卡片与浮层 |
| `--text-main` | `#1c2423` | `#ecebe6` | 正文与标题 |
| `--muted-foreground` | `#59635d` | `#aaa79e` | 次级正文 |
| `--text-faint` | `#59635d` | `#a09d94` | 小字号信息 |
| `--accent` | `#d9fb51` | `#f2a365` | 纸面酸绿、墨色暖橙；主操作、焦点、选中态与过场统一 |
| `--accent-soft` / `--accent-wash` | 沿用各处原纸面色 | `#dfad85` / `#34281f` | 墨色装饰与背景反馈的橙色层次 |
| `--on-accent` | `#192020` | `#192020` | 亮色按钮上的字，不能跟着正文反白 |
| `--surface-inset` | `#1c2423` | `#0d0d0c` | 深底面板、墨色过场 |
| `--text-on-inset` | `#e8eee6` | `#ecebe6` | 深底上的正文 |
| `--text-on-inset-muted` | `#a9b8a3` | `#aaa79e` | 深底上的说明与计数 |
| `--control-line` | `#788577` | `#79796f` | 控件、焦点邻近边界 |
| `--media-matte` / `--media-line` | `#dfe3dd` / `#b4beb5` | `#30302c` / `#66665e` | 浅底作品的衬底与边线 |

纸面的布局、字体、底色和原有阴影几何保留。按第一段的对比度约定，对实测不足的 68 个文字色兼容令牌做最小明度修正；另纠正几个小标签的整体透明度与深底文字角色。这些是明确的可读性修正，因此不声称逐像素与旧截图完全相同。墨色的 118 个阴影映射改为接触阴影 / 内侧细边，避免复制浅色的硬投影。

本次橙色纠正未再调整任何原纸面颜色。墨色按钮、焦点、选中态、装饰及其半透明层统一引用橙色角色；主强调上的深字对比度为 **8.04:1**，柔和橙上的深字为 **8.24:1**。模一把命中绿 `#a1c58e`、接近黄、红蓝阵营和作品原色保留各自语义。

作品图片、iframe 内容和导出 PNG 保持原色；在宿主添加灰墨衬底、轮廓及接触阴影。没有给作品套反色、亮度滤镜，也没有改变画布校准。分享卡仍是原来的纸面版式，墨色适配的是预览弹窗与衬框。

### 标志性切换：过墨 / 揭纸

纸 → 墨：墨色材质从右向左推进，前沿有静态不规则干边和一条细橙色标尺。盖满后统一换色，短暂停驻，再从左侧揭出墨色界面。墨 → 纸反向、更利落，标尺使用纸面酸绿。标尺从进场起跟随目标主题，不等页面换色才变色。基准节奏分别为 `240 + 160 + 260ms`、`210 + 140 + 230ms`，另留准备与两帧绘制缓冲。

全屏只有一个没有文字的移动材质层。没有网页截图、整页 opacity、根节点 transform、动态模糊或整屏 clip-path 动画；不规则边是窄条上的静态裁剪。盖满时暂时停掉已有 CSS transition，完成一次主题重算，并在盖幕下恢复交互过渡、等待绘制，再揭开。这样获得连续的视觉换色，不让数百个元素同时插值重绘。

连续输入保留最后意图，幕片不叠加。已有路由幕 / 对战快门时排队，不抢作品就绪门。系统同步、跨标签同步、页面隐藏与减弱动态效果直接落到最终状态。所有清理路径取消定时器、帧回调和动画。

### 两套关键过场

| 节点 | 纸面 | 墨色 | 不变量 |
| --- | --- | --- | --- |
| 首页进入 / `frame` | 抽页、定位框 | 纵向墨面、细边收势 | 标题原位，盖满才换页 |
| 排行 / `bands` | 机械切片、三色索引带 | 纵向底幕、细线索引 | 索引文字不随大层位移 |
| 题库与玩法 / `convoy` | 水平整片推进 | 垂直墨幕揭开 | 小屏继续沿用 `match` 入口 |
| 模一把 / `deal` | 双片错位发牌 | 双叶展开、静止标题 | 仅七个小数字依次亮起 |
| 返回 / `folio` | 水平抽页，返回反向 | 纵向揭幕，返回反向 | 两种主题都有明确方向反馈 |
| 下一题 / `match` | 机械合页 | 上下墨叶合拢与揭开 | 真实作品就绪后才退场 |
| 同题换组快门 | 横向材质层 | 纵向墨面 | 沿用 500ms 后换稿与就绪门 |
| 初次展示作品 | 独立横向揭片 | 独立纵向揭片 | 不移动作品与正文，保留面板外装饰 |
| 揭晓 / 结果 | 小印章与扫线 | 细边呼吸与留白 | 结果正文只做背景反馈 |
| 账户换页、题库、榜单入场 | 原位换页 / 背景洗色 | 原位换页 / 缓和底色 | 大段文字不建进出场合成层 |

原有 73 个关键帧中，31 条旧轨道被移除：20 条不安全的文字容器入场直接移除，另 11 条改为材质或背景反馈。新增 8 条材质 / 状态关键帧，现有定义共 50 条。小进度条、图形插值、按钮反馈等中立效果保留；颜色全部消费令牌。CSS 最终层和原生 JS 都响应运行中的 `prefers-reduced-motion` 变化，减少动态不等于提前揭开未就绪作品。

## 验证记录与边界

橙色纠正后已重新通过 `check:theme`、`validate:theme` 与 `build`，并逐项比对原纸面令牌保持不变。真实浏览器另对双向主题幕逐帧采样：过墨橙、揭纸绿在 prepare / cover / settle / reveal 全阶段一致；首页双主题与墨色模一把已截图目检，命中绿图例未被品牌橙替换。此次截图与采样为 `output/playwright/orange-*`；下表其他业务验证为本轮此前记录，颜色纠正后未重复运行。

| 检查 | 结果与口径 |
| --- | --- |
| `npm run typecheck` / `npm run build` | 通过，未添加 npm 包；依赖与锁文件不变 |
| `npm run check:theme` | 16 种启动偏好组合、14 组核心正文对比度通过；20 份入口可达 CSS 无分散颜色字面量、无 transition-all；不安全入场名称不再存在 |
| `npm run check:motion` | 六组不变量通过；六种过场 × 两主题，含迟帧、打断、暂停、销毁、减弱动态、盖满后换页、等待门与返回方向 |
| `npm run validate:theme` | Chromium / Edge 实测首屏模块延迟时墨底仍正确；手选持久化、OS 跟随、恢复系统、跨标签、拒绝存储、菜单键盘与 Escape、连续输入、运行中減弱动态、等待门、正文原位均通过；实际 CSS 的高亮 / 深底文字配对通过 4.5:1 检查 |
| `npm run validate:work-ready` | 纸 / 墨各 5 项，共 10 项通过：快作品一次通知、慢作品、原局重播、减少动态、未就绪超时遮挡；同时断言等待时材质盖满且使用当前主题的墨底 |
| `npm run validate:share` | 6 项通过，保持导出卡尺寸、内容、二维码与取消清理 |
| 页面与弹窗截图 | 1440 / 390 宽的 7 条主路由双主题；三版首页、320 宽导航、账户五状态、分享、竞猜反馈 / 答案、六种过场平台另外检查；无横向布局溢出、无页面异常 |
| 定向 lint | 本轮新增模块、页面、动效与检查脚本通过。额外检查账户文件可见其既有 React 编译器 / 语义标签问题；本轮未修改这些旧逻辑 |
| 全量 `npm run lint` | 仍是基线 9 个旧脚本错误；未为了主题任务修改它们 |

降速测量使用 Chromium CDP **6 倍 CPU 降速**，不是低端真机。记录证明首页正文矩形、opacity、transform 在切换全程不变。样本中揭幕阶段没有超过 50ms 的主线程 rAF 间隔；准备 / 盖幕 / 全遮挡重算仍存在长间隔，具体数值保存在 JSON。rAF 是主线程观测，不是合成器实际呈现帧率，不能据此宣称所有设备稳定 60fps。

对比度检查区分正文与装饰，自动 DOM 扫描不懂照片、渐变和绝对定位越界背景，因此原始候选项不能直接当作缺陷数；深色账户 / 竞猜 / 分享 / 首页补验的正文候选已清零。图片上的标题、深色排行头、装饰句号与箭头另行目检。正文核心与关键控件另有可重复的数值断言。

页面浏览使用本地旧后端的独立种子数据和前端占位模式；账户已登录 / 绑定页使用浏览器只读响应 fixture，未发送邮件、注册真实用户或修改线上数据。作品等待回归使用独立内存 fixture。未宣称完成新共享后端的生产联调。

**仍需发布前真机验收**：低端 Android、iOS Safari、高 DPR 屏幕上的文字抗锯齿与整段帧率；真实 Turnstile 服务的外观与验证；生产作品全集和共享后端会话。当前环境无法替代这些硬件 / 服务检查。

## 人工验收清单

下面每一行均应分别在纸面与墨色执行。桌面已抽样检查，完整发布签收按右栏再走一遍；不把模拟器结论当作真人真机签收。

| 页面 / 状态 | 纸面检查 | 墨色检查 | 操作与判定 |
| --- | --- | --- | --- |
| 首页三版 | 构图、底色、酸绿与基线一致；小字清晰 | 墨底有层次，强调统一暖橙；红蓝卡底文字清晰 | 切图 / 文 / 网预览，点击主入口与随机入场；正文不整体淡入或位移 |
| 玩法菜单 / 特别赛 | 分类与锁定卡清晰，结构原样 | 浅底残留为零，禁用说明可读 | 返回、进入模式、开关主题；320 / 390 宽不溢出 |
| 对战初始加载 | 作品就绪前被完整遮挡 | 等待幕、进度条和字色均为墨色体系 | 用慢网页 / 慢图片验证；等待时间超过动画时长仍不能露出加载过程 |
| 对战投票 / 揭晓 | A/B、选中章、统计和键盘提示清晰 | 亮色投票按钮用深色字；结果边线与阴影有层次 | 投 A、投 B、平局、重播、同题换组、下一题；正文与作品不缩放淡入 |
| 作品封面 / 放大 / 正文 | 原作品颜色、宽高与校准不变 | 有衬底和边线，无反色滤镜；空白区域不被宿主强行染黑 | 浅底截图、文字作品和 iframe 各看一件，放大后关闭 |
| 模一把选择与发牌 | 机械节拍、七线索依次反馈 | 双叶墨幕、原位标题；绿 / 黄 / 灰语义不混 | 每日、练习、搜索键盘选择、猜错 / 接近 / 猜中、主动看答案 |
| 模一把结果 | 步数、提示、规则说明和分享按钮清晰 | 高亮分享按钮不是白字；成功 / 接近反馈不失真 | 结果面板、重玩、分享；中途开启减少动态，判断与存储继续正确 |
| 排行 | 弱字、第一名计数和图例可读 | 表格、选中行、雷达和模型档案无纸色残留 | 切分类、选模型、重播、空数据与有数据；标签原位，只有图形与小数字变化 |
| 题库 / 题目详情 | 筛选、封面、提示词与入口保持原布局 | 浅底封面有衬框；正文、选中项、滚动条清晰 | 筛选、搜索、开题、返回；封面揭片不带动标题 |
| 登录 / 注册 / 找回密码 | 纸叠层、输入边线、提示与错误可读 | 浮层底色、placeholder、按钮、焦点与 Turnstile 匹配 | 键盘完整走表单，切密码显隐；换页不侧滑、不模糊、不整体淡入 |
| 账户 / 绑定 / 换绑 / 成功 | 标签、验证码倒计时、禁用状态明确 | 深底说明和高亮成功标记可读 | 使用测试账号操作；Escape 关闭，焦点回入口；业务联调由共享后端环境复核 |
| 分享弹窗 | 原 PNG 版式和下载内容不变 | 弹窗与衬框变暗，原卡片保持原色 | 生成、取消生成、下载、复制链接、关闭；图片 URL 正确释放 |
| 全局细节 | 选区、滚动条、聚焦框匹配纸面 | 选区不刺眼；边线 / 接触阴影可辨 | Tab、Shift+Tab、方向键、Home、End、Escape；不要依赖颜色单独表达选择 |

偏好与动态专项：

- [x] 无偏好时分别以系统浅 / 深启动；在应用模块延迟下检查首屏背景。
- [x] 手选后刷新、跨页、切换系统，手选仍优先；选择「跟随系统」后恢复响应。
- [x] 跨标签修改 / 清除偏好；localStorage 被拒绝时仍可在本标签切换。
- [x] 连续切换、动画中开启减少动态、等待作品时开启减少动态：无多层残留、无提前揭幕。
- [x] 主题菜单用键盘可达；退出菜单回到开关；核心正文与高亮文字配对 ≥ 4.5:1。
- [ ] 在低端真机录制「过墨 / 揭纸」与对战揭幕，检查整段帧率和细字边缘，完成发布签收。

## 同模式待改清单

当前入口可达竞技场页面已迁移。以下没有伪装成本轮已生效范围：

| 文件 / 范围 | 原因与通用改法 |
| --- | --- |
| `portable-design-system/design-kit.css`、`design-kit/design-kit.css` | 独立设计包，未导入主站；以后发布新包时，将 `--pdk-*` / `--dk-*` 绑定到当前语义角色，按第一段映射提供 paper / ink，不复制另一套业务颜色 |
| `components/ui/tabs.tsx` 等当前未使用组件 | 未来接入时把 `transition-all` 收窄为明确属性；禁止给含正文的面板加 fade / translate 入场 |
| 旧 `app/admin/`、旧管理后台入口 | 当前生产后台属于共享后端仓库，沿用其 dark / light 协议；不要在本仓为它混入竞技场 paper / ink |
| 历史独立 HTML 样机 | 不在主入口中；本轮仅更新了实际相关的 theme / game / wipe / surface / account 对照页；后续启用其他样机前先导入生产令牌和生产控制器 |
| 外部作品 / iframe / 导出分享卡画布 | 属于作品内容，保持原色与原动画；只改宿主衬框。自有占位 iframe 已加减少动态支持 |

新页面的通用规则：表面、文字、边线分角色；亮色填充用 `--on-accent`，深底次级文字用 `--text-on-inset-muted`；入场只动空白材质、背景色或小装饰；CSS 与 JS 都响应减少动态；盖满、换内容、真实就绪、退出、清理分别保留独立职责。

## 逐文件索引

下表由当前工作区生成，`+ / -` 为已有文件的实际变更行数，新增文件标出全量行数。完整内容以交付补丁与实际源文件为准。

<!-- FILE_INDEX -->

| 文件 | 交付形式 / 行数 |
| --- | --- |
| [app/account.css](../app/account.css) | +99 / -131 |
| [app/arena-refinement.css](../app/arena-refinement.css) | +105 / -107 |
| [app/conversation-arena.css](../app/conversation-arena.css) | +4 / -4 |
| [app/dev.css](../app/dev.css) | +26 / -26 |
| [app/event.tsx](../app/event.tsx) | +3 / -1 |
| [app/game-transitions.css](../app/game-transitions.css) | +120 / -85 |
| [app/globals.css](../app/globals.css) | +303 / -383 |
| [app/guess.css](../app/guess.css) | +153 / -183 |
| [app/guess.tsx](../app/guess.tsx) | +2 / -0 |
| [app/home-duel.css](../app/home-duel.css) | +47 / -94 |
| [app/home-duel.tsx](../app/home-duel.tsx) | +2 / -0 |
| [app/home-next.css](../app/home-next.css) | +79 / -107 |
| [app/home-next.tsx](../app/home-next.tsx) | +2 / -0 |
| [app/home.css](../app/home.css) | +85 / -112 |
| [app/home.tsx](../app/home.tsx) | +2 / -0 |
| [app/library.css](../app/library.css) | +37 / -37 |
| [app/observatory.css](../app/observatory.css) | +153 / -195 |
| [app/page.tsx](../app/page.tsx) | +7 / -16 |
| [app/play-menu.tsx](../app/play-menu.tsx) | +3 / -1 |
| [app/prompt-archive.css](../app/prompt-archive.css) | +46 / -56 |
| [app/prompt-library.tsx](../app/prompt-library.tsx) | +12 / -10 |
| [app/prompt-preview.tsx](../app/prompt-preview.tsx) | +3 / -1 |
| [app/ranking.css](../app/ranking.css) | +154 / -182 |
| [app/ranking.tsx](../app/ranking.tsx) | +27 / -11 |
| [app/share.css](../app/share.css) | +37 / -37 |
| [app/theme-tokens.css](../app/theme-tokens.css) | 新增全量 2196 行 |
| [app/theme.css](../app/theme.css) | 新增全量 120 行 |
| [components/account.tsx](../components/account.tsx) | +6 / -1 |
| [components/beta-notice.css](../components/beta-notice.css) | +7 / -7 |
| [components/fixed-html-work.css](../components/fixed-html-work.css) | +1 / -1 |
| [components/rolling-label.tsx](../components/rolling-label.tsx) | +5 / -3 |
| [components/theme-toggle.tsx](../components/theme-toggle.tsx) | 新增全量 146 行 |
| [components/ui/button.tsx](../components/ui/button.tsx) | +1 / -1 |
| [components/ui/dialog.tsx](../components/ui/dialog.tsx) | +2 / -2 |
| [docs/DECISIONS.md](../docs/DECISIONS.md) | +27 / -0 |
| [docs/THEME-PLAN.md](../docs/THEME-PLAN.md) | 新增全量 533 行 |
| [HANDOFF.md](../HANDOFF.md) | +40 / -0 |
| [index.html](../index.html) | +12 / -0 |
| [lib/decryption.ts](../lib/decryption.ts) | +8 / -1 |
| [lib/game-transitions.ts](../lib/game-transitions.ts) | +82 / -362 |
| [lib/library-motion.ts](../lib/library-motion.ts) | +2 / -2 |
| [lib/motion.ts](../lib/motion.ts) | 新增全量 9 行 |
| [lib/placeholder.ts](../lib/placeholder.ts) | +1 / -0 |
| [lib/text-swap-mask.ts](../lib/text-swap-mask.ts) | +2 / -0 |
| [lib/theme-transition.ts](../lib/theme-transition.ts) | 新增全量 140 行 |
| [lib/theme.ts](../lib/theme.ts) | 新增全量 100 行 |
| [lib/ui-transitions.ts](../lib/ui-transitions.ts) | +67 / -50 |
| [package.json](../package.json) | +2 / -0 |
| [reference/account-turn-review.html](../reference/account-turn-review.html) | +3 / -86 |
| [reference/game-transitions-review.html](../reference/game-transitions-review.html) | +22 / -44 |
| [reference/surface-review.html](../reference/surface-review.html) | +8 / -7 |
| [reference/theme-controls.tsx](../reference/theme-controls.tsx) | 新增全量 27 行 |
| [reference/theme-review.css](../reference/theme-review.css) | 新增全量 14 行 |
| [reference/theme-review.html](../reference/theme-review.html) | 新增全量 13 行 |
| [reference/theme-review.tsx](../reference/theme-review.tsx) | 新增全量 52 行 |
| [reference/wipe-review.html](../reference/wipe-review.html) | +9 / -20 |
| [scripts/check-game-transitions.mjs](../scripts/check-game-transitions.mjs) | +30 / -120 |
| [scripts/check-library-motion.mjs](../scripts/check-library-motion.mjs) | +3 / -4 |
| [scripts/check-surface.mjs](../scripts/check-surface.mjs) | +43 / -195 |
| [scripts/check-theme-motion.mjs](../scripts/check-theme-motion.mjs) | 新增全量 106 行 |
| [scripts/check-theme.mjs](../scripts/check-theme.mjs) | 新增全量 93 行 |
| [scripts/check-wipe.mjs](../scripts/check-wipe.mjs) | +35 / -191 |
| [scripts/motion-fixture.mjs](../scripts/motion-fixture.mjs) | 新增全量 128 行 |
| [scripts/validate-theme-ui.mjs](../scripts/validate-theme-ui.mjs) | 新增全量 330 行 |
| [scripts/validate-work-ready.mjs](../scripts/validate-work-ready.mjs) | +18 / -8 |
| [src/main.tsx](../src/main.tsx) | +4 / -0 |

本报告本身为新增完整文件；HANDOFF 仅更新当前状态。
