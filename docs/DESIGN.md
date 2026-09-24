# 界面设计规范与风格

本文描述全站的视觉语言、动效规范与交互约定，是写新页面/新组件时的对照标准。技术架构与代码地图见 `docs/ARCHITECTURE.md`；产品行为规则见 `docs/PRODUCT.md`；本文引用的决策编号（如 029/103）出处为 `docs/DECISIONS.md`。

规范以现有代码为准，本文只归纳不复述数值表：token 定义在 `app/globals.css:82-104`，各页样式在 `app/*.css`。

## 定调

**纸面仪器 / 军用终端**，不是"AI 产品极简白"，也不是赛博朋克霓虹。参照物是测绘仪器面板与老式印刷品：纸灰绿底、深墨字、酸性黄高亮，配等宽小字标签、刻度尺、角括号、坐标注记。

- 决策 001/002：游戏式体验，拒绝泛滥极简 AI 样式；全站基线三色，主入口深底亮字。厚重立体被否。
- 决策 056：保留现有风格提质感，不改平淡。
- 决策 113：新题型必须复用深墨直角框、标题栏、阵营色控件，禁止另建圆角白卡风格。

判断一个新设计是否合规，问四句：**圆角了吗？投影模糊了吗？用了第四个颜色吗？动的是 transform 吗？**

## 配色

三色基线，全站只有这一套（`app/globals.css:82-104`）：

| 角色 | 值 | 用法 |
| --- | --- | --- |
| `--paper` / `--background` | `#dfe3dd` / `#d9ddda` | 纸面底，永远浅 |
| `--ink` / `--foreground` | `#1c2423` | 墨色文字，同时是深色面板底 |
| `--acid` / `--primary` | `#d9fb51` | **唯一强调色**，全站最高频色值 |
| `--red` / `--blue` | `#ff7869` / `#8bc9dd` | 只做 A/B 战队区分，不当主色 |
| `--muted` / `--border` | `#c5cbc6` / `#b4beb5` | 纸面层次与描边 |
| `--ring` | `#718522` | 焦点环 |
| 硬投影专用 | `#a2ad87` | 橄榄灰，所有 `0` 模糊投影的默认色 |

规矩：

- **酸黄是唯一强调色**。红蓝只承载"左方/右方"语义；决策 067 明确否掉引入朱红做主色，决策 058 定调模一把为墨绿舞台 + 酸黄卡牌。
- **深色面板 = 墨底 + 酸黄字**（顶栏、揭晓条、过场层、评论区黑条），浅色区 = 纸底 + 墨字。两种模式交替出现制造节奏。
- **战队色用作用域 CSS 变量**：`.contender { --team: var(--red) }`、`.contender-b { --team: var(--blue) }`，子元素一律引用 `var(--team)`，同一套组件天然出两色（`app/globals.css:576-585`）。
- `html { color-scheme: light }` 强制声明：站点只有浅色纸面，但手机系统深色模式会让 UA 把下拉弹层、勾选框、滚动条画成深色（`app/globals.css:109-111`）。
- `::selection` 染成酸黄底墨字，选中态也不脱离色系。
- 决策 047：题库封面不统一染绿，按题材本色。决策 017：榜单档案卡头部用模型品牌色着色，雷达/数据区保持中性。
- **允许深色子世界**：模一把是独立墨绿舞台（`.guess-page` 底色 `#101e18`，局部变量 `--guess-accent/--guess-hit/--guess-near/--guess-miss`）；过场层有自己的 `--gt-paper/--gt-ink/--gt-acid`，数值相对基线略有偏移。子世界自成体系但不脱离三色逻辑。

## 造型

最有辨识度的三件套：**零圆角 + 招牌切角 + 硬投影**。

**1. 全站零圆角。** `@theme inline` 里把 `--radius-sm/md/lg/xl` 全部设成 `0`（`app/globals.css:77-80`），从 token 层掐掉 shadcn 组件的圆角默认值。圆角只允许出现在圆点（`50%`）与极少数胶囊标签上。

**2. 招牌切角。** 右下 12px 斜切是签名形状：

```css
clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
```

投票按钮、平局按钮用它；反应胶囊用 7px 变体；品牌字标用 `0.38em`。

**3. 硬投影（`0` 模糊）做物理按键。** `box-shadow: 3px 4px 0 #a2ad87`，配状态变化：

- hover：`translate(-2px, -3px)` + 投影涨到 `5px 7px 0`
- active：`translate(0, 0)` + 投影塌到 `1px 1px 0` 或 `none`

**4. 切角会吃掉 border，描边改走 inset 阴影**：`box-shadow: inset 0 0 0 1px #20221d`（`app/globals.css:966` 有注释）。

**5. 角括号。** L 形角标是"仪器取景框"语汇，反复出现：`.image-corner.tl/.br`（14px 白细线）、`.briefing-corner`（9px 墨色）、`.afterparty::after`（14px）、`.work-panel::before`（顶部三边框）。

## 字体与排版

四套字体各司其职：

| 用途 | 字体 |
| --- | --- |
| 正文/界面 | `Bahnschrift → Microsoft YaHei → PingFang SC`（工业感无衬线） |
| **仪器标签** | `--mono: Bahnschrift, Consolas` — 所有编号、状态、元数据、时间戳 |
| 品牌字标 | **MiSans 400 + BIAS 800**，自托管；`app/spatial-fonts.css` 由 `scripts/vendor-fonts.mjs` 从 `misans-webfont@4.3.1` 生成 unicode-range 子集（决策 027/030/035，字标不翻译见 068） |
| 英文引文/装饰 | `Georgia` serif，如 60px 斜体引号 |
| 中文长文正文 | `Songti SC / SimSun / Noto Serif SC` serif，行高 1.9 |

**字号两极分化**，中间地带几乎不存在：

- 巨型展示：`clamp(220px, 33vw, 480px)` / 900 / 斜体（舞台水印）
- 区块标题：`clamp(23px, 2.4vw, 35px)` / **850** / `letter-spacing: -1.6px`
- Hero：`clamp(32px, 3.4vw, 58px)/0.92` / 800 / `-2px`
- 仪器标签：**7–11px** 等宽 / `letter-spacing: 1–4px`
- 正文基准 16px；长文 14–19px / 行高 1.75–2

字距同样两极：大字收紧到 `-2px`，小字撑开到 `4px`。这个反差是整套视觉的张力来源。宽度一律用 `clamp()` 或 `cq` 单位，不写死。

## 布局语汇（仪器母题）

让它"像仪器"的是这些不起眼的元素，新页面应当复用而不是另造：

- `.section-code` — 区块上方的 `11px / 2.5px` 等宽编号（如 `SEC.04`）
- `.term-ticks` — 刻度尺细线，主刻度每 72px 全高、次刻度每 12px 半高
- `.edge-coordinate` — 左边缘竖排坐标（`writing-mode: vertical-rl` + `rotate(180deg)`）
- `.field-meta i` — 4×4px 小方块当项目符号；`.meta-slash` 用斜杠分隔
- `.ambient-grid` — 48px 网格 + 水平 mask 淡出 + 120° 斜向条纹叠加
- `.live-dot` — 5px 发光小方点 + `status-pulse` 呼吸
- `.arena-mark` — logo 是三条 `skew(-13deg)` 横杠 + `drop-shadow(3px 3px 0)`；hover 时上下两杠左移 10px（"像菜单被唤醒"），active 时投影归零
- `.stage-watermark` — 巨型斜体字压在舞台底下（`z-index: -1`，`#adbaaa20`）
- `.versus-spine` — 中轴竖线 + 45° 旋转菱形轨道 + 斜体 VS
- 背景统一是 `radial-gradient` 中心提亮 + 纸灰绿底，不铺满屏渐变

**布局驱动方式**：`.arena-stage { container-type: inline-size }`，作品视口高度用 `clamp(340px, 30cqw, 540px)` — 比例由作品宽度而非视口决定（`app/globals.css:3299-3300`）。

## 动效

**缓动只有两条主曲线**（`app/globals.css:102-103`）：

```css
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);   /* 出场、揭幕、抬升 */
--ease-in-out: cubic-bezier(0.76, 0, 0.24, 1);   /* 过场横扫、遮罩开合 */
```

过场层另用 `cubic-bezier(0.16, 1, 0.3, 1)`。**回弹曲线 `cubic-bezier(0.34, 1.96, 0.64, 1)` 全站只用一次** — 反应按钮点中的那下 pop。不要在别处引入回弹。

**时长分四档**：

| 档 | 时长 | 用途 |
| --- | --- | --- |
| 微反馈 | `0.15–0.3s` | 背景色、边框、transform 抬升 |
| 元素入场 | `0.4–0.7s` | `text-enter`、`button-ready`、`lock-in`、`stamp-in` |
| 舞台/布局 | `0.75–0.95s` | 阶段切换、容器尺寸过渡、`channel-unfold`（grid `0fr→1fr`） |
| 慢镜头 | `1.3s` | 图片 ken-burns `scale(1.035)` |

**性能铁律**：

- 只动 `transform` / `opacity`。`.page-wipe` 注释写明"动画只动 transform（合成器驱动），不走会整屏重绘的 clip-path"（`app/globals.css:156-158`）；决策 094 把已有 clip-path 动画改成 `scaleX + will-change`。
- 决策 076：推进必须用可取消的 delay，**禁止等 `animation.finished`**。
- 决策 100：时间轴帧时化，掉帧原地冻、恢复续播，单帧封顶 100ms。
- 决策 098：偏好榜切赛道**零过渡** — 无行移动、无淡入、无滚动数字。不是所有切换都要动。
- 折叠面板用 `grid-template-rows: 0fr → 1fr` 过渡，不用 JS 量高。

**错峰**：统一 `0.08s` 步进（B 侧比 A 侧晚 0.08s，第二个面板晚 0.08s，平局按钮晚 0.16s）。

**reduced-motion 三层兜底**：全局 `* { animation-duration: 0.01ms !important }`（`app/globals.css:3527-3536`）+ 针对性 `animation: none` 覆盖 + `.reduced-motion` 类直接 `display: none` 掉遮罩层。决策 075：reduced-motion 下全部立即显示。

**特色手法**（可复用）：

- 按钮高光扫过 — `::before` 是 `skew(-25deg)` 白色渐变条，`left: -130% → 130%`
- 粒子迸发 — 数颗酸黄小点各带 `--px/--py/--d` 变量沿自身向量飞散（`.reaction-dots`）
- 加载态复用投票条当进度条（决策 095）— 未就绪侧退成空心槽 + 同色光带往复推进，就绪即填回队色
- 解密遮黑条 / 换题纸条 — 逐行盖住、错峰退开（`lib/decryption.ts`、`lib/text-swap-mask.ts`，决策 071/089）

**改动效的流程（决策 029，AGENTS.md 亦已固化）**：先建/更新对照工具再改行为 — `reference/*-review.html` 调参页 + `scripts/check-*.mjs` 不变量断言，`npm run check:motion` 一把跑完。断言只锁不变量（层挂 body、盖满才换路由、只动 transform、中断从当前值接续、结束必清理）；**节奏与缓动是设计参数，不入断言**，以对照页为准，不在文档复述数值。

## 交互反馈

- **hover 三选一**：① 抬升 `translateY(-2/-3px)` + 投影增长；② 反色成酸黄底墨字；③ 图片轻微放大。不叠加使用。
- **active**：一律压回原位、投影塌陷。
- **焦点环**：`outline: 3px solid #688515; outline-offset: 5px`（按钮与 tab）；打磨层用 `2px var(--acid) / 4px`；深色面板内用负 offset 内缩。
- **kbd 提示**：每个可键盘操作的按钮右侧挂 26px 方框 `kbd`，`≤699px` 才隐藏。决策 096：空格可跳过 intro。
- **禁用态**：`opacity: 0.4` + `filter: saturate(0.45)` — **降饱和度**而非单纯变灰，才符合纸面质感。
- **聚光灯**：hover 一侧时另一侧 `opacity: 0.34 + blur(2.5px) + grayscale(0.72)`，中轴淡出。
- 决策 074：选择反馈必须即时挂载，2 秒内收起。

## 响应式与触摸

- **手机线统一在 699/700**（`max-width: 699px` 与 `min-width: 700px` 互补）；中屏各页按自身布局在 `1000–1150px` 之间取；大屏加高走 `min-width: 1600px and min-height: 950px`。
- **一律 `100svh`，禁用裸 `vh`** — 裸 `vh` 在带动态工具栏的手机上是"工具栏收起后"的高度，会比可视区高出一个地址栏；`npm run check:mobile` 卡这条。
- **触摸热区（决策 103）**：`@media (pointer: coarse)` 里给小控件盖一层透明 `::after` 扩到 44px，**只扩热区不改像素**，视觉与排版零变化。已有定位的（`position: absolute/fixed`）不碰 `position`，只有静态/行内元素才补 `relative`。参考 `app/globals.css:3621-3674`。
- 全局 `touch-action: manipulation` + `-webkit-tap-highlight-color: transparent`。
- 键盘遮挡用 `interactive-widget=resizes-content`（决策 103）。
- **小屏策略是隐藏装饰而非缩小**：缩略图、`kbd`、分隔符、竖排坐标、`.vs-sub` 直接 `display: none`。

## 工程约定

1. **每页一个独立 CSS 文件**（`app/*.css`），手写语义化类名（`.briefing-copy`、`.panel-heading`），不用 CSS Modules、不堆 utility。Tailwind 只服务 `components/ui/` 那几个 shadcn 原语，且按需 add（决策 016）。
2. **token 锚定 + 局部作用域变量**：全站引 `--paper/--ink/--acid/--mono/--ease-*`，各页在自己根类下开局部变量（`.guess-page { --guess-accent }`、`.duel-home { --duel-pad }`）。
3. **原型先行**：`prototypes/ranking.html` 是偏好榜视觉定稿源，`app/ranking.css` 头注释直接锚定它。新玩法建议先出 `reference/*-review.html`。
4. **加载顺序有意义**：`app/arena-refinement.css` 是打磨层，在主样式后加载（决策 056/071-078）。
5. **CSS 注释写"为什么"**：非显然的样式都带决策编号与原因（例："切角会吃掉 border，描边改走 inset 阴影"、"基类的 background .3s 会被 WebGL 压满的主线程拖住"）。这些注释本身是规范的一部分，改样式时同步维护。
6. **中英双语 i18n**（决策 056/068）：中文键→英文值，语言存 `arena-language`，品牌字标不翻译。
7. `app/observatory.css` 含大量已无引用的历史规则，待清理 — 不要以它为规范样本。

## 新页面自查清单

- [ ] 只用了纸灰绿 / 深墨 / 酸黄三色？红蓝是否只承载 A/B 语义？
- [ ] 圆角为 0？切角是否为右下 12px（或既有变体）？
- [ ] 投影是 `0` 模糊硬投影，hover 涨 / active 塌？
- [ ] 切角元素的描边是否走 `inset` 阴影而非 `border`？
- [ ] 标签类文字是否用 `--mono` + 正字距？展示类文字是否负字距？
- [ ] 是否复用了既有仪器母题（`section-code` / 角括号 / 刻度尺）而非另造？
- [ ] 动画是否只动 `transform`/`opacity`？缓动是否取自两条主曲线？
- [ ] `prefers-reduced-motion` 下是否直达终态？
- [ ] 用 `svh` 而非 `vh`？粗指针热区是否达 44px 且不改像素？
- [ ] 焦点环、禁用态（降饱和）、`kbd` 提示是否齐备？
- [ ] 改动效是否先更新 `reference/` 对照页与 `scripts/check-*.mjs`？`npm run check:motion` 是否通过？
