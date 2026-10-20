# 2026-10-20 · 搜索收录与分享卡片元信息 · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：按本轮提交规则不署名
- 提交范围：本 PR 的单个提交（写于提交前）。用户授权开 PR，未授权合并或部署。

## 本轮目标

kme7 希望网站能在百度、Bing、Google 按名字「亿模亿样」搜到（很多场合只能报名字）；QQ、微信的分享卡片只读原始 HTML，要显示正式介绍，og:image 用绝对 https 地址；缺 1200×630 分享图时先做占位图。

## 改动

- 总入口 `portal/index.html`
  - title 由「Arena 入口」改为「亿模亿样 · 偏见试验场 — 同一道题，两种看法」。
  - 新增 description、canonical、Open Graph、itemprop、twitter 和 WebSite 结构化数据。
  - 分享图为 `https://arenaofbias.icu/share-portal.png`，**占位**图，在本机用 Pillow 和 Noto CJK 字体按入口页配色生成。
- `portal/robots.txt`、`portal/sitemap.xml`、`portal/share-portal.png`：由 `scripts/build-portal.mjs` 复制进 `output/portal-dist/`；脚本只写这五个文件，不清空目录。`portal/README.md` 写明 apex 根目录的文件规则和发布注意事项。
- 竞技场 `index.html`
  - canonical 和 og:url 改为 `https://game.arenaofbias.icu/`（原先误指 apex）。
  - og:image 和 twitter:image 改为 game 直链（原先经 apex 301 跳转）。
  - title 和 description 加上「亿模亿样」，新增 itemprop 和 WebSite 结构化数据。
  - `#root` 内放静态介绍和玩法链接，带内联样式，并加 noscript。
- `lib/locale.ts`：运行时标题同步带上站名。
- `playground.html`、`objects.html`、`tier.html`、`tanks.html`、`ladder.html`、`generals.html`：只在 head 加 description、canonical、og、itemprop、twitter，原 title 不变。`ladder.html` 保留 CRLF 换行。
- `public/robots.txt`：屏蔽 `/admin.html`、`/capture.html`；`public/sitemap.xml`：首页和六个玩法页。

## 决策

- 已记入 DECISIONS「2026-10-20 · 搜索收录与分享卡片元信息」。
- 待拍板：各页正式文案、两张分享图（总入口占位图、Gallery 占位图）的正式设计；「亿模亿样姊妹站」这一说法是否合适。

## 验证

- `npm run typecheck`：通过。
- `npm run lint`：本轮文件 0 错误。另有 1992 条既有错误，全部在 `app/tanks/royale/bots/`，本轮未改这些文件。
- `npm run build`、`vite build -c vite.ladder.config.ts`、`node scripts/build-portal.mjs`：通过，产物原始 HTML 里新标签齐全（用 grep 核对 title、canonical、og:image 和站名）。
- `node scripts/validate-locale.mjs`：通过。
- `vite preview` 加 headless Chrome：首页静态介绍被 React 替换，运行后标题正确。
- 未跑：`scripts/check-portal-entry.mjs` 写死了 `../Show2/...` 的 Gallery 路径，`scripts/validate-portal-entry.mjs` 需要 msedge，本机都没有。
- `npm ci` 因既有 lock 不同步失败（缺 `@emnapi/*`），改用 `npm install --package-lock=false`，没有改 lock。

## 明确没做

- 没部署，没改 Nginx。
- 发现 `/tier`、`/generals` 先 301 到带斜杠的目录，再返回 403（`tier/`、`generals/` 是资源目录）。这是线上路由问题，本轮未修，canonical 和 sitemap 用 `.html` 地址。

## 遗留物

无。

## 下一步建议

- 发布后在三个站长平台提交 sitemap；验证文件放 apex 根目录或 `public/` 根目录。

## 勘误（2026-10-20 追加提交）

- 按 kme7 定稿改文案：game 是 AI 对战游戏场，不再写「凭直觉二选一」「姊妹站」。game 的 title、og:title、twitter:title 和运行时标题统一为「偏见试验场 · AI 对战游戏场 | 亿模亿样」（英文「Arena of Bias · AI Game Arena | ArenaGalleri」）。description、og:description、twitter:description 统一为「今天，看 AI 玩点什么？攻城对垒、坦克大战、博弈联赛、辩论交锋，几个 AI 同场较劲，你来围观、你来评判。」，静态介绍与 noscript 同步。
- apex：title 改为「亿模亿样 · 偏见试验场 — AI 模型对比与 AI 对战游戏」；顶栏、正文里介绍 game 的文字、description、og 和 JSON-LD 同步改；`share-portal.png` 左半边重新生成。
- 随心玩、坦克斗蛐蛐、将军对垒三页的 description 按 `reference/menu-demo/modes.mjs` 与页面实际内容重写。
- 验证：typecheck、build、ladder 构建、build-portal 通过；grep 产物，新文案都在，旧说法没有残留。
