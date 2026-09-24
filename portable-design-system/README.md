# 纸面仪器 · 独立设计规范

**Paper / Instrument — Portable Design System 1.0**  
整理日期：2026-09-23。设计来源：Show1 / 偏见试验场当前浅色视觉体系。

这是一套可迁移的界面语言与 CSS 工具包。复制 `design-kit.css`，在界面外加 `.pdk`，即可用于原生 HTML、React、Vue 或其他项目。没有 npm 依赖，没有网络请求，也不需要原网站的布局、账号、路由或游戏模块。

> **灰绿纸面承载内容，深墨建立秩序，酸黄标出决定。**

它适合创作工具、作品目录、内容比较、研究资料库和轻量工作台。不要把它理解为全站暗色皮肤、荧光终端模板，或只能用于 A/B 测评的业务组件。

## 目录

1. [交付物与快速开始](#交付物与快速开始)
2. [设计原则](#设计原则)
3. [色彩与语义](#色彩与语义)
4. [字体与排版](#字体与排版)
5. [空间与布局](#空间与布局)
6. [形状与装饰](#形状与装饰)
7. [组件规范与代码](#组件规范与代码)
8. [动效](#动效)
9. [无障碍与内容](#无障碍与内容)
10. [迁移到其他网站](#迁移到其他网站)
11. [验收与维护](#验收与维护)
12. [来源与边界](#来源与边界)

## 交付物与快速开始

| 文件 | 用途 | 是否随目标网站发布 |
| --- | --- | --- |
| `design-kit.css` | 核心 token、局部基础规则、布局与组件 | 是 |
| `README.md` | 设计规则、组件 API、迁移与验收 | 给开发和设计人员 |
| `preview.html` | 可直接打开的视觉与交互样本 | 可选 |
| `preview.css` | 展示页专用构图，不属于组件 API | 只有使用展示页时 |
| `preview.js` | 展示页的原生对话框、表单与键盘 tabs 演示 | 只有使用展示页时 |
| `verify.mjs` | 无依赖的文件、token、对比度与引用检查 | 开发期 |
| `VALIDATION.md` | 实际执行过的验证与限制 | 交付记录 |

双击 `preview.html` 即可浏览；`file://` 下也能运行示例。点击 Markdown 链接时，浏览器可能显示原文或下载文件，阅读规范可用编辑器。CSS 下载也可直接从目录复制。

最小接入：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="design-kit.css">
</head>
<body class="pdk">
  <main class="pdk-container pdk-section pdk-stack">
    <p class="pdk-eyebrow">我的资料库 / 01</p>
    <h1 class="pdk-display">把好内容，<br>留给下一次<span class="pdk-accent-word">灵感</span>。</h1>
    <p class="pdk-lead">将网页、文字与想法归档。先找到，再深入。</p>
    <div class="pdk-cluster">
      <a class="pdk-button" href="library.html">进入资料库 ↗</a>
      <a class="pdk-button pdk-button--secondary" href="guide.html">了解使用方式</a>
    </div>
  </main>
</body>
</html>
```

嵌入已有网站时，把 `class="pdk"` 加在局部容器上即可。`body` 的零 margin 与最小高度只对 `body.pdk` 生效。局部容器不接管整个页面背景或滚动。

## 设计原则

### 1. 有性格，但先让人看懂

性格来自字体对比、克制的色彩、规整分隔和按压反馈。先用信息层级把页面组织好，再加网格、刻度或坐标。去掉全部装饰以后，内容和操作仍应完整。

### 2. 一个场景，一项主行动

Hero 只设置一个视觉最强的入口；使用深墨底、酸黄字、轻微硬投影。资料库、榜单、帮助等重要次入口应在正文附近清楚出现，不能全部压进页头小字。一般用两列入口或列表，不做三个同等强度的大按钮。

### 3. 作品优先，容器退后

照片、网页预览和图表保留自己的颜色，不统一覆绿，不对所有作品做模糊或降饱和。比较两份作品时，两侧容器、字号、边距和操作权重一致。酸黄属于界面，不应“污染”作品本体。

### 4. 强调面积小，反馈明确

酸黄用于主操作文字、当前选项、小标签或一道细线。避免铺满正文背景。标题保留正常标点；不把句号改成靶心、勋章或大荧光圆环，也不在末字下面垫厚色块。

### 5. 将风格与业务分离

目录、表格、输入和反馈可以迁移。评测规则、排名算法、模型身份、游戏谜底、原网站名称与素材不能从 CSS 自动继承。新项目应使用自己的品牌和内容。

## 色彩与语义

### 品牌锚点

| Token | 默认值 | 角色 | 合适的搭配 |
| --- | --- | --- | --- |
| `--pdk-paper` | `#dfe3dd` | 大面积页面纸底 | 深墨文字 |
| `--pdk-ink` | `#1c2423` | 正文、顶栏、主按钮背景 | 纸色文字或酸黄强调 |
| `--pdk-acid` | `#d9fb51` | 唯一常规品牌强调 | 深墨文字；不配白字 |

不能在浅色纸面上把酸黄当正文颜色。酸黄和纸色的亮度相近，它适合强调面积，不适合承载可读信息。

### 中性色与交互色

| Token | 默认值 | 用途 |
| --- | --- | --- |
| `--pdk-ground` | `#d9ddda` | 可选的页面外层背景 |
| `--pdk-surface` | `#e8eae6` | 面板和卡片 |
| `--pdk-surface-raised` | `#f0f2ec` | 输入区、局部抬高表面 |
| `--pdk-text` | `#1c2423` | 当前表面的主要文字 |
| `--pdk-muted` | `#5b655f` | 说明、标签、元数据 |
| `--pdk-line` | `#b4beb5` | 装饰性分隔和容器边界 |
| `--pdk-control-line` | `#788577` | 表单、次级按钮等需要辨识的边界 |
| `--pdk-focus` | `#536627` | 3px 键盘焦点环 |
| `--pdk-shadow-color` | `#a2ad87` | 零模糊的轻微硬投影 |

分隔线不是输入框边界，两者不能为了统一而使用同样浅的颜色。新版 kit 将这个区别做成了两个 token。

### 阵营与状态

| 语义 | 前景 / 背景 | 规则 |
| --- | --- | --- |
| A 侧 | `--pdk-team-a: #ff7869` | 彩色顶边 + 明确 A 标签；不用作主操作 |
| B 侧 | `--pdk-team-b: #8bc9dd` | 彩色顶边 + 明确 B 标签；不自动代表成功 |
| 成功 | `#335937 / #dae5d5` | 配“已完成”等文字 |
| 警告 | `#775016 / #f1e6c4` | 配原因及下一步 |
| 错误 | `#923b31 / #f3dfda` | 明确失败对象，保留输入，提供恢复方式 |

语义色是迁移版为了通用表单补充的角色，不是新增品牌主色。不要用纯阵营红在浅底上写错误小字。

### 局部深墨

`pdk-inverse` 改变一个区域的 surface、text、muted、line 与 focus token。默认深墨底、浅纸字；焦点环用酸黄。它适合焦点面板、简报栏或结果区，**不是自动适配全站暗色的主题**。`prefers-color-scheme` 不会切换本 kit。

使用深色区域时，其后代必须使用语义 token，如 `--pdk-text`，不要写死 `color: var(--pdk-ink)`。本 kit 不提供嵌套浅色主题；如果需要深色里面再嵌浅色，显式恢复完整 token 或在布局上将该区域移出深色父级。

## 字体与排版

### 字体职责

| 层级 | 默认栈 / API | 规则 |
| --- | --- | --- |
| 界面与品牌 | `--pdk-font-ui`：MiSans → Bahnschrift → 微软雅黑 → 苹方 → system-ui | 中文字重和换行优先验证 |
| 编号、时间、数值 | `--pdk-font-mono`：Cascadia Mono → Consolas → SFMono-Regular → monospace | 真正需要对齐的数据用等宽 |
| 长文阅读 | `--pdk-font-reading`，配 `.pdk-prose--serif` | 宋体栈、约 1.9 行高 |

CSS 不下载字体；`MiSans` 仅在宿主加载或设备安装后生效。跨平台字宽会不同。若要求品牌字形一致，自托管获许可的字体并设置 `font-display: swap`，不要把整套中文字库当作微小附件。字体许可和分发条款单独核实，不随本 kit 自动获得。

### 排版刻度

| 类 / token | 默认 | 适用范围 |
| --- | --- | --- |
| `.pdk-display` | `clamp(2.75rem, 6.5vw, 6.25rem)`；800；1.12 | Hero；每页通常一次 |
| `.pdk-heading` | `clamp(1.65rem, 3vw, 2.5rem)`；750；1.2 | 区块标题 |
| `.pdk-title` | 1.25rem；700 | 面板/卡片标题 |
| `.pdk-lead` | 1.125rem；1.85；最多 48ch | 简介 |
| 正文 | 1rem；1.65 | 界面阅读 |
| `--pdk-text-sm` | .875rem | 按钮、表格、标签 |
| `--pdk-text-xs` | .75rem | 辅助信息；仍须可读 |
| `.pdk-eyebrow` | .75rem 等宽；.12em 字距 | 小节编号，不承载唯一操作入口 |

以上 rem 以浏览器默认字号为基准，默认 16px 时分别为 44–100、26.4–40、20、18、16、14、12px。不在 `html` 上缩小字号。装饰性坐标可以更小，但关键说明、标签、按钮不能依赖 7–10px 字号。

大标题字距收紧约 `-.055em`；正文不套大标题字距。英文长词与长标题允许换行；不要用 `white-space: nowrap` 解决所有标题。完整句子保持本语言表达，不为“高级感”堆叠同义中英标题。

```html
<h1 class="pdk-display">让内容被<span class="pdk-accent-word">看见</span>。</h1>
```

强调只包文字，不包句号；细线厚度 3px，不做文字底部的大色块。若细线干扰具体字体的下伸部分，优先取消强调或调整 offset，而非不断叠加新装饰。

## 空间与布局

### 间距标尺

`--pdk-space-1…9` 对应 `.25 / .5 / .75 / 1 / 1.5 / 2 / 3 / 4.5 / 7rem`，默认即 `4 / 8 / 12 / 16 / 24 / 32 / 48 / 72 / 112px`。

- 4–8：图标与微标签、紧凑状态组。
- 12–16：控件内部、相邻字段。
- 24–32：卡片与面板、组件组。
- 48–72：页面区块和主要分栏。
- 112：少量大段留白，不作为普通卡片 padding。

### 容器和断点

- `.pdk-container`：最大 90rem；两侧边距 `clamp(1rem, 4vw, 4rem)`。
- `.pdk-grid`：自适应卡片列，理想最小宽 18rem，实际父级更小时允许缩到 100%。
- `.pdk-split`：等宽双列；48rem 以下单列。
- `.pdk-hero`：文案 + 展示双列；48rem 以下先文案后展示。
- `.pdk-stack`：纵向流，默认 gap 24px。
- `.pdk-cluster`：允许换行的横向操作组，默认 gap 12px。
- `.pdk-section`：常规上下 72px，小屏 48px。
- `.pdk-masthead`：允许换行，窄屏导航独立一行。

断点描述布局何时不再成立，而非“某个手机型号”。保留真实内容进行 320 / 390 / 768 / 1280 / 1440px 检查。页面本身不得横向溢出；表格可在有标签、可聚焦的局部区域滚动。

### 三种页面骨架

1. **入口页**：品牌导航 → 单个 Hero 主行动 → 两个清楚的次入口 → 内容预览。展示和动效低于主按钮的视觉权重。
2. **目录页**：标题与结果说明 → 搜索和筛选 → 一致的内容卡 → 分页。图片只负责预览，标题和操作在稳定位置。
3. **工作台**：页头 → 一行核心状态 → 表格或主面板 → 右侧详情（窄屏移到底部）。不要把每一行数据都包装成独立大卡。

## 形状与装饰

- **直角为默认**：`--pdk-radius: 0px`。圆只用于真实圆形信息，例如加载环、单选按钮或特定图形，不用于每个标签与标题标点。
- **轻微硬投影**：按钮默认 `3px 4px 0`；面板通常只有边框。厚重 3D、不透明大阴影和大量悬浮卡不属于本体系。
- **细线划层级**：常规 1px；重要状态可 2–4px，但必须对应状态。
- **网格低对比**：`.pdk-grid-paper` 48px 网格仅用于空白和背景；不要叠在密集正文、照片、视频或数据图之上。
- **刻度只作辅助**：`.pdk-ticks` 为装饰加 `aria-hidden="true"`。如果刻度代表真实数值，应改成带单位、刻度标签和替代文本的数据图。
- **每块内容只选一种主装饰**：有暗色标题栏的面板通常不再加四角括号、网格、斜纹、编号、水印全部组合。
- **切角按需使用**：原站部分控件有切角，但 portable kit 默认不裁剪交互元素，避免裁掉焦点环、边框和投影。若加切角，放在内部装饰伪元素上，外层保留真实按钮与焦点。
- **图标**：建议 16/20/24px，单色描边 1.5–2px。包内不加载图标库；可用已有 SVG。纯装饰图标 `aria-hidden`；只有图标的按钮须有 `aria-label`。

## 组件规范与代码

### 按钮与链接

| 类 | 用途 | 状态 |
| --- | --- | --- |
| `.pdk-button` | 单一主动作 | 深墨底酸黄字，轻硬投影 |
| `--secondary` | 次动作 | 纸面底、清楚边界 |
| `--quiet` | 低强调操作 | 透明底，无硬投影 |
| `--danger` | 明确破坏性操作 | 深红底白字，写清对象 |
| `--icon` | 图标按钮 | 至少 48×48px，须有名称 |

修饰类写成完整名称，例如 `class="pdk-button pdk-button--secondary"`。导航用 `<a href>`，动作使用 `<button type="button">`，表单提交显式 `type="submit"`。

```html
<button class="pdk-button" type="button">创建条目 ↗</button>
<button class="pdk-button" type="button" disabled aria-busy="true">正在保存</button>
<a class="pdk-button pdk-button--secondary" href="archive.html">浏览归档</a>
```

`disabled` 真正阻止原生按钮激活；`aria-disabled="true"` **只声明状态，不阻止链接或点击**。本 kit 只提供其样式，业务必须另外守卫。不要用 `pointer-events:none` 代替键盘和逻辑禁用。异步开始后先设置 busy/disabled，成功或失败后恢复；加载超时要有可恢复提示。

重要次入口：

```html
<nav aria-label="继续探索">
  <a class="pdk-entry" href="archive.html">
    <span class="pdk-number">01</span>
    <span><strong>资料目录</strong><small>找一个感兴趣的主题</small></span>
    <span aria-hidden="true">↗</span>
  </a>
</nav>
```

### 面板、卡片和状态

```html
<section class="pdk-panel pdk-panel--instrument" aria-labelledby="panel-title">
  <header class="pdk-panel-head">
    <h2 class="pdk-title" id="panel-title">项目详情</h2>
    <span class="pdk-badge pdk-badge--accent">当前</span>
  </header>
  <div class="pdk-panel-body pdk-stack">
    <p>信息内容。</p>
    <a class="pdk-link" href="details.html">查看完整记录</a>
  </div>
</section>
```

- `.pdk-panel` 为稳定内容容器；`--instrument` 只强调其标题栏。
- `.pdk-card` 为独立条目；只有 `a.pdk-card` 有悬停位移。整卡链接里不要嵌套其他链接或按钮。
- `.pdk-card--team-a/b` 只改变顶边色，必须保留可读的 A/B 名称。
- `.pdk-meta` 是元信息组，`.pdk-number` 提供等宽与表格数字对齐。
- `.pdk-badge` 的 `--accent/success/warning/danger` 必须附文字；不能只显示色块。
- `.pdk-callout` 提示上下文；`--error` 的内容要说明原因与下一步。动态错误可以使用 `role="alert"`，静态展示不应无故触发朗读。
- `.pdk-empty` 同时交代原因与一个下一步。没有结果不等于发生错误。

### 表单

```html
<div class="pdk-field">
  <label class="pdk-label" for="title">名称（必填）</label>
  <input class="pdk-input" id="title" name="title" required
         aria-describedby="title-hint title-error" aria-invalid="true">
  <p class="pdk-hint" id="title-hint">最多 48 个字符。</p>
  <p class="pdk-error" id="title-error">请输入名称。</p>
</div>
```

`.pdk-input` 可用于 input/select/textarea。textarea 允许垂直调整，不固定死内容高度。placeholder 只是例子，不代替标签。错误时 `aria-invalid` 与错误文本同时出现；修复后清理二者。提交失败保留用户输入。

```html
<label class="pdk-check"><input type="checkbox" name="updates">接收更新提醒</label>
```

原生 checkbox/radio 保留平台交互，整个 label 是热区。不要用一张勾选图形代替真正的 input。

### Tabs

`.pdk-tabs` / `.pdk-tab` / `.pdk-tabpanel` 只提供外观，不自动生成键盘逻辑。

- 容器 `role="tablist"` 并给名称。
- 按钮 `role="tab"`、`aria-selected`、`aria-controls`；选中的 tab `tabindex="0"`，其余 `-1`。
- 面板 `role="tabpanel"`、`aria-labelledby`；非当前面板使用 `hidden`。
- 左右键移动，Home/End 到首尾。即时内容可自动激活；有网络延迟时改成 Enter/Space 手动激活，不因焦点经过就反复请求。
- 展示页是**横向、即时激活**示例；不是垂直 tabs 或 RTL 方向键实现。
- 不需要切换同一内容区域时，直接用链接导航，不伪装成 tabs。

### 表格与进度

```html
<div class="pdk-table-wrap" role="region" tabindex="0" aria-label="项目记录，可横向滚动">
  <table class="pdk-table">
    <caption>项目记录</caption>
    <thead><tr><th scope="col">项目</th><th scope="col" class="pdk-number">数量</th></tr></thead>
    <tbody><tr><th scope="row">资料库</th><td class="pdk-number">24</td></tr></tbody>
  </table>
</div>
<label class="pdk-label" for="progress">整理进度 · 60%</label>
<progress class="pdk-progress" id="progress" value="60" max="100">60%</progress>
```

表格保留 caption、表头和行头。大量数据由业务实现分页；CSS 不生成分页、排序或虚拟滚动。进度没有可靠比例时不要编造百分比，用明确“加载中”文本和忙碌状态。

### 对话框与折叠

对话框必须仍在 `.pdk` 的 DOM 后代中；React portal 到 scope 之外不会继承该作用域，请把 portal 容器放入 scope。

```html
<dialog class="pdk-dialog" id="confirm" aria-labelledby="confirm-title">
  <div class="pdk-panel-body pdk-stack">
    <h2 class="pdk-title" id="confirm-title">取消本次编辑？</h2>
    <p>未保存的修改会丢失。</p>
  </div>
  <form method="dialog" class="pdk-dialog-actions">
    <button class="pdk-button pdk-button--secondary" value="stay" autofocus>继续编辑</button>
    <button class="pdk-button pdk-button--danger" value="discard">放弃修改</button>
  </form>
</dialog>
```

用原生 `showModal()` 打开。明确标题、初始焦点、Esc 关闭与关闭后的焦点归还。`returnValue` 只返回选择，实际删除或提交由业务明确处理。展示页未提供持久化或真实破坏性动作。

折叠使用 `<details class="pdk-disclosure"><summary>标题</summary><div>内容</div></details>`，不强行把原生 summary 改为无语义的 div。

### 组件清单

| 类族 | 包含内容 |
| --- | --- |
| 布局 | container / section / stack / cluster / grid / split / hero / masthead / nav / footer |
| 字体 | display / heading / title / lead / eyebrow / prose / prose--serif / accent-word / number |
| 操作 | button / button--secondary / button--quiet / button--danger / button--icon / link / entry |
| 容器 | panel / panel--instrument / panel-head / panel-body / card / card--team-a / card--team-b |
| 信息 | meta / badge 与修饰 / callout / callout--error / empty |
| 输入 | field / label / input / hint / error / check |
| 导航与数据 | tabs / tab / tabpanel / table-wrap / table / progress |
| 浮层 | dialog / dialog-actions |
| 辅助 | brand / brand-mark / icon / inverse / muted / rule / pad / full / sr-only / skip / grid-paper / ticks / reveal / no-print |

表中所有类均加 `pdk-` 前缀。禁止无差别套用 `.pdk-reveal` 到每个表格单元或长列表行。

## 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--pdk-duration-fast` | 150ms | 背景与轻状态变化 |
| `--pdk-duration-ui` | 240ms | 按钮和卡片反馈 |
| `--pdk-duration-enter` | 600ms | 少量区块进入 |
| `--pdk-ease-out` | `cubic-bezier(.22,1,.36,1)` | 到位、抬升、揭示 |
| `--pdk-ease-in-out` | `cubic-bezier(.76,0,.24,1)` | 有起止的幕片运动，可供业务使用 |

普通反馈用 transform/opacity，位移一般 1–12px。主按钮 hover 轻抬，active 向下压，不能只有 hover 没有 active。触摸设备不依赖 hover 展示必要信息。不要无限呼吸所有状态点，也不要为每次表单确认播放整屏过场。

本包**不移植原站有生命周期的路由过场**。若另行实现遮挡转场，业务应负责：防重入、盖满后才切内容、数据等待、取消、卸载清理、异常兜底、结束恢复焦点。纯 CSS 不能保证这些不变量。不要在未到位时先切路由再用动画掩饰闪烁。

`prefers-reduced-motion: reduce` 会在 `.pdk` 内取消动画、过渡和顺滑滚动，包括加载环旋转；加载文字仍保留。若宿主使用 JavaScript/WAAPI 动画，宿主也必须读取该偏好。

## 无障碍与内容

- 正文和有意义的小字目标至少 4.5:1；控件边界、焦点等有意义的非文本目标至少 3:1。默认配色的关键组合由 `verify.mjs` 实算，数字不靠目测。
- 附加颜色、透明度、图片背景或 token 覆盖后必须重新测量。通过配色检查不等于完成 WCAG 审核。
- 不用颜色作为唯一状态。A/B、成功/失败、当前选项都有文字或形状辅助。
- 按钮最小 48px 高，tabs/导航/checkbox label 最小 44px；不把看起来很小的热点挤在一起。
- 焦点始终可见，不全局 `outline:none`。带切角或 overflow 的父级不能裁掉它。
- 一页一个主 h1。视觉大小与标题等级分开，不能为了字体大小乱用 h1。
- `.pdk-skip` 放在页面开头；目标主内容可加 `tabindex="-1"`。
- 不对整个界面常驻 `aria-live`；异步成功可用 `role="status"`，真正需要即时告知的错误才用 alert。
- 不禁止缩放；检查 200% 缩放和 320px 回流。长邮件、URL、翻译和用户输入不得撑破布局。
- 禁用原生按钮通常不可聚焦；若用户需要知道禁用原因，应将说明放在附近，而不是只放在 hover tooltip。
- 强制颜色模式提供边界与焦点基础兼容；真实屏幕阅读器、不同系统字体仍需目标项目验收。
- 按钮写动作和对象，例如“创建项目”“删除条目”；避免所有按钮都是“确定”“了解更多”。
- 默认不带演示统计。若示例中出现数字，要写明“展示数据”，不把装饰数字冒充真实指标。

## 迁移到其他网站

### 接入顺序

1. 复制本目录或仅复制 `design-kit.css`。链接路径换成新项目路径。
2. 用 `.pdk` 包住页面。局部接入时先在一张真实内容页面试用。
3. 替换品牌、文案、图片和路由；保留标题、说明、主次动作的层级。
4. 先选择页面骨架，再选择组件，不从装饰拼页面。
5. 加入目标项目自己的表单、异步、权限与导航逻辑。
6. 测试手机、长文本、键盘、reduced-motion、错误与空状态。

### 覆盖 token

默认 CSS 使用级联层：`pdk.tokens → pdk.base → pdk.layout → pdk.components → pdk.utilities`。宿主普通、未分层 CSS 的优先级高于本 kit；这是便于接入的设计，也意味着宿主的宽泛 `button`/`h1` 样式可能覆盖 kit。发生冲突先缩小宿主选择器，或给新应用明确的集成层，不堆 `!important`。

```html
<div class="pdk research-site">...</div>
```

```css
/* 加载在 kit 后的项目样式。不要直接编辑分发文件。 */
.research-site {
  --pdk-content: 82rem;
  --pdk-font-ui: 'Your Licensed Font', 'Microsoft YaHei', system-ui, sans-serif;
}
.research-site .research-results { margin-top: var(--pdk-space-6); }
```

不要在 `.pdk` 里重复嵌套 `.pdk`，否则默认 token 会重新初始化。局部深色用 `.pdk-inverse`。

### React / Vue

导入 CSS 一次，在应用布局放 `className="pdk"` 或 `class="pdk"`。不要把展示页的 DOM 查询脚本直接粘进 React/Vue；用组件状态驱动 selected/hidden/busy，用框架管理对话框和焦点。

```tsx
import './design-kit.css';

export function SaveButton({ busy, onSave }) {
  return <button type="button" className="pdk-button"
    disabled={busy} aria-busy={busy} onClick={onSave}>
    {busy ? '正在保存' : '保存修改'}
  </button>;
}
```

这段省略类型定义，展示样式接入方式，不是完整业务模块。

### 哪些可以换，哪些不宜随意换

| 保留视觉基因 | 可以按业务调整 | 需要额外设计与验证 |
| --- | --- | --- |
| 纸面/深墨/酸黄的关系 | 品牌、内容、图标、路由 | 新主色、全站暗色模式 |
| 直角、细边界、轻硬投影 | 容器宽度、列数、信息密度 | RTL、特殊书写方向 |
| 一个强主动作 | 页面骨架、表单字段 | 复杂可编辑表格、树和组合框 |
| 节制的装饰和清晰反馈 | 本地字体、标题尺寸 | 页面级遮挡转场 |
| 可见焦点与完整状态 | 作品媒体本色 | 品牌字库与资产分发许可 |

给其他设计师或 AI 的简短约束：

> 使用随附的 design-kit.css，以 `.pdk` 为作用域。保留纸灰绿、深墨、酸黄、直角与轻硬投影；主次操作明确。不要把主色改成朱红、紫色或渐变，不要添加霓虹光晕、大圆角白卡或靶心标点。读取 README 的组件语义和状态要求；样式相似不能代替键盘、焦点、空态和错误态。业务图像保持本色。

## 验收与维护

在目录运行：

```sh
node verify.mjs
```

不需安装依赖。它检查必需文件、CSS 外部依赖、token 引用、基础色锚点、HTML 的本地资源和 ID 引用、关键配色对比度。**它不是浏览器排版测试、HTML 全规范校验器或无障碍认证。**

人工验收清单：

- 第一眼能找到唯一主行动，次入口不藏在微小标签里。
- 所有真实内容读得清；媒体不被统一染色。
- 主按钮可用/hover/active/focus/disabled/busy 均合理。
- 字段有 label、错误说明；提交失败不丢输入。
- tabs 可键盘操作，弹窗 Esc 可关闭且焦点返回。
- 手机不横溢，桌面不过宽，长文本和英文仍可排版。
- 关闭 JS 后展示页核心内容可见；当前 tab 面板不会全部消失。
- reduced-motion 下无位移动画，状态仍能理解。
- 断网时样式正常；脱离原项目目录后预览仍可运行。
- 主题覆盖后重新检查对比度和系统控件外观。

版本规则建议：新增 token/组件为次版本；删类名、改变属性语义或改变默认作用域为主版本。迁移时保留一个上版视觉快照；不要将某次调参偏好自动写成不可修改的永久规则。

## 来源与边界

本规范核查的原项目来源：`app/globals.css`（核心色与曲线）、`app/home.css` / `home-next.css` / `home-duel.css`（品牌、入口与三版排版）、`app/prompt-archive.css`（档案目录）、`app/ranking.css`（数据页）、`lib/game-transitions.ts`（过场职责）、README 和当前 `docs/DECISIONS.md`（尤其 002/013/027/067/113）。这些文件只用于提炼，**运行本包不需要它们**。

品牌色取自当前代码；44/48px 热区、12px 辅助字、语义错误色、scope、级联层和通用组件 API 是本次面向跨网站复用的设计，不声称原站每个页面已经完全采用。

未复制原站字体文件、图片、图标库、品牌商标或游戏业务代码。工具包源代码是本次交付的一部分；对外发布时由项目所有者决定代码许可。不能把本包当作第三方素材的授权文件。

本目录与工作区原有未跟踪的 `design-kit/`、`docs/DESIGN.md` 独立，本次未覆盖它们。实际检查范围及未覆盖项目见 [VALIDATION.md](VALIDATION.md)。
