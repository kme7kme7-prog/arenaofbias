# 总入口

`index.html` 以 2026-10-01 公网总入口源码为基线，保留原文案、色彩和布局。
本目录为独立静态站源码，发布到 `arenaofbias.icu`；不要覆盖竞技场构建目录。

线上总入口只通过 `/` 返回导航页（`/index.html` 会 301 到竞技场，所以 canonical 与 og:url 写 `https://arenaofbias.icu/`）。根目录 `/www/wwwroot/arenaofbias-home/` 中真实存在的普通文件直接返回，其余路径照旧 301 到竞技场。文件名不能以点开头（返回 404），也不能用 `.bak`、`.old`、`.tmp` 等后缀（会被 301）。

发布前运行 `node scripts/build-portal.mjs`，它只写入 `output/portal-dist/` 下的 `index.html`、`portal.js`、`robots.txt`、`sitemap.xml` 与 `share-portal.png`（CSS 内联，JS 外置以兼容线上 `script-src 'self'`），不清空目录。发布时逐个上传这些文件，不整目录同步：不要删除根目录里已有的 `.well-known/` 和站长平台验证文件（`googleXXXX.html`、`baidu_verify_xxx.html`、`BingSiteAuth.xml`，同样直接放在根目录）。

`index.html` 头部的 title、description、canonical、Open Graph 与 WebSite 结构化数据用于搜索和 QQ/微信分享卡片（它们只读原始 HTML）。分享图 `share-portal.png`（1200×630）目前是占位图。

两侧按钮先将所选色块铺满视口，再导航至对应子域的 `?entry=portal`。
目标站必须同时发布首帧遮罩和到达门控，才会在内容就绪后揭幕。
正常外链（新标签、组合键、禁用 JS）仍可直接导航。

到达门控以 Show1 `public/entry-boot.js` 为源，Gallery `site/entry-boot.js`
保留相同副本。等待首屏、字体和首屏图片；25 秒未完成或加载出错转为失败，
失败后迟到的就绪信号不会自动揭幕。目标服务器完全不可达时仍由浏览器显示错误页。

本地可使用任意静态 HTTP 服务预览本目录；跨站验收使用
`node scripts/validate-portal-entry.mjs` 的三个独立本地 origin 映射。
