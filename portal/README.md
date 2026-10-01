# 总入口

`index.html` 以 2026-10-01 公网总入口源码为基线，保留原文案、色彩和布局。
本目录为独立静态站源码，发布到 `arenaofbias.icu`；不要覆盖竞技场构建目录。

线上总入口仅 `/` 提供静态 HTML，其他路径重定向竞技场。发布前运行
`node scripts/build-portal.mjs`，只发布 `output/portal-dist/index.html`（CSS/JS 内联）。
不需要修改 Nginx 或破坏旧路径跳转。

两侧按钮先将所选色块铺满视口，再导航至对应子域的 `?entry=portal`。
目标站必须同时发布首帧遮罩和到达门控，才会在内容就绪后揭幕。
正常外链（新标签、组合键、禁用 JS）仍可直接导航。

到达门控以 Show1 `public/entry-boot.js` 为源，Gallery `site/entry-boot.js`
保留相同副本。等待首屏、字体和首屏图片；25 秒未完成或加载出错转为失败，
失败后迟到的就绪信号不会自动揭幕。目标服务器完全不可达时仍由浏览器显示错误页。

本地可使用任意静态 HTTP 服务预览本目录；跨站验收使用
`node scripts/validate-portal-entry.mjs` 的三个独立本地 origin 映射。
