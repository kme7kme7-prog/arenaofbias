# DESIGN KIT — 「纸面仪器 / Paper Instrument」

一套可整体搬去任何项目的设计系统。**零依赖、零构建、无预处理器**——一个 CSS 文件加一份规范。

| 文件 | 内容 |
| --- | --- |
| `design-kit.css` | 全部 token 与原语类，`dk-` 命名空间，可直接 `<link>` |
| `preview.html` | 演练全部原语的活样本，含可切换的深色子世界与 reduced-motion |
| `README.md` | 本文：设计原理、用法、踩坑记录、自查清单 |

打开 `preview.html` 是理解这套系统最快的方式——比读文档快。

---

## 0. 这是什么，不是什么

**是**：一套有明确参照物的视觉语言 + 一组可直接复用的 CSS 原语 + 一份"为什么"的说明书。

**不是**：组件库（没有 React/Vue 封装）、图标库、栅格系统。它管的是**气质与纪律**——颜色怎么用、圆角为什么是零、投影为什么不能模糊、动画为什么只动 transform。组件长什么样由这些纪律推导出来。

参照物是**测绘仪器面板与老式印刷品**：纸灰绿底、深墨字、酸性黄高亮，配等宽小字标签、刻度尺、角括号、坐标注记。

它刻意**不是**：
- 泛滥的"AI 产品极简白"（大留白 + 圆角卡片 + 渐变按钮）
- 赛博朋克霓虹（黑底 + 发光描边）
- 厚重拟物（强渐变 + 大圆角 + 软阴影）

判断任何新设计是否合规，问四句：

> **圆角了吗？投影模糊了吗？用了第四个颜色吗？动的是 transform 吗？**

四句都答对，就不会跑偏。

---

## 1. 快速接入

```html
<link rel="stylesheet" href="design-kit.css">
```

然后：

```html
<body>
  <div class="dk-page">
    <header class="dk-topbar">
      <span class="dk-mark"><i></i><i></i><i></i></span>
      <strong>YOUR BRAND</strong>
    </header>
    <div class="dk-ticks"></div>
    <main>
      <span class="dk-code">SEC.01 / OVERVIEW</span>
      <h1 class="dk-title">区块标题 <span>/ 降调的后半句</span></h1>
      <button class="dk-key">主要操作</button>
    </main>
  </div>
</body>
```

只想借 token 不借类名？把 `design-kit.css` 第 1 节 `:root { … }` 整段复制进你自己的 `:root`，改名即可。

---

## 2. 色彩系统

### 2.1 六个角色

| 角色 | 默认值 | 职责 |
| --- | --- | --- |
| **纸** `--dk-paper*` | `#dfe3dd` / `#d9ddda` / `#e8eae6` / `#eef0e9` | 浅色表面，四层。层间只差 3–6 个亮度单位 |
| **墨** `--dk-ink*` | `#1c2423` / `#263029` | 深色表面（顶栏、墨面卡片、黑条） |
| **前景** `--dk-fg*` | `#1c2423` / `#5b655f` / `#71806b` | 纸面上的文字，三档 |
| **墨上前景** `--dk-fg-on-ink*` | `#e8eee6` / `#a0ad97` / `#90a181` | 墨面上的文字，三档 |
| **强调** `--dk-accent*` | `#d9fb51` / `#192020` / `#718522` | **唯一**强调色 + 其上的字色 + 暗版（焦点环） |
| **投影** `--dk-shadow` | `#a2ad87` | 硬投影专用，比纸暗一档的橄榄灰 |

外加可选的**二元对立** `--dk-a` / `--dk-b`（`#ff7869` / `#8bc9dd`）：只承载"左/右""A/B""我方/对方"语义，**永远不当主色**。

### 2.2 三条铁律

1. **强调色只有一个。** 酸黄出现频率最高，但每次只用于"这里最重要"。想加第二个强调色时，先问能不能用字重或字距解决。
2. **纸面质感靠"几乎看不见的层次"。** 四层纸之间差 3–6 个亮度单位，不靠强对比、不靠阴影分层。
3. **投影不是黑。** 用比纸暗一档的同色相灰（橄榄灰）。这是"纸叠纸"，不是"物体悬浮在背景上"。

### 2.3 角色 vs 字面量（踩过坑，务必保留）

token 分两类，**绝不能混用**：

- **字面量** = `--dk-paper*` / `--dk-ink*`。永远指"某块面的底色"。
- **角色** = `--dk-fg*` / `--dk-line*` / `--dk-shadow`。指"文字/描边/投影该用什么"，随主题重指向。

早期版本在深色主题里把 `--dk-ink` 翻转成"前景色"，结果所有把 ink 当**背景**用的地方（顶栏、墨面卡片）全部变成浅字压浅底，整页不可读。修复方式是引入独立的 `--dk-fg*` 角色。

**规则：任何"文字该用什么颜色"的问题，答案必须是 `--dk-fg*`；任何"这块面是什么底色"的问题，答案才是 `--dk-paper*` / `--dk-ink*`。**

### 2.4 换皮示例

换皮 = 只改色值，不改结构。下面把整套皮换成「蓝图」，全部类名一行不动：

```css
:root {
  --dk-paper: #dfe6ee;  --dk-paper-2: #d6dee8;
  --dk-paper-3: #e6ecf2; --dk-paper-hi: #eef3f8;
  --dk-ink: #16222e;     --dk-ink-2: #1f2e3c;

  --dk-fg: #16222e;  --dk-fg-soft: #55636f;  --dk-fg-faint: #6d7c88;
  --dk-fg-on-ink: #e8eef4;
  --dk-fg-on-ink-soft: #9fb0bd;
  --dk-fg-on-ink-faint: #8496a3;

  --dk-line: #b2bfca;  --dk-line-soft: #c6d1da;
  --dk-line-ink: #3c4d5c;  --dk-line-on-ink: #42525f;

  --dk-accent: #ffb454;  --dk-accent-ink: #241703;  --dk-accent-dim: #a06a1c;
  --dk-shadow: #9aa8b4;
}
```

注意 `--dk-shadow` 也跟着换色相——投影是纸的影子，不是通用的黑。

---

## 3. 造型：零圆角 + 切角 + 硬投影

### 3.1 零圆角

`--dk-radius: 0`。圆角只允许出现在圆点（`50%`）与极少数胶囊标签上。这套系统靠**切角**塑形，不靠圆角。

### 3.2 招牌切角

右下角斜切，12px 是标准，7px 用于小元件，`0.38em` 用于随字号缩放的字标：

```css
.dk-chamfer {
  --_c: var(--dk-chamfer);
  clip-path: polygon(
    0 0, 100% 0,
    100% calc(100% - var(--_c)),
    calc(100% - var(--_c)) 100%,
    0 100%
  );
}
```

### 3.3 ⚠ clip-path 与 box-shadow 互斥（浏览器实测）

`clip-path` 会裁掉**本元素**的 `border` 和 `box-shadow`。已在 Chrome 实测确认：切角元素上直接写 `box-shadow: 3px 4px 0 …`，投影完全不可见。

两个正确做法，kit 里都已内置：

- **描边**改走 inset 阴影：`.dk-inset-line { box-shadow: inset 0 0 0 1px var(--dk-fg); }`
- **外投影**交给父级 `drop-shadow`——它会沿着子元素的裁剪轮廓生成影子：

```html
<span class="dk-liftwrap">
  <button class="dk-btn dk-chamfer">切角 + 硬投影</button>
</span>
```

`preview.html` 的 SEC.02 把错误写法和正确写法并排放着，可以直接对比。

### 3.4 硬投影三态

投影是**位移的影子**，必须与位移同步，不能单独动：

| 状态 | 位移 | 投影 |
| --- | --- | --- |
| 静置 | — | `3px 4px 0` |
| hover | `translate(-1px,-1px)` ~ `(-2px,-3px)` | `5px 7px 0` |
| active | 压回 `translate(0,0)` ~ `(1px,1px)` | `1px 1px 0` 或 `none` |

### 3.5 角括号

L 形取景框是仪器语汇里最便宜也最有效的一笔。`.dk-corners` 自动出左上 + 右下两角；`--heavy` 变体是 3px 粗角，用于区块收尾。

---

## 4. 排版：两极字距

**核心规律：字号越大字距越紧（负值），字号越小字距越松（正值）。中间地带几乎不存在。** 这个反差是整套视觉的张力来源。

| 类 | 规格 | 用途 |
| --- | --- | --- |
| `.dk-display` | 斜体 900 / `clamp(64px,12vw,180px)` / `-0.04em` | 水印、封面数字 |
| `.dk-title` | 850 / `clamp(23px,2.4vw,35px)` / `-1.6px` | 区块标题 |
| `.dk-h3` | 750 / `clamp(17px,1.6vw,23px)` / `-0.5px` | 子标题 |
| `.dk-body` | 400 / 15px / 行高 1.7 | 界面正文 |
| `.dk-longform` | 衬线 / 16px / 行高 1.9 | 长文正文 |
| `.dk-label` | 等宽 / 7–11px / `+1.4~2.5px` / 全大写 | **仪器标签**：编号、状态、时间戳 |
| `.dk-num` | 等宽 650 / `clamp(24px,3vw,36px)` / `-1px` | 分数、票数 |

### 4.1 四套字体

| 用途 | 栈 |
| --- | --- |
| 正文/界面 `--dk-sans` | `Bahnschrift → DIN Alternate → Microsoft YaHei → PingFang SC` |
| 仪器标签 `--dk-mono` | `Bahnschrift → Consolas → ui-monospace` |
| 英文引文 `--dk-serif-en` | `Georgia` |
| 中文长文 `--dk-serif-cjk` | `Songti SC → SimSun → Noto Serif SC` |

两个有意的"不标准"：

- **`--dk-mono` 里 Bahnschrift 排在 Consolas 前面。** 标签要的其实是"工业窄体"的气质，不是严格等宽。
- **长文切衬线。** 材质反差把"阅读"和"操作"分开——长文不该长得像界面。

想要完整气质就自托管一个 DIN 系字体（MiSans / Archivo Narrow / IBM Plex Sans Condensed）。缺字体时退到系统中性无衬线，气质弱一点但布局不塌。

---

## 5. 布局母题

让界面"像仪器"的是这些不起眼的元素。**单独看毫无用处，堆在一起才成立。新页面应当复用而非另造。**

| 类 | 是什么 |
| --- | --- |
| `.dk-code` | 区块上方的小号等宽编号（`SEC.01 / …`），仪器面板叙事的关键 |
| `.dk-ticks` | 刻度尺：主刻度每 72px 全高、次刻度每 12px 半高 |
| `.dk-meta` | 元数据行：两端对齐 + 4px 方块项目符号 + 斜杠分隔 |
| `.dk-grid` | 环境网格：48px 网格 + 水平 mask 淡出 + 120° 斜条纹。是底纹不是壁纸 |
| `.dk-dot` | 5px 发光**方**点 + 呼吸。方点不是圆点——圆点太"web 2.0" |
| `.dk-mark` | 三横杠字标：`skew(-13deg)` + 硬投影；hover 时上下两杠左移"像菜单被唤醒" |
| `.dk-watermark` | 巨型斜体水印，用极低透明度而非浅灰色值 |
| `.dk-edge` | 左边缘竖排坐标注记，长页面的方位感 |
| `.dk-corners` | 角括号取景框 |
| `.dk-spine` | 中轴：竖线 + 45° 菱形轨道，A/B 对峙的中缝 |

**页面底**永远是「纸底 + 中心提亮的径向渐变」（`.dk-page`），不铺满屏线性渐变。

**对比的主要手段**是纸面与墨面交替出现（`.dk-panel` vs `.dk-panel--ink`），以及顶栏那条 4px 强调色下边框（`.dk-topbar`）——全站最强的横向锚。

---

## 6. 动效

### 6.1 两条曲线

```css
--dk-ease-out:    cubic-bezier(0.22, 1, 0.36, 1);  /* 出场、抬升、揭幕 */
--dk-ease-in-out: cubic-bezier(0.76, 0, 0.24, 1);  /* 横扫、开合、对称运动 */
```

回弹曲线 `cubic-bezier(0.34, 1.96, 0.64, 1)` **全站只允许用一次**——点击确认时图标那下 pop（`.dk-pop`）。别处引入回弹会立刻显得廉价。

### 6.2 四档时长

| 档 | 值 | 用途 |
| --- | --- | --- |
| micro | `0.2s` | 颜色、边框、transform 抬升 |
| enter | `0.55s` | 单个元素入场 |
| stage | `0.85s` | 布局/容器尺寸/舞台切换 |
| slow | `1.3s` | 慢镜头（图片缓推） |

**不要在档位之间取中间值**，那会让节奏散掉。错峰步进唯一值 `0.08s`，用 `--dk-i: 0/1/2/3` 声明序号即可：

```html
<div class="dk-enter" style="--dk-i:0">…</div>
<div class="dk-enter" style="--dk-i:1">…</div>
```

### 6.3 铁律：只动 transform / opacity

不动 `width/height/top/left/clip-path`。前四者触发重排，`clip-path` 触发整屏重绘；`transform/opacity` 走合成器。

由此推出的几个具体做法：

- **全屏换页横扫**（`.dk-wipe`）用 transform 扫入扫出，不用 clip-path。层必须挂在 `body` 上、独立于路由存活，否则换页瞬间就被卸载。
- **折叠面板**用 `grid-template-rows: 0fr → 1fr`（`.dk-unfold`），不用 JS 量 `scrollHeight`——更稳，也不被字体加载抖动影响。
- **加载态复用已有的条状元素**当进度条（`.dk-pending` 往复光带），不另造 spinner。

### 6.4 reduced-motion

两层：

1. 全局兜底——所有动画/过渡压到 `0.01ms`，滚动改瞬时。注意是**立即到达终态**，不是隐藏内容：功能不能因为关掉动画而不可用。
2. 遮罩、粒子、扫光这类"纯装饰层"用 `.dk-reduced` 类直接 `display:none`（由 JS 探测 `prefers-reduced-motion` 后加到 `<html>`）。

---

## 7. 交互反馈

- **hover 三选一，不叠加**：① 抬升 + 投影涨；② 反色成强调底；③ 图片轻微放大（`.dk-kenburns`，1.3s）。
- **active**：一律压回原位、投影塌陷。
- **焦点环**：`3px` 实线 + `5px` offset。墨面上用负 offset 内缩，否则环跑出面板。
- **键帽** `.dk-kbd`：每个可键盘操作的控件右侧挂一个。小屏隐藏。
- **禁用态**：`opacity: 0.4` + `filter: saturate(0.45)`。**降饱和度而非单纯变灰**——纸面质感靠色相偏移，不靠透明度。
- **聚光灯**：并列对比时，hover 一侧、另一侧 `opacity: 0.34 + blur(2.5px) + grayscale(0.72)`（`.dk-dimmed` / `.dk-spotlit`）。比任何边框都有效。
- **点击确认**：粒子迸发（`.dk-burst` + `.dk-dots`）+ 唯一的那下 pop。

---

## 8. 响应式与触摸

- **手机线固定在 699/700**（`max-width:699px` 与 `min-width:700px` 互补）。中屏按自身布局在 `1000–1150px` 之间取，不强求统一。大屏加高走 `min-width:1600px and min-height:950px`。
- **一律 `100svh`，禁用裸 `vh`。** 裸 `vh` 在带动态工具栏的手机上是"工具栏收起后"的高度，会比可视区高出一个地址栏。
- **小屏策略是「隐藏装饰」而非「缩小装饰」**：缩略图、kbd、分隔符、竖排注记直接 `display:none`。
- **触摸热区只扩不改**：`@media (pointer: coarse)` 里给小控件盖一层透明 `::after` 撑到 44×44，视觉与排版零变化（`.dk-hit` / `--inline` / `--tight`）。已有定位的元素（absolute/fixed）不要碰 `position`，只给静态/行内元素补 `relative`。
- **容器查询优先于断点**：并列展示（A/B 对照、卡片网格）里给容器加 `.dk-container`，让比例由容器宽度决定。

---

## 9. 深色子世界

在 `<html>` 或任意容器上加 `data-dk-theme="ink"` 开一个作用域，局部变量整体重定义——**结构类一个都不用改**。

```html
<html data-dk-theme="ink">
```

三个要点：

1. **作用域要挂在足够高的节点。** 挂在页面容器上而 `body` 在容器外，会让 body 的背景/文字色留在旧主题里（实测踩过）。
2. **重定义的是角色与表面字面量，绝不翻转某个字面量的语义。** 见 §2.3。
3. **深底上的投影要比底色更暗**（`--dk-shadow: #0a1410`），不是更亮；焦点环要用亮版强调色（`--dk-accent-dim` 在深色下翻成亮值）。

---

## 10. DO / DON'T

| DO | DON'T |
| --- | --- |
| 圆角 0，靠切角塑形 | 加 `border-radius`（圆点除外） |
| 投影 0 模糊、同色相橄榄灰 | 模糊投影、黑色投影 |
| 一个强调色，红蓝只做 A/B | 引入第二个强调色、把战队色当主色 |
| 大字负字距、小字正字距 | 全站统一字距 |
| 纸面/墨面交替制造对比 | 全靠阴影分层 |
| 动画只动 transform/opacity | 动 width/height/clip-path |
| 两条缓动曲线、四档时长 | 每个组件自己挑曲线和时长 |
| 禁用态降饱和 | 禁用态只调透明度 |
| 小屏隐藏装饰 | 小屏等比缩小装饰 |
| 复用仪器母题 | 每页另造一套编号/分隔/角标 |
| 文字色用 `--dk-fg*` | 文字色用 `--dk-ink`/`--dk-paper` |
| 切角元素的外投影走父级 drop-shadow | 切角元素上直接写 box-shadow |

---

## 11. 类名速查

**排版** `.dk-display` `.dk-title` `.dk-h3` `.dk-body` `.dk-longform` `.dk-label(--xs/--lg)` `.dk-num` `.dk-quote` `.dk-kbd`

**表面** `.dk-page` `.dk-panel(--ink)` `.dk-topbar` `.dk-well`

**造型** `.dk-chamfer(--sm/--tag)` `.dk-inset-line` `.dk-corners(--heavy)` `.dk-rule(--fade/--skew)`

**按钮** `.dk-key(--quiet)` `.dk-btn(--ink/--a/--b/--icon/--text)` `.dk-liftwrap`

**仪器** `.dk-code` `.dk-ticks` `.dk-meta` `.dk-grid` `.dk-dot` `.dk-mark` `.dk-watermark` `.dk-edge` `.dk-spine`

**反馈** `.dk-shine` `.dk-burst` `.dk-dots` `.dk-dimmed` `.dk-spotlit` `.dk-pop`

**动效** `.dk-enter` `.dk-ready` `.dk-unfold(+inner)` `.dk-wipe` `.dk-kenburns` `.dk-pending`

**布局/触摸** `.dk-container` `.dk-hit(--inline/--tight)`

**主题** `[data-dk-theme='ink']` `.dk-reduced`

---

## 12. 新页面自查清单

- [ ] 只用了纸/墨/前景/强调/投影六个角色？二元色是否只承载 A/B 语义？
- [ ] 文字色走 `--dk-fg*`，表面色走 `--dk-paper*`/`--dk-ink*`，没有混用？
- [ ] 圆角为 0？切角是右下 12px（或既有变体）？
- [ ] 投影是 0 模糊硬投影，hover 涨 / active 塌，且与位移同步？
- [ ] 切角元素的描边走 inset 阴影、外投影走父级 drop-shadow？
- [ ] 标签类用 `--dk-mono` + 正字距 + 全大写？展示类负字距？
- [ ] 复用了既有仪器母题，而非另造编号/分隔/角标？
- [ ] 纸面与墨面有交替，而不是全页一种底色？
- [ ] 动画只动 transform/opacity？缓动取自两条主曲线？时长落在四档内？
- [ ] 错峰用 `--dk-i` × `0.08s`，没有手写零散 delay？
- [ ] `prefers-reduced-motion` 下直达终态，功能不缺失？
- [ ] 用 `svh` 而非 `vh`？粗指针热区达 44px 且不改像素？
- [ ] 焦点环、禁用态（降饱和）、键帽提示齐备？
- [ ] 深色子世界下逐屏看过一遍，没有浅字压浅底？

---

## 13. 浏览器实测记录

以下结论均在 Chromium 实测确认，不是推测：

1. **clip-path 裁掉本元素 box-shadow**——`preview.html` SEC.02 并排对照可见：同元素写法投影完全不可见，父级 drop-shadow 正常沿裁剪轮廓出影。
2. **主题作用域挂在页面容器上会漏掉 body**——body 的背景/文字色留在旧主题，整页浅字压浅底。必须挂 `<html>`。
3. **`.dk-key` 换底色必须同时换字色**——文字色是为 accent 底配的。已补 `.dk-key--quiet` 作为纸底次级按键的一等变体，不要手写 background 覆盖。
