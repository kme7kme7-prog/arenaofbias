# 竞技场纸 / 墨双主题：第一段方案

2026-09-30 · 基线 `arenaofbias/main@38dad57` · **第一段方案已获用户“严格符合首次需求，并符合人类直觉……做吧”的实施授权；采用 A「过墨 / 揭纸」。下文保留实施前的盘点与计划，实际交付见 `THEME-DELIVERY.md`。**

**后续颜色纠正：用户明确墨色主题必须使用橙色强调。下文旧方案中的墨色黄绿品牌映射已作废，实际采用 `#f2a365`，柔和橙色层次为 `#dfad85`；纸面酸绿与判题命中绿保持。以 [交付说明](THEME-DELIVERY.md) 和 `theme-tokens.css` 为准。**

用户已授权把远端最新进度合并到本地。当前分支 `codex/guess-modality-match` 已从 `ee98710` 快进到 `38dad57`，没有产生新的业务提交。两份本轮需求文档已恢复，交接文件新增段落的冲突已解决，双方内容均保留；他人未跟踪作品未改动。

## 0. 本次核查的依据与边界

- 竞技场入口为 `src/main.tsx`；从实际 import 图递归检查，不把旧后台、参考页或第三方作品当成竞技场主页面。
- 仓库没有 `inputs/`。实际样式为 `app/*.css`；用户提到的 `--pdk-*` 位于 `portable-design-system/design-kit.css`；`design-kit/design-kit.css` 则使用 `--dk-*`。两份设计包均未被当前主入口导入，只作为说明书参考。
- 墨色参考：[展览馆 style.css](https://github.com/wsnxxxs/same-prompt-gallery/blob/efaae9c/site/style.css)、[exhibition.css](https://github.com/wsnxxxs/same-prompt-gallery/blob/efaae9c/site/exhibition.css)。后台参考：[admin.css](https://github.com/kme7kme7-prog/arenaofbias-server/blob/338bb3f/admin/admin.css)、[admin.js](https://github.com/kme7kme7-prog/arenaofbias-server/blob/338bb3f/admin/admin.js)。本方案不会修改这两个站。
- 当前上游 `site/exhibition.css` 本身仍有大量浅色硬编码，暖黑主题令牌实际位于 `site/style.css` 的 `[data-theme="dark"]`。不能只看文件名就将它等同于用户描述的 `inputs/gallery-exhibition.css`；本方案取已核实的角色令牌与职责，不假定两份材料逐字一致。
- 已运行并通过：`npm run typecheck`、`npm run build`、`npm run validate:share`（6 项）、`npm run check:motion`（现有六组脚本）。这些只证明合并后的基线通过相关检查，不能证明未来主题效果或文字稳定性已通过。
- 尚未实施或实测新主题、低端设备帧率、全站键盘与视觉回归；本轮未连接 VPS，未 commit / push / 部署。原有 lint 历史问题不在本轮改造范围，本轮未重跑全量 lint。

## 1. 墨色令牌映射

### 1.1 视觉方向与语义拆分

墨色采用展览馆的暖黑底 `#121211`，使用暖灰层次、米白字和少量低饱和酸绿。主强调色保留竞技场身份，墨色改为 `#c9dd83`；A / B 的红蓝继续表达阵营，避免把主操作的强调色也变成队伍红。两套主题沿用零圆角、现有尺寸、排版和字重；墨感由表面、边线、投影和动效节拍表达。

**不能直接把 `--ink` 反成浅色。** 当前它同时被 `color` 和 `background` 使用，`--paper` 也有反向用法。实施时先按使用位置拆为 `--text-main`、`--surface-inset`、`--text-on-inset`、`--surface-paper` 等语义角色，再保留必要旧名别名。同理，强调底上的文字必须使用 `--on-accent`，不能在墨色继续引用普通浅色前景。

主入口运行令牌统一放在 `app/globals.css` 的根主题段；`@theme inline` 只做 Tailwind 角色桥接，页面局部变量只引用根令牌。不同的现有纸面色不合并成近似色，避免浅色静态观感回归。表中的新增角色是方案命名，尚未加入代码。

### 1.2 现有全局令牌逐项对应

| 现有令牌 / 新角色 | paper 原值 | ink 拟定值 | 理由 / 使用口径 |
| --- | --- | --- | --- |
| `--background` / 页面底 | `#d9ddda` | `#121211` | 暖黑，贴近展览馆；避免纯黑压扁层次 |
| `--paper` / `--surface-paper` | `#dfe3dd` | `#191918` | 普通面与页面底轻微区分；原来作文字的用法先拆走 |
| `--card` / 卡片面 | `#e8eae6` | `#1e1e1c` | 卡片微亮，保留留白结构 |
| `--popover` / 弹出面 | `#e7eae4` | `#242421` | 高于普通卡片，靠层次与轮廓辨识 |
| `--foreground` | `#1d2423` | `#ecebe6` | 米白正文，避免纯白眩光 |
| `--ink` 的文字用途 → `--text-main` | `#1c2423` | `#ecebe6` | 前景角色独立，不能连同墨面一起反转 |
| `--ink` 的表面用途 → `--surface-inset` | `#1c2423` | `#0d0d0c` | 深色顶栏、遮条和凹槽仍保持深色 |
| 新 `--text-on-inset` | 现用 `#e8eee6` | `#ecebe6` | 两种主题的深色子面都用浅字 |
| `--primary`、`--accent`、`--acid` | `#d9fb51` | `#c9dd83` | 降低夜间荧光感，保留酸绿识别 |
| `--primary-foreground` / `--on-accent` | `#192020` | `#192020` | 强调色底上始终用深字；拟定墨色对比度 11.16:1 |
| `--muted`（背景，不是字） | `#c5cbc6` | `#2a2a26` | 禁用面、轨道底保持低强调 |
| `--muted-foreground` | `#5b655f` | `#aaa79e` | 在最亮的普通墨色面上仍有 6.23:1；纸面例外见 1.6 |
| `--border`（装饰分隔） | `#b4beb5` | `#3b3a36` | 不用亮框切碎页面；不作为唯一的控件识别线 |
| 新 `--control-line` | 现有控件值分别保留 | `#79796f` | 对 `#272724` 为 3.41:1，用于输入框与必要轮廓 |
| `--ring` | `#718522` | `#c9dd83` | 暗底焦点用亮色；全局现有 `#688515` 焦点值另保留为纸面焦点令牌 |
| `--red` | `#ff7869` | `#f58f80` | A 阵营，降低尖锐感，文字对最亮面约 6.51:1 |
| `--blue` | `#8bc9dd` | `#a0d2df` | B 阵营，维持与 A 的辨识，约 9.12:1 |
| `--radius` 与 `--radius-sm/md/lg/xl` | `0` | `0` | 保留几何语言，不照搬后台圆角 |
| `--mono`、`--font-sans`、`--font-mono` | 当前字体栈 | 相同 | 切主题不引入换字体、重新换行和字体下载 |
| `--ease-out`、`--ease-in-out` | 当前两条曲线 | 兼容原曲线 | 既有微交互可继续用；墨感轨道另用主题 motion 角色 |

`@theme inline` 的 `--color-background/foreground/primary/primary-foreground/popover/muted/muted-foreground/border/ring/card/accent` 继续映射相应角色；`--color-popover-foreground`、`--color-card-foreground` 映射正文角色；`--color-input` 改映射控件识别线；`--color-accent-foreground` 改映射 `--on-accent`。`dark:` 变体改识别 `data-theme="ink"`，去掉目前 `.dark` 仍赋纸色的歧义。

### 1.3 `--pdk-*` 全部颜色与投影令牌

设计包是参考，不在主站重复引入它的 reset / 组件层。下表给出完整对应关系，主站按相同角色消费根令牌。

| 纸面令牌 | paper 原值 | ink 拟定值 | 理由 |
| --- | --- | --- | --- |
| `--pdk-paper` | `#dfe3dd` | `#191918` | 普通材质面 |
| `--pdk-ink` | `#1c2423` | `#0d0d0c` | 固定为深面角色，文字改用 text |
| `--pdk-acid` | `#d9fb51` | `#c9dd83` | 克制的酸绿 |
| `--pdk-ground` | `#d9ddda` | `#121211` | 页面底 |
| `--pdk-surface` | `#e8eae6` | `#1e1e1c` | 卡片面 |
| `--pdk-surface-raised` | `#f0f2ec` | `#272724` | 控件凸起面；作为本表正文对比度的最不利普通底色 |
| `--pdk-text` | `#1c2423` | `#ecebe6` | 正文字色 |
| `--pdk-muted` | `#5b655f` | `#aaa79e` | 次级字，纸面例外见 1.6 |
| `--pdk-line` | `#b4beb5` | `#3b3a36` | 装饰分隔 |
| `--pdk-control-line` | `#788577` | `#79796f` | 可操作边界 |
| `--pdk-focus` | `#536627` | `#c9dd83` | 深色高可见焦点 |
| `--pdk-shadow-color` | `#a2ad87` | `#070707` | 从纸层偏移色变为接触暗部，不反成亮灰 |
| `--pdk-team-a` | `#ff7869` | `#f58f80` | A 阵营 |
| `--pdk-team-b` | `#8bc9dd` | `#a0d2df` | B 阵营 |
| `--pdk-success` | `#335937` | `#a1c58e` | 配下行底色 7.17:1 |
| `--pdk-success-bg` | `#dae5d5` | `#233024` | 深绿状态底 |
| `--pdk-warning` | `#775016` | `#dfbf7a` | 配下行底色 8.13:1 |
| `--pdk-warning-bg` | `#f1e6c4` | `#30291d` | 深赭状态底 |
| `--pdk-danger` | `#923b31` | `#eea08f` | 配下行底色 7.21:1 |
| `--pdk-danger-bg` | `#f3dfda` | `#342220` | 深朱状态底 |
| `--pdk-shadow` | `3px 4px 0 var(--pdk-shadow-color)` | `0 2px 8px rgb(0 0 0 / 28%), inset 0 0 0 1px rgb(236 235 230 / 6%)` | 墨色使用接触阴影与微弱轮廓，保持零圆角 |

`--pdk-font-ui/font-mono/font-reading`、`--pdk-text-xs/sm/md/lg`、`--pdk-heading/display`、`--pdk-space-1` 至 `--pdk-space-9`、`--pdk-gutter/content/reading-width`、`--pdk-radius`、`--pdk-z-header/z-overlay` 两主题保持原值。`--pdk-duration-fast/ui/enter` 的纸面参考值为 150/240/600ms，墨色候选为 150/280/680ms；`--pdk-ease-out`、`--pdk-ease-in-out` 保留原值。时长仅为候选调参值，不锁进不变量断言。

包内 `.pdk-inverse` 是局部深色面：其 `surface (#1c2423)` / `surface-raised (#293330)` 映射墨色凹面 `#0d0d0c` / `#171715`；`text (#e8eae6)` / `muted (#b7c2b3)` 映射 `#ecebe6` / `#aaa79e`；`line (#52614f)` / `control-line (#a0ad95)` 映射 `#45443f` / `#79796f`；`focus (#d9fb51)` / `shadow-color (#52614f)` 映射 `#c9dd83` / `#070707`。这样局部深面在两种全站主题下都保持深面语义。

### 1.4 `--dk-*` 参考包与页面局部令牌

`--dk-*` 已有一个偏绿的 `data-dk-theme="ink"` 子世界，但未接主站。本次采用暖黑方向，不把旧子世界当作已经交付的站点主题。

| `--dk-*` 名称（纸面值） | 墨色对应 | 解释 |
| --- | --- | --- |
| `paper (#dfe3dd)` / `paper-2 (#d9ddda)` / `paper-3 (#e8eae6)` / `paper-hi (#eef0e9)` | `#191918` / `#121211` / `#1e1e1c` / `#272724` | 四层表面 |
| `ink (#1c2423)` / `ink-2 (#263029)` | `#0d0d0c` / `#171715` | 深面与槽内层次 |
| `fg (#1c2423)` / `fg-soft (#5b655f)` / `fg-faint (#71806b)` | `#ecebe6` / `#aaa79e` / `#a09d94` | 正文、次级、弱字；最弱一档在最亮普通面上仍为 5.52:1 |
| `fg-on-ink (#e8eee6)` / `fg-on-ink-soft (#a0ad97)` / `fg-on-ink-faint (#90a181)` | `#ecebe6` / `#aaa79e` / `#a09d94` | 深子面文字 |
| `line (#b4beb5)` / `line-soft (#c7cebd)` / `line-ink (#4a5b3c)` / `line-on-ink (#455048)` | `#3b3a36` / `#2a2927` / `#3b3a36` / `#45443f` | 四种装饰线；控件边界使用更强的 control-line |
| `accent (#d9fb51)` / `accent-ink (#192020)` / `accent-dim (#718522)` | `#c9dd83` / `#192020` / `#c9dd83` | 强调底、其上文字、焦点 |
| `shadow (#a2ad87)` / `shadow-alt (#aabc95)` | `#070707` / `#070707` | 只保留暗部语义；实际阴影几何切换到接触型 |
| `a (#ff7869)` / `a-soft (#fb9a8b)` / `b (#8bc9dd)` / `b-soft (#b7dce4)` | `#f58f80` / `#e8aa9f` / `#a0d2df` / `#b5d9e1` | 阵营色与柔和档 |

`--dk-sans/mono/serif-en/serif-cjk`、`--dk-radius/chamfer/chamfer-sm` 两主题不变；`--dk-ease-out/ease-in-out/ease-pop` 保留原值，供兼容微交互使用。`--dk-t-micro/enter/stage/slow/stagger` 的纸面 .2/.55/.85/1.3/.08s 对应墨色候选 .16/.64/.96/1.5/.06s；关键过场仍按用途单独调节，见第 3 节，不整体乘慢系数。`--dk-lift/lift-hover/lift-active` 墨色分别为 `0 2px 8px rgb(0 0 0 / 28%)`、`0 3px 10px rgb(0 0 0 / 34%)`、`inset 0 1px 3px rgb(0 0 0 / 32%)`，均配独立细边框，表达静置 / 轻加强 / 压下的接触关系。

| 页面局部令牌 / 原值 | ink 拟定值 | 注意事项 |
| --- | --- | --- |
| `.arena-shell --paper: #e9ebe3` | `#1e1e1c` | 保留竞技场自己的纸面原值，改引用根场景令牌 |
| `--gt-paper: #e8ecdf` | `#191918` | 过场不透明遮挡色，不能调成半透明 |
| `--gt-ink: #20261f` | `#0d0d0c`（面）/ `#ecebe6`（字） | 按用途拆分；与普通 --ink 同样存在角色混用风险 |
| `--gt-acid: #deee78` | `#c9dd83` | 过场窄边与刻度 |
| `--guess-accent: #d8f36a` | `#c9dd83` | 模一把强调 |
| `--guess-hit: #b9e6b5` | `#a1c58e` | 命中指示；其上文字用深字或独立状态文字角色 |
| `--guess-near: #e8cf7c` | `#dfbf7a` | 接近指示，保留黄绿区分 |
| `--guess-miss: #34443c` | `#30322f` | 未命中底；不能作为灰色小字 |
| `--guess-line: #36473c` | `#45443f` | 游戏格装饰线 |
| `--obs-paper: #e6e8df` | `#191918` | 历史样式仍被加载，残余生效面也需要覆盖 |
| `--obs-ink: #26372d` | `#0d0d0c`（面）/ `#ecebe6`（字） | 拆分角色 |
| `--obs-line: #b9c1af` | `#3b3a36` | 装饰线 |
| `--archive-paper: #e8ece3` | `#1e1e1c` | 题库档案面 |
| `--archive-muted: #626e5a` | `#aaa79e` | 档案次级字 |
| `--archive-line: #bac3b0` | `#3b3a36` | 档案装饰线 |
| `--team-soft` 的 A / B 分支 | `#e8aa9f` / `#b5d9e1` | 从根阵营柔和色引用 |
| `app/prompt-library.tsx` 的 `--cover-bg` 原色数组 | 每项转为具名封面衬底角色，ink 使用 `#30302c` 或 `#191918` | JSX 里的九处颜色字面量也纳入迁移；原截图像素与各纸面衬底原值保留 |

`--team`、`--duel-red/blue`、`--home-team`、`--acid-c` 继续引用对应阵营 / 强调角色。`--duel-pad/cut`、粒子 `--px/py/d` 不依赖主题。

### 1.5 新增的表面配套角色

| 角色 | paper | ink | 目的 |
| --- | --- | --- | --- |
| 弹窗遮罩 | 保留各弹窗当前值，抽成独立令牌 | `rgb(0 0 0 / 64%)` | 背景退后；只动遮罩本身，表单文字不淡入 |
| 截图衬底 / 边线 | 保留各视口当前值 | `#30302c` / `#66665e` | 用现有视口的背景、内轮廓和外框缓冲亮图；不改作品尺寸、缩放与校准 |
| 大弹层阴影 | 原硬阴影值 | `0 12px 32px rgb(0 0 0 / 40%), 0 0 0 1px rgb(236 235 230 / 8%)` | 克制的悬浮感，避免白色光晕 |
| 滚动条轨道 / 拇指 | 保留现值，未定制处遵循 light UA | `#191918` / `#79796f` | 同步 `color-scheme: dark`，兼容原生控件 |
| 选区底 / 字 | `#d9fb51` / `#1c2423` | `#c9dd83` / `#192020` | 文本可辨，不以米白字压浅绿底 |
| 墨色装饰网格 / 边缘 | 对应当前纸面纹理各值 | `rgb(236 235 230 / 4%)` / `rgb(201 221 131 / 16%)` | 低反差材质，不在整个视口上动态重绘噪声 |

真实对战作品按原色展示，亮度缓冲来自视口外衬底与边框；不对 A / B 设置不同滤镜。静态截图、封面和分享图同样先用现有容器的衬底方案，实施阶段逐页目检。浏览器导出的分享 PNG 与静态 OG 是内容产物，其版式配色单独保留；主题覆盖的是分享弹窗及预览衬底，不在本任务中更改导出卡片设计。

### 1.6 对比度证据与浅色回归的一处取舍

对比度按 sRGB 线性化相对亮度计算；以上数值都是不透明色对，透明层还需在真实页面合成后复核。墨色正文 `#ecebe6` 对页面底为 15.70:1，对最亮普通面 `#272724` 为 12.55:1；次级字与状态字均超过 4.5:1。

**现有纸面已经存在不达标组合**：`#5b655f` 对 `#d9ddda` 为 4.41:1，`#71806b` 对 `#dfe3dd` 为 3.23:1。后一色可见于 `.field-meta`、`.reaction-caption` 的源码，是否被后加载样式覆盖仍需实页确认。故不能同时承诺所有纸面文字色绝对不变、以及所有正文都达到 4.5:1。

推荐确认的例外：纸面布局、主要三色及材质维持原值，**仅对实测不足 4.5:1 的信息性小字**调整到通过对比度的现有深档或更深少许的语义字色；`#59635d` 是次级字候选，实施时按实际底色选择。纯装饰刻度可保留原弱色。该例外在方案确认前不落代码。

## 2. 动画盘点：四类清单

完整 CSS 清单见本文末自动核对的附表：**18 份可达项目 CSS，73 个关键帧定义，130 处 animation / animation-name 声明，127 处 transition / transition-property 声明**。后两项包括 `none` 与 reduced-motion 覆盖声明；不能把它们直接相加当成独立动画数量。另检出 1196 处含颜色字面量的声明，包括根令牌定义，不能把全部都算成违规页面颜色。

“可达”指主入口导入图加载，不代表其中每个历史选择器都在当前页面命中。`observatory.css` 保留的历史规则与三版主页一并盘点；不用这个任务清理整个旧版架构。

四类互斥记录每个 CSS 关键帧的主要处理方式：

- **纸面专用**：小图章、卡牌装饰、纸片揭幕等，保留纸面语言；墨色换为边线、墨面遮揭或短暂亮度呼吸。
- **中立保留**：小图标、状态点、加载条、无文字图形或单纯色彩反馈；只换颜色来源并补齐 reduced-motion。
- **需删除**：删除旧的文字容器入场轨道或无用定义，页面内容与功能保留。包括 `text-enter`、`lobby-rise`、`next-rise`、`guess-enter`、账户表单入场、题库正文入场等；表现需求移交背景 / 小元素。
- **重新设计**：承担就绪、页面切换、发牌、弹窗等关键语义的动画；保留状态与时机，换成两主题独立装饰层。旧的文字 opacity / transform 用法随之移除。

### 2.1 CSS 之外必须纳入的动效

| 来源 | 分类 | 处理方案 |
| --- | --- | --- |
| `lib/game-transitions.ts`：`frame / bands / convoy / deal / folio / match` 六种 WAAPI 过场 | 重新设计 | 保留覆盖、换路由、就绪、退出与销毁协议；动画轨道按主题选取。大段标题 / 文案从移动父层中分离为静止层，只有无字幕片、线条与小装饰移动 |
| `lib/ui-transitions.ts`：`wipeNavigate` | 重新设计 | 纸面硬扫、墨色墨边扫；文字留在固定坐标；盖满才换路由 |
| 同文件：`SurfaceTransition`（开发面板实际使用） | 需删除旧文字轨道 | root 淡入、panel 位移改为遮罩 / 装饰面过渡，保留可打断与回调只执行一次 |
| `lib/library-motion.ts`：`revealLibrary` | 需删除旧文字轨道 | 当前会移动题库标题、题解和正文块；正文直接稳定排版，背景边线分段显现 |
| `app/page.tsx`：intro A / B 聚焦轨道 | 重新设计 | 大文本作品与承载文字的外壳不缩放 / 淡入；图像展示的移动限定到媒体层，聚焦由边框、遮面与现有巡览节奏表达 |
| `app/ranking.tsx`：整行入场与分数入场 | 需删除整行轨道；小数字中立保留 | 行文字固定，序号标识或底线错峰；分数只保留必要的小范围反馈 |
| `app/ranking.tsx`：档案卡 wipe | 纸面专用 | 纸面为抹片，墨色为深墨遮条；继续只在盖住名字时更换数据 |
| `app/ranking.tsx`：雷达图 rAF | 中立保留 | 只插值图形与顶点，标签坐标固定；减少动态效果立即落值 |
| `lib/decryption.ts`：身份逐行解密 | 中立保留 | 方法本身只移动遮条，不移动正文；深色遮条使用独立材质令牌，保留身份专属高光 |
| `lib/text-swap-mask.ts`：换题行遮条 | 纸面专用 | 纸色遮条换成主题所属不透明面；墨色收束方向与节拍另配；不得误改为正文透明度切换 |
| `app/home.tsx`：指针视差 | 重新设计 | 只作用于展示装饰 / 媒体，移出含大文本的祖先层；无悬停设备与 reduced-motion 直接静止 |
| `lib/arena-scroll.ts`、`lib/scroll-tour.ts` | 中立保留 | 原生滚动与作品巡览，不用来代替文本容器入场；保留取消与 reduced-motion |
| `components/rolling-label.tsx` 与排行榜现有 rolling-number | 中立保留（小元素） | 复用已有包，不加新依赖；检查实时 reduced-motion 更新，禁用文字 motionBlur，姓名长度变化不推动整页 |
| `components/ui/dialog.tsx` + `tw-animate-css` 工具类 | 需删除内容容器淡入 / zoom | 遮罩可独立淡入；弹窗正文静止。组件卸载时机仍正确，不依赖被删除的内容 animationend |
| `components/ui/button.tsx` 的 `transition-all` | 重新设计 | 改成明确的颜色 / 边框 / 小图标属性，避免切主题误带尺寸与排版动画 |
| `components/ui/textarea.tsx` 的颜色过渡 | 中立保留 | 颜色令牌化，覆盖 reduced-motion 与新 dark 变体 |
| `lib/placeholder.ts`：`ph-grow / ph-spin / ph-blink` | 中立保留 | 这是项目生成的占位作品 iframe 动画，补它自己的减少动态效果；不把宿主主题注入真实第三方作品 |

`components/ui/tabs.tsx` 不在本次主入口 import 图内；其 `transition-all` 留在同模式待改清单，不冒称已经生效或已经改造。

### 2.2 关键节点的两套语言

| 节点 | paper | ink |
| --- | --- | --- |
| 首页 / 页面内容出现 | 小刻度对齐、边线短促画入；正文直接落位 | 背景局部提亮后回落、边线慢半拍显现；正文固定 |
| `frame` 进入玩法菜单 | 无字纸面合拢，四角机械归位 | 暖黑面覆盖，四条细墨边由外向内收束 |
| `bands` 进 / 出排行榜 | 色带交错；大字固定，用带遮揭 | 两条暗墨带掠过，低饱和酸绿细线短暂留痕 |
| `convoy` 进入题库 / 桌面对战 | 纸边与阵营色边一起推进 | 暖黑墨面推进，边缘留窄幅墨痕；无全文缩放 |
| `deal` 进入模一把 | 无字卡背利落发出、双片分开；七个小线索依次就位 | 墨面先铺开，七个细点短促点亮，窄边退开露出固定文字 |
| `folio` 模一把选择 ↔ 游戏 | 纸片按前进 / 返回方向滑动 | 墨面按相同方向收束与展开，幅度更克制 |
| `match` 换对局 | 双页合拢，A / B 进度条仍按各侧就绪填充 | 双块墨面闭合，边缘极轻呼吸；就绪后整段退开，直接落成品 |
| 对战锁定 / 结果 | 小印章落定、判定线划入、身份遮条解密 | 边框短暂加深、印记显现、墨条退开；结果文案不动 |
| 模一把格子反馈 | 格子上的独立纸条揭开；文字不做 3D 翻转 | 墨色遮条收短，命中 / 接近色显现；语义仍为绿 / 黄 / 灰 |
| 表单 / 成功提示 / 弹窗 | 背后的装饰纸层小幅位移，前景字固定 | 背景面与窄边逐步到位，前景字固定 |
| 排行换模型 / 题库选题 | 原位置遮揭、序号与小线条错峰 | 同位置墨条遮揭、底线留痕；不整行平移 |

现有“盖满才换稿、作品就绪后才退出、可取消 / 可中断、reduced-motion 仍遵守加载门控”的不变量保持。最新 `app/page.tsx` 中等待作品已是 `while (!poll())`，不得按旧交接里的 8 秒兜底描述恢复提前揭幕。视觉节拍与就绪条件分开设计。

## 3. 标志性主题切换：两个候选

### A · 过墨 / 揭纸（推荐）

点击导航里的纸 / 墨刻度按钮后，一道窄墨边从按钮所在侧起笔，带出一块不透明的材质幕片。纸 → 墨时边缘略有干刷齿口，整块暖黑面掠过；墨 → 纸时方向反转，像把覆纸抽开。幕片盖满的短暂平台期切换主题，随后露出完整的新材质；窄酸绿刻度在边缘落一下，形成识别点。

候选节拍：纸 → 墨 240ms 覆盖 + 160ms 材质落定 + 260ms 揭开；反向 210 + 140 + 230ms。首个反馈为按钮里不超过 16px 的刻度位移；不等待整段结束才响应用户。最终节拍在对照页上磨，不写成状态逻辑常量。

实现预算：一个无字、不透明的幕片与一个窄边装饰，主要只动 transform；齿口与纹理预先静态绘制，避免每帧生成噪声、SVG 模糊或整屏滤镜。不截图 / 复制整页，不给 `html/body/#root` 建文本淡入层。大面颜色在遮挡下落到目标值，视觉连续性由幕片保证；暴露的小控件色彩过渡控制在 120–180ms，并仅在切换窗口内启用。

### B · 双页合印

上下两片无字材质面向中线合拢，窄刻度缝对齐后切换主题；纸面为硬直角和轻微错位，墨面为更慢的收束和边线余韵。退出时从中缝打开新界面。它与现有对战双页幕有亲缘，整站一致性更强，但第一次切换的独特性弱于 A。

实现预算：两片纯装饰层，共用一个时钟；盖满处留 1px 重叠避免分数像素缝。与 A 使用同一主题状态与清理协议。预计约 600–720ms；不叠加全屏毛玻璃。

两者的共同退化：`prefers-reduced-motion` 下直接切换最终主题，无扫动与呼吸；系统自动变化 / 跨标签同步只做简短颜色更新，不抢用户注意。页面隐藏或动画被取消时完成清理并落到最后一次有效选择。连续点击只保留最后意图，不堆叠幕片；若已有路由幕运行，等其安全退出再执行主题幕，避免两层互相遮挡或换题暴露加载。

低端设备流畅度是实施后要验证的目标，不能用“只用了 transform”代替实测。验收至少覆盖桌面、窄屏、高 DPR 与 CPU 降速，记录最长帧、布局次数和文字静止区域的前后帧。

## 4. 主题系统与性能约束

- 启动内联脚本放在首屏样式 / 模块执行之前：只接收 `paper` / `ink` 有效存储值；无值时读取系统，写根 `data-theme` 与 `color-scheme`；localStorage 不可用时正常按系统启动。首次加载不开主题动画。
- `lib/theme.ts` 维护“偏好来源”和“实际主题”：手选存 `aob-theme`；只有偏好来源为系统时才响应 `matchMedia` 的 change。提供“跟随系统”选项时清除手选值；`storage` 事件同步其他标签。存储失败时本页仍保留用户手选状态。
- 导航控件使用原生 button，外观为直角刻度开关，主动作在纸 / 墨间切换；附属菜单列“跟随系统 / 纸面 / 墨色”。Enter / Space 可操作，菜单键盘与 Escape 返回焦点；语义包含当前主题及来源，触摸热区至少 44px。各页已有导航只插入控件，不重写导航结构。
- 浏览器地址栏 `theme-color`、原生表单、滚动条、选区同步主题。JS 在样式就绪后读取根颜色角色更新 meta，避免页面组件各存一套颜色。
- 参考后台的优点是角色令牌和明确属性的控件过渡。当前后台按 gallery / arena 默认主题并分别持久化，不是系统偏好跟随，不能原样搬入；其 380ms block 过渡也不能扩展成全站 `* { transition: all }`。
- 展览馆现有 `.page` 的 opacity / translate 入场、View Transitions 的整页交叉淡化不纳入本方案：本任务的文字稳定性约束要求从背景层实现材质过渡。全屏滤镜、长驻 will-change、整页纹理位移都不作为默认实现。
- JS 与 CSS 都响应实时 reduced-motion：运行中改为 reduce 立即结束装饰轨道，但保留必要的作品就绪等待。界面可见性 / 清理不依赖某个已关闭的 animationend；requestAnimationFrame、定时器与 WAAPI 在卸载时释放。

## 5. 文件改动计划（方案确认后执行）

以下为预计触及行数（新增 / 修改合计，不是最终 diff 统计）；先做主题切换对照页与不变量，再接真实页面。只改当前任务直接涉及的文件。

| 文件 | 预计行数 | 目的 |
| --- | ---: | --- |
| `index.html` | 20–35 | 首屏主题引导、meta 与无 FOUC |
| 新 `lib/theme.ts` | 140–210 | 偏好优先级、订阅、跨标签与降级 |
| 新 `lib/theme-transition.ts` | 130–200 | A / B 候选中的确认版本；不透明幕片与安全清理 |
| 新 `components/theme-toggle.tsx` | 70–110 | 可访问的导航开关与系统选项 |
| `src/main.tsx` | 8–15 | 初始化订阅与样式接入 |
| `app/globals.css` | 480–720 | 集中双主题令牌、兼容别名、选择区 / 焦点 / 阴影 / 遮罩；移除正文入场 |
| `app/game-transitions.css` + `lib/game-transitions.ts` | 250–420 + 150–250 | 六种过场双主题装饰层与轨道，不改变就绪门控 |
| `lib/ui-transitions.ts`、`lib/library-motion.ts` | 80–150 + 30–60 | 可打断面板、横扫与题库正文的稳定呈现 |
| `lib/text-swap-mask.ts`、`lib/decryption.ts` | 15–40 / 文件 | 主题材质与减少动态效果衔接；逐行测量算法保留 |
| `app/page.tsx` | 70–120 | 媒体 / 文字聚焦分层、结果接力与主题控件 |
| `app/account.css` + `components/account.tsx` | 160–250 + 15–40 | 新邮箱流程所有状态、装饰纸层、Turnstile 明暗参数 |
| `app/guess.css` + 必要的 `app/guess.tsx` 接点 | 180–280 + 15–30 | 反馈语义色、发牌 / 揭格、结果与加载 |
| `app/ranking.css` + `app/ranking.tsx` | 180–280 + 40–80 | 档案、雷达、行入场、数值动效 |
| `app/home.css` / `home-next.css` / `home-duel.css` | 每份 90–160 | 三版首页令牌化与无正文抖动入场 |
| `app/arena-refinement.css` | 160–230 | 消除后加载的纸色覆盖、判定窗与结果动效 |
| `app/prompt-archive.css` / `library.css` | 100–170 / 50–90 | 档案与题库空态、封面与筛选 |
| `app/prompt-library.tsx` | 20–40 | 内联封面底色转根令牌，题库内容 / 装饰层的接点 |
| `app/share.css`、`app/dev.css`、`app/observatory.css` | 60–100 / 35–65 / 180–260 | 分享预览、开发面板、仍被导入的历史规则适配 |
| `app/conversation-arena.css`、`components/fixed-html-work.css`、`components/beta-notice.css` | 每份 10–30 | 文字作品 / iframe 的衬底与初次提示 |
| `components/ui/dialog.tsx`、`button.tsx`、`textarea.tsx`、`components/rolling-label.tsx` | 每份 10–30 | 工具类动效与主题角色衔接，不修改第三方包 |
| 三版主页、菜单、活动页、题库 / 预览、排行、竞猜等导航所在 TSX | 每份 3–8 | 在现有导航插入同一个控件；与上列交叉计数 |
| `lib/placeholder.ts` | 6–12 | 项目占位 iframe 的 reduced-motion |
| 新 `scripts/check-theme.mjs`、`scripts/check-theme-motion.mjs` | 140–220 / 120–200 | 偏好状态、颜色角色、不动正文、取消与清理不变量 |
| 现有 `scripts/check-*.mjs` 中相关动效脚本 | 合计 100–180 | 覆盖纸 / 墨两套；更新旧的整容器合成动画断言，保留盖满 / 就绪 / 生命周期约束 |
| 新 `reference/theme-review.html` + 必要的 review 脚本 | 160–240 + 80–140 | 先磨标志性切换，逐帧与减弱动画对照 |
| 现有 game-transitions / wipe / surface / account 调参页 | 合计 100–200 | 增加双主题与长任务 / 打断场景，复用既有工具 |
| `package.json` | 2–4 | 接入自有检查命令，依赖区不变 |
| `docs/ARCHITECTURE.md`、`docs/PRODUCT.md`、`HANDOFF.md` | 合计 60–110 | 在实现完成后更新真实行为与验证结果 |

`app/spatial-fonts.css` 只含字体资源，无颜色 / 动效，本次无需修改。没有为每个颜色新造组件，也不重排整个 CSS 文件。

**同模式待改清单**：未被主入口加载的 `components/ui/tabs.tsx`；两个独立 design-kit 的演示组件与 `dk-*` / `pdk-reveal` 动画；旧 `app/admin/` 与 `src/admin.tsx`；独立截图入口 `src/work-capture.css`；`reference/`、`prototypes/`、`standalone/` 中不用于本轮验证的历史演示。通用改法是同样拆面 / 字角色、根主题继承、只让装饰层移动、显式 reduced-motion；本轮不逐个交付或整理这些独立产物。真正上线的共享后台属于另一仓库，保持参考身份。

第二段交付将提供新增 CSS 全量、已有文件 diff，以及逐页 × 双主题的人工验收清单。验收矩阵会覆盖首次加载 / 刷新 / 系统变化 / 手选 / 恢复系统 / 存储异常 / 跨标签，三版首页、对战全生命周期、模一把、排行、题库、账户全状态、分享和弹窗；还会核对窄屏导航、键盘焦点、正文对比度与真实作品就绪期间的完整遮挡。

## 6. 完整静态盘点附表

以下表格由本轮主入口依赖图和 CSS AST 生成，分类为人工审阅的方案判断。统计脚本 / 原始 JSON 位于忽略目录 `.local/theme-audit/`；附表本身随本方案保存，后续可直接逐项对照。源码行号固定对应 `38dad57`，实施后会移动。

<!-- audit-tables:start -->

### 6.1 文件覆盖表

| 可达 CSS | 行数 | 关键帧 | animation 声明 | transition 声明 | 含颜色字面量的声明 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `app/account.css` | 726 | 4 | 7 | 14 | 83 |
| `app/arena-refinement.css` | 877 | 9 | 19 | 5 | 111 |
| `app/conversation-arena.css` | 45 | 0 | 0 | 0 | 3 |
| `app/dev.css` | 197 | 0 | 0 | 1 | 23 |
| `app/game-transitions.css` | 810 | 1 | 1 | 1 | 74 |
| `app/globals.css` | 3731 | 18 | 31 | 29 | 237 |
| `app/guess.css` | 1650 | 6 | 15 | 11 | 141 |
| `app/home-duel.css` | 723 | 7 | 8 | 8 | 24 |
| `app/home-next.css` | 982 | 4 | 4 | 9 | 63 |
| `app/home.css` | 960 | 7 | 13 | 11 | 62 |
| `app/library.css` | 393 | 0 | 0 | 3 | 28 |
| `app/observatory.css` | 1375 | 7 | 12 | 9 | 141 |
| `app/prompt-archive.css` | 871 | 3 | 6 | 9 | 27 |
| `app/ranking.css` | 1141 | 7 | 12 | 13 | 141 |
| `app/share.css` | 285 | 0 | 1 | 1 | 37 |
| `app/spatial-fonts.css` | 755 | 0 | 0 | 0 | 0 |
| `components/beta-notice.css` | 79 | 0 | 1 | 3 | 0 |
| `components/fixed-html-work.css` | 36 | 0 | 0 | 0 | 1 |

以下每个关键帧只归一类；同一动画的所有 CSS 使用选择器列在对应行。未命中的历史选择器仍列出，不据此声称其正在屏幕上播放。

### 6.2 纸面专用（13 个关键帧）

| 动画定义 | 使用选择器 | 拟处理方式 |
| --- | --- | --- |
| `account-stamp` · [app/account.css:637](../app/account.css#L637) | `.account-stamp` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `stamp-in` · [app/globals.css:2133](../app/globals.css#L2133) | `.chosen-stamp` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `guess-float` · [app/guess.css:1265](../app/guess.css#L1265) | `.guess-card-stack`；`.guess-loading-symbol` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `guess-uncover` · [app/guess.css:1284](../app/guess.css#L1284) | `.guess-row.is-new .gcell:after` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `duel-pop` · [app/home-duel.css:517](../app/home-duel.css#L517) | `.duel-vs` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `next-vs` · [app/home-next.css:645](../app/home-next.css#L645) | `.next-versus` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `lobby-underline` · [app/home.css:558](../app/home.css#L558) | `.lobby-word::before` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `lobby-sticker` · [app/home.css:586](../app/home.css#L586) | `.lobby-versus` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `obs-transfer` · [app/observatory.css:707](../app/observatory.css#L707) | `.observatory-leaving .obs-transfer` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `obs-stamp` · [app/observatory.css:1123](../app/observatory.css#L1123) | `.experience-new .chosen-stamp` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `archive-shutter` · [app/prompt-archive.css:642](../app/prompt-archive.css#L642) | `.archive-cover-shutter` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `rank-row-flash` · [app/ranking.css:269](../app/ranking.css#L269) | `.rank-board .rank-row.first .rank-row-flash` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |
| `rank-wipe-in` · [app/ranking.css:521](../app/ranking.css#L521) | `.rank-panel-wipe` | 纸面保留小装饰 / 遮片动作；墨色换成收束边线或墨条，配色来自主题角色。 |

### 6.3 中立保留（25 个关键帧）

| 动画定义 | 使用选择器 | 拟处理方式 |
| --- | --- | --- |
| `verdict-scan` · [app/arena-refinement.css:856](../app/arena-refinement.css#L856) | `.audience-verdict::before` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-glint` · [app/arena-refinement.css:857](../app/arena-refinement.css#L857) | `.audience-verdict::after` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-count-left` · [app/arena-refinement.css:858](../app/arena-refinement.css#L858) | `.verdict-count` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-count-right` · [app/arena-refinement.css:859](../app/arena-refinement.css#L859) | `.verdict-count-right` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-fill` · [app/arena-refinement.css:860](../app/arena-refinement.css#L860) | `.verdict-bar:not(.is-empty)` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-pulse-left` · [app/arena-refinement.css:861](../app/arena-refinement.css#L861) | `.verdict-loader i` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-pulse-right` · [app/arena-refinement.css:862](../app/arena-refinement.css#L862) | `.verdict-loader i:last-child` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `shutter-progress` · [app/globals.css:1245](../app/globals.css#L1245) | `.shutter-progress i.is-pending::before` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `button-ready` · [app/globals.css:2068](../app/globals.css#L2068) | `.phase-voting .vote-button`；`.phase-voting .vote-draw` | 小按钮反馈保留；背景与图标优先，正文容器不受牵连。 |
| `status-pulse` · [app/globals.css:2078](../app/globals.css#L2078) | `.field-status i` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `loading` · [app/globals.css:2083](../app/globals.css#L2083) | `.load-track::after` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `vote-pending` · [app/globals.css:2092](../app/globals.css#L2092) | `.arena-shell.works-hold .vote-button.is-pending::before` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `equalize` · [app/globals.css:2143](../app/globals.css#L2143) | `.equalizer i` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `refresh-spin` · [app/globals.css:3257](../app/globals.css#L3257) | `.channel-heading button:disabled svg` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `reaction-pop` · [app/globals.css:3428](../app/globals.css#L3428) | `.reaction-chip.is-picked .reaction-icon` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `reaction-burst` · [app/globals.css:3463](../app/globals.css#L3463) | `.reaction-bar.is-bursting .reaction-chip.is-picked .reaction-dots i` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `verdict-line` · [app/globals.css:3554](../app/globals.css#L3554) | `.arena-shell.phase-locking .is-chosen .work-panel::after`；`.phase-result .is-chosen .work-panel::after` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `guess-spin` · [app/guess.css:1289](../app/guess.css#L1289) | `.guess-spinner` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `duel-scroll` · [app/home-duel.css:535](../app/home-duel.css#L535) | `.duel-ticker-track` | 单行装饰 ticker 不作为正文入场；减少动态效果时静止。 |
| `lobby-image-drift` · [app/home.css:604](../app/home.css#L604) | `.lobby-art > img` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `lobby-fingerprint` · [app/home.css:806](../app/home.css#L806) | `.lobby-entry > svg:first-child` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `obs-load` · [app/observatory.css:928](../app/observatory.css#L928) | `.obs-loading::after` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `archive-cover-in` · [app/prompt-archive.css:650](../app/prompt-archive.css#L650) | `.archive-cover-drift` | 只移动封面图层；标题与档案正文留在固定层。 |
| `rank-status-dot` · [app/ranking.css:588](../app/ranking.css#L588) | `.rank-panel-live::before` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |
| `rank-status-line` · [app/ranking.css:596](../app/ranking.css#L596) | `.rank-panel-name::after` | 保留小元素 / 媒体装饰的运动语义；颜色令牌化并响应实时 reduced-motion。 |

### 6.4 需删除（20 个关键帧）

| 动画定义 | 使用选择器 | 拟处理方式 |
| --- | --- | --- |
| `account-page-turn` · [app/account.css:551](../app/account.css#L551) | `.account-page` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `account-page` · [app/account.css:617](../app/account.css#L617) | `.account-fields` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `account-ink` · [app/account.css:627](../app/account.css#L627) | `.account-fields > *` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `text-enter` · [app/globals.css:2058](../app/globals.css#L2058) | `.arena-shell.phase-result .side-result`；`.arena-shell.phase-result .reaction-bar`；`.arena-shell .prompt-recall`；`.arena-shell .round-console.show-result`；`.briefing h2`；`.loading-skip`；`.side-result`；`.result-console`；`.match-commentary`；`.comment-entry`；`.prompt-disclosure[open] p`；`.reaction-bar`；`.prompt-recall`；`.phase-result .side-result` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `channel-unfold` · [app/globals.css:3245](../app/globals.css#L3245) | `.arena-shell .afterparty-reveal`；`.afterparty-reveal` | 移除 opacity / transform；折叠布局语义保留，背景与小边线承担出现感。 |
| `guess-enter` · [app/guess.css:1245](../app/guess.css#L1245) | `.guess-hero-copy`；`.guess-art`；`.guess-console`；`.guess-turn strong`；`.guess-row.is-new .gcell-name`；`.guess-result.is-fresh`；`.guess-difficulty` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `guess-menu` · [app/guess.css:1255](../app/guess.css#L1255) | `.guess-suggest` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `duel-lift` · [app/home-duel.css:479](../app/home-duel.css#L479) | `.duel-line > span` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `duel-rise` · [app/home-duel.css:487](../app/home-duel.css#L487) | `.duel-hero-side` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `next-rise` · [app/home-next.css:617](../app/home-next.css#L617) | `.next-copy` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `next-mark` · [app/home-next.css:637](../app/home-next.css#L637) | 未发现 CSS 调用 | 无 CSS 引用；删除前复核动态调用，避免借机清理其他历史规则。 |
| `lobby-rise` · [app/home.css:548](../app/home.css#L548) | `.lobby-eyebrow`；`.lobby h1`；`.lobby-description`；`.lobby-entry-wrap`；`.lobby-format-switch`；`.lobby-preview-note` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `obs-rise` · [app/observatory.css:675](../app/observatory.css#L675) | `.obs-heading`；`.obs-document`；`.experience-menu`；`.experience-new .phase-result .afterparty`；`.experience-new .phase-voting .versus-spine` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `obs-file-in` · [app/observatory.css:685](../app/observatory.css#L685) | `.obs-file` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `obs-copy-in` · [app/observatory.css:695](../app/observatory.css#L695) | `.obs-file-content`；`.obs-file-prompt` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `obs-page-in` · [app/observatory.css:712](../app/observatory.css#L712) | `.experience-new .rank-page, .experience-new .arena-shell` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `archive-heading-in` · [app/prompt-archive.css:632](../app/prompt-archive.css#L632) | `.archive-heading-copy`；`.archive-summary` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `rank-panel-slide-in` · [app/ranking.css:532](../app/ranking.css#L532) | `.rank-panel-header`；`.rank-panel-name` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `rank-fade-in` · [app/ranking.css:542](../app/ranking.css#L542) | `.rank-radar-wrap`；`.rank-panel-note`；`.rank-panel-caption` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |
| `rank-fade-up` · [app/ranking.css:550](../app/ranking.css#L550) | `.rank-radar-legend`；`.rank-panel-foot > div` | 删除大文字容器上的旧入场轨道；文字直接呈现，改动背景或小装饰。 |

### 6.5 重新设计（15 个关键帧）

| 动画定义 | 使用选择器 | 拟处理方式 |
| --- | --- | --- |
| `verdict-arrive` · [app/arena-refinement.css:854](../app/arena-refinement.css#L854) | `.audience-verdict` | 浮动判定文字保持固定坐标，背景 / 边线出现；移除整块缩放与裁切。 |
| `verdict-leave` · [app/arena-refinement.css:855](../app/arena-refinement.css#L855) | `.audience-verdict.is-leaving` | 移除整块文字的 blur / 缩放；装饰层退出后按状态移除浮层。 |
| `gt-hold-pulse` · [app/game-transitions.css:177](../app/game-transitions.css#L177) | `.game-transition[data-gt-hold] .gt-match-holdnote` | 呼吸从等待文案移到小状态点；文案保持稳定可读。 |
| `work-reveal` · [app/globals.css:910](../app/globals.css#L910) | `.arena-shell.works-reveal .work-panel`；`.arena-shell.works-reveal .briefing .round-tag` | 同一动画既作用于作品面板又作用于小标签；拆开作用目标，文字作品禁止整体淡入。 |
| `overlay-clear` · [app/globals.css:2101](../app/globals.css#L2101) | `.loading-overlay.is-clearing` | 只让不含正文的遮面变化；加载文案不随整层淡出。 |
| `shutter-cover` · [app/globals.css:2107](../app/globals.css#L2107) | `.phase-transition .transition-shutter` | 原为大面积 clip-path；改成纯装饰遮面轨道，保持盖满再换稿。 |
| `shutter-exit` · [app/globals.css:2115](../app/globals.css#L2115) | `.arena-shell.shutter-exit .transition-shutter` | 原为大面积 clip-path；仅就绪后退出，不能靠固定时长提前揭幕。 |
| `lock-in` · [app/globals.css:2123](../app/globals.css#L2123) | `.lock-announcement` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |
| `guess-tile` · [app/guess.css:1274](../app/guess.css#L1274) | `.guess-row.is-new .gcell` | 格子文字固定，由独立遮条揭开，保留逐格反馈顺序。 |
| `duel-from-left` · [app/home-duel.css:497](../app/home-duel.css#L497) | `.duel-side-a` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |
| `duel-from-right` · [app/home-duel.css:507](../app/home-duel.css#L507) | `.duel-side-b` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |
| `duel-fade` · [app/home-duel.css:527](../app/home-duel.css#L527) | `.duel-side-work` | 媒体与文字分层；仅图像装饰允许轻变化，文字作品不淡入。 |
| `next-panel` · [app/home-next.css:627](../app/home-next.css#L627) | `.next-artwork` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |
| `lobby-card-a` · [app/home.css:566](../app/home.css#L566) | `.lobby-exhibit` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |
| `lobby-card-b` · [app/home.css:576](../app/home.css#L576) | `.lobby-exhibit-b` | 两主题分别设计纯装饰 / 媒体轨道；保留功能与状态节点，文字层稳定。 |

### 6.6 全部 transition 声明（127 处）

纯颜色过渡也计入，媒体查询中的覆盖规则保留原位置；分类针对属性与使用目标，不把 transform 一概判为违规。需删除项限于危险轨道，不删除对应功能。

| 位置 / 选择器 | 当前过渡属性 | 分类 | 拟处理方式 |
| --- | --- | --- | --- |
| [app/account.css:39](../app/account.css#L39) · `.account-dialog[data-slot='dialog-content']` | `opacity 0.32s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)` | 需删除 | 删除文字祖先层的淡入 / 位移 / 模糊过渡，背景独立处理。 |
| [app/account.css:51](../app/account.css#L51) · `.account-overlay[data-slot='dialog-overlay']` | `opacity 0.32s ease` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:63](../app/account.css#L63) · `.account-paper` | `transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)` | 纸面专用 | 只动装饰纸层；墨色改边线与接触阴影。 |
| [app/account.css:95](../app/account.css#L95) · `.account-sheet` | `height 0.42s cubic-bezier(0.22, 1, 0.36, 1), clip-path 0.6s cubic-bezier(0.22, 1, 0.36, 1)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/account.css:234](../app/account.css#L234) · `.account-modes button` | `background 0.25s, color 0.25s, translate 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:297](../app/account.css#L297) · `.account-form input` | `background 0.2s, border-color 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:334](../app/account.css#L334) · `.password-field button` | `color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:369](../app/account.css#L369) · `.account-link` | `color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:396](../app/account.css#L396) · `.account-code-send` | `background 0.2s, color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:445](../app/account.css#L445) · `.account-email-action` | `background 0.2s, color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:464](../app/account.css#L464) · `.account-submit` | `transform 0.2s, box-shadow 0.2s, background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:482](../app/account.css#L482) · `.account-submit::after` | `width 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/account.css:529](../app/account.css#L529) · `.account-dialog > [data-slot='dialog-close']` | `transform 0.25s, background 0.25s` | 需删除 | 删除文字祖先层的淡入 / 位移 / 模糊过渡，背景独立处理。 |
| [app/account.css:723](../app/account.css#L723) · `.account-dialog[data-slot='dialog-content'], .account-overlay[data-slot='dialog-overlay'], .account-dialog *` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/arena-refinement.css:407](../app/arena-refinement.css#L407) · `.arena-shell .tour-toggle .tour-switch::after` | `transform 0.2s var(--ease-out), background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/arena-refinement.css:743](../app/arena-refinement.css#L743) · `.arena-shell .result-board-link` | `color .2s, border-color .2s, transform .2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/arena-refinement.css:753](../app/arena-refinement.css#L753) · `.arena-shell .next-button, .arena-shell .next-button.next-topic` | `background .2s, transform .2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/arena-refinement.css:754](../app/arena-refinement.css#L754) · `.arena-shell .next-button > svg` | `transform .2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/arena-refinement.css:776](../app/arena-refinement.css#L776) · `.arena-shell .next-button, .arena-shell .next-button > svg, .arena-shell .vote-draw` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/dev.css:18](../app/dev.css#L18) · `.dev-entry` | `opacity 0.15s ease` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/game-transitions.css:182](../app/game-transitions.css#L182) · `.gt-match-link::after` | `width .45s cubic-bezier(.22, 1, .36, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:287](../app/globals.css#L287) · `.arena-mark` | `transform 0.25s, filter 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:305](../app/globals.css#L305) · `.arena-mark i` | `transform 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:377](../app/globals.css#L377) · `.icon-button` | `color 0.2s, background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:593](../app/globals.css#L593) · `.work-panel` | `box-shadow 0.45s, filter 0.5s, opacity 0.5s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/globals.css:680](../app/globals.css#L680) · `.concept-image` | `transform 1.3s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:739](../app/globals.css#L739) · `.expand-control` | `background 0.25s, color 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:796](../app/globals.css#L796) · `.vote-button` | `transform 0.28s var(--ease-out), background 0.3s, opacity 0.35s, filter 0.35s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:812](../app/globals.css#L812) · `.vote-button::before` | `left 0.6s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:894](../app/globals.css#L894) · `.arena-shell.works-hold .vote-button` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/globals.css:907](../app/globals.css#L907) · `.arena-shell.works-hold .vote-button.is-pending::before` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/globals.css:979](../app/globals.css#L979) · `.vote-draw` | `transform 0.28s var(--ease-out), background 0.3s, color 0.3s, box-shadow 0.28s var(--ease-out), opacity 0.35s, filter 0.35s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1057](../app/globals.css#L1057) · `.versus-spine` | `opacity 0.35s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1243](../app/globals.css#L1243) · `.shutter-progress i.is-done::before` | `transform 0.3s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1467](../app/globals.css#L1467) · `.next-button` | `background 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1484](../app/globals.css#L1484) · `.next-button.next-topic` | `transform 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1547](../app/globals.css#L1547) · `.result-board-link` | `transform 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1617](../app/globals.css#L1617) · `.round-option` | `border-color 0.25s, background 0.25s, transform 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:1722](../app/globals.css#L1722) · `.selector-arrows button` | `background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:2898](../app/globals.css#L2898) · `.arena-stage` | `max-width 0.95s var(--ease-out), gap 0.95s var(--ease-out)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/globals.css:2903](../app/globals.css#L2903) · `.work-viewport` | `height 0.95s var(--ease-out)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/globals.css:2912](../app/globals.css#L2912) · `.phase-result .vote-button` | `height 0.75s var(--ease-out), margin 0.75s var(--ease-out), opacity 0.25s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/globals.css:2924](../app/globals.css#L2924) · `.phase-result .draw-row` | `height 0.75s var(--ease-out), margin 0.75s var(--ease-out), opacity 0.25s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/globals.css:3111](../app/globals.css#L3111) · `.post-comment` | `background 0.2s, transform 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3372](../app/globals.css#L3372) · `.prompt-disclosure-label::after` | `transform .25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3412](../app/globals.css#L3412) · `.reaction-chip` | `background .18s, color .18s, transform .18s, border-color .18s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3495](../app/globals.css#L3495) · `.prompt-recall-head` | `background .2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3520](../app/globals.css#L3520) · `.prompt-recall-chevron` | `transform .25s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3526](../app/globals.css#L3526) · `.prompt-recall-panel` | `grid-template-rows .25s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/globals.css:3533](../app/globals.css#L3533) · `.prompt-recall-inner` | `opacity .25s var(--ease-out), filter .25s var(--ease-out)` | 需删除 | 删除文字祖先层的淡入 / 位移 / 模糊过渡，背景独立处理。 |
| [app/guess.css:301](../app/guess.css#L301) · `.guess-attempts > span` | `background 0.25s, color 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:331](../app/guess.css#L331) · `.guess-input` | `border-color 0.18s, box-shadow 0.18s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:363](../app/guess.css#L363) · `.guess-submit, .guess-primary` | `transform 0.18s, background 0.18s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:381](../app/guess.css#L381) · `.guess-submit svg` | `transform 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:733](../app/guess.css#L733) · `.guess-replay` | `border-color 0.18s, background 0.18s, transform 0.18s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:744](../app/guess.css#L744) · `.guess-replay svg` | `transform 0.35s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:836](../app/guess.css#L836) · `.guess-difficulty-card` | `border-color 0.2s, transform 0.2s, background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:921](../app/guess.css#L921) · `.guess-difficulty-go` | `transform 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:1134](../app/guess.css#L1134) · `.guess-difficulty-chip` | `border-color 0.18s, color 0.18s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/guess.css:1635](../app/guess.css#L1635) · `.guess-page *, .guess-page *:before, .guess-page *:after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/guess.css:1645](../app/guess.css#L1645) · `.guess-reduced .guess-page *, .guess-reduced .guess-page *:before, .guess-reduced .guess-page *:after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/home-duel.css:67](../app/home-duel.css#L67) · `.duel-header nav a::after` | `transform 0.3s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:159](../app/home-duel.css#L159) · `.duel-enter` | `transform 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:164](../app/home-duel.css#L164) · `.duel-enter svg` | `transform 0.25s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:194](../app/home-duel.css#L194) · `.duel-secondary > *` | `color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:221](../app/home-duel.css#L221) · `.duel-side` | `opacity 0.45s var(--ease-out), filter 0.45s var(--ease-out)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/home-duel.css:296](../app/home-duel.css#L296) · `.duel-image` | `transform 1.4s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:430](../app/home-duel.css#L430) · `.duel-stage-foot button` | `background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-duel.css:720](../app/home-duel.css#L720) · `.duel-home *, .duel-home *::before, .duel-home *::after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/home-next.css:75](../app/home-next.css#L75) · `.next-header nav a` | `color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:161](../app/home-next.css#L161) · `.next-discover a` | `background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:175](../app/home-next.css#L175) · `.next-discover a > svg:last-child` | `transform 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:242](../app/home-next.css#L242) · `.next-enter` | `transform 0.25s, box-shadow 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:248](../app/home-next.css#L248) · `.next-enter > svg:last-child` | `transform 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:342](../app/home-next.css#L342) · `.next-artwork` | `transform 0.4s var(--ease-out), box-shadow 0.4s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/home-next.css:393](../app/home-next.css#L393) · `.next-artwork-image > img` | `transform 1.2s var(--ease-out)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:483](../app/home-next.css#L483) · `.next-gallery-bottom button` | `background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home-next.css:979](../app/home-next.css#L979) · `.next-home *, .next-home *::before, .next-home *::after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/home.css:4](../app/home.css#L4) · `.arena-home-link` | `color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:89](../app/home.css#L89) · `.lobby-mark` | `transform 0.25s, box-shadow 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:124](../app/home.css#L124) · `.lobby-small-entry` | `background 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:204](../app/home.css#L204) · `.lobby-entry` | `transform 0.3s, box-shadow 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:214](../app/home.css#L214) · `.lobby-entry::before` | `transform 0.6s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:240](../app/home.css#L240) · `.lobby-entry > svg:last-child` | `transform 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:265](../app/home.css#L265) · `.lobby-format-switch button` | `background 0.25s, color 0.25s, transform 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/home.css:317](../app/home.css#L317) · `.lobby-exhibit` | `transform 0.6s var(--ease-out)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/home.css:756](../app/home.css#L756) · `.lobby-exhibits` | `transform 0.7s var(--ease-out)` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/home.css:853](../app/home.css#L853) · `.lobby *, .lobby *::before` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/home.css:888](../app/home.css#L888) · `.play-classic-item` | `background 0.25s, transform 0.25s, box-shadow 0.25s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/library.css:11](../app/library.css#L11) · `.lobby-library-entry` | `background 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/library.css:121](../app/library.css#L121) · `.prompt-card` | `transform 0.2s, border-color 0.2s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/library.css:332](../app/library.css#L332) · `.prompt-card, .lobby-library-entry` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/observatory.css:138](../app/observatory.css#L138) · `.obs-scene` | `opacity 0.7s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/observatory.css:274](../app/observatory.css#L274) · `.obs-primary` | `transform 0.25s, box-shadow 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:286](../app/observatory.css#L286) · `.obs-primary:before` | `transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:392](../app/observatory.css#L392) · `.obs-index-items > button` | `background 0.35s, transform 0.4s, box-shadow 0.4s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/observatory.css:980](../app/observatory.css#L980) · `.spatial-session > span` | `color 0.4s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:986](../app/observatory.css#L986) · `.spatial-session i` | `width 0.6s, background 0.4s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:1031](../app/observatory.css#L1031) · `.experience-new .vote-button` | `transform 0.3s, box-shadow 0.3s, opacity 0.3s, filter 0.5s, background 0.4s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:1269](../app/observatory.css#L1269) · `.home-enter` | `transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/observatory.css:1320](../app/observatory.css#L1320) · `.play-scene` | `opacity 0.7s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/prompt-archive.css:120](../app/prompt-archive.css#L120) · `.archive-filters button::before` | `transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:206](../app/prompt-archive.css#L206) · `.archive-option` | `border-color 0.25s, background 0.25s, color 0.25s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:218](../app/prompt-archive.css#L218) · `.archive-option::before` | `transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:245](../app/prompt-archive.css#L245) · `.archive-thumb` | `transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:290](../app/prompt-archive.css#L290) · `.archive-option-arrow` | `transform 0.35s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:486](../app/prompt-archive.css#L486) · `.archive-expand svg` | `transform 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:545](../app/prompt-archive.css#L545) · `.archive-enter::before` | `transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:555](../app/prompt-archive.css#L555) · `.archive-enter svg` | `transform 0.4s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/prompt-archive.css:867](../app/prompt-archive.css#L867) · `.prompt-archive *, .prompt-archive *::before, .prompt-archive *::after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/ranking.css:138](../app/ranking.css#L138) · `.rank-tab` | `color 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:156](../app/ranking.css#L156) · `.rank-tab-light` | `transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:166](../app/ranking.css#L166) · `.rank-replay` | `transform 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:191](../app/ranking.css#L191) · `.rank-scope` | `transform 0.2s, box-shadow 0.2s, background 0.2s, color 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:262](../app/ranking.css#L262) · `.rank-row` | `background 0.65s, box-shadow 0.65s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:318](../app/ranking.css#L318) · `.rank-row-top` | `transform 0.22s, box-shadow 0.22s, background 0.35s` | 重新设计 | 检查实际命中场景；大文字层固定，视觉运动放到媒体 / 装饰层，布局变化与入场分开。 |
| [app/ranking.css:335](../app/ranking.css#L335) · `.rank-row-top::before` | `transform 0.65s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:382](../app/ranking.css#L382) · `.rank-sigil` | `transform 0.4s, background 0.65s, border-color 0.65s, box-shadow 0.65s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:450](../app/ranking.css#L450) · `.rank-plus` | `transform 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:913](../app/ranking.css#L913) · `.rank-empty-action` | `transform 0.2s, box-shadow 0.2s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:925](../app/ranking.css#L925) · `.rank-empty-action::before` | `transform 0.6s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/ranking.css:1121](../app/ranking.css#L1121) · `.rank-page *, .rank-page *::before, .rank-page *::after` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [app/ranking.css:1133](../app/ranking.css#L1133) · `.rank-tab-idx` | `color 0.3s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [app/share.css:14](../app/share.css#L14) · `.share-trigger` | `background 0.15s, border-color 0.15s` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [components/beta-notice.css:55](../components/beta-notice.css#L55) · `.beta-notice-enter` | `transform 120ms ease, box-shadow 120ms ease` | 中立保留 | 明确属性、主题颜色；小元素微交互保留，reduced-motion 立即落值。 |
| [components/beta-notice.css:72](../components/beta-notice.css#L72) · `.beta-notice-card, .beta-notice-overlay` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |
| [components/beta-notice.css:76](../components/beta-notice.css#L76) · `.beta-notice-enter` | `none` | 中立保留 | 禁动画 / reduced-motion 守卫，不改成固定延迟。 |

**完整性核对**：73 个关键帧各归类一次；127 处 transition 声明各列一次。CSS 外的 WAAPI、rAF、工具类与项目占位内容见 2.1。真实作品 iframe 内部动画、第三方包内部实现、历史独立演示不冒充主站已改内容。

<!-- audit-tables:end -->
