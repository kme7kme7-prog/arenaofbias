# 2026-10-12 · 总入口来一局灰度恢复 · kme7kme7-prog

- 用户要求只补来一局入口，保留导航页所有其他内容；恢复链接到https://game.arenaofbias.icu/，现有portal.js仍附加entry=portal并等待左右色块过场。
- 源码仅portal/index.html一处元素。生产已有不同的施工文案及locked样式，本次不捎带同步；基于线上现有HTML，只换href与aria-disabled属性，保留locked类、淡化外观、所有字节及其他文件。
- 独立构建、JS语法、差异检查通过；候选20项通过，桌面/手机截图目检、Enter/触屏到达真实game并正常揭幕、无JS href、原CSS/右侧/施工提示和无页面异常。旧check-portal-entry对当前主站首帧顺序断言失败，未修旧夹具，未跑整站业务回归。
- 发布准备：源码正常推送，生产index一致备份和原子替换，所有非目标文件哈希保持；不重启服务、不改数据或任何子站。公网验收/哈希和备份结果另补记，准备状态不是上线证明。
- 范围与署名：只署kme7kme7-prog，无协作者，其他未提交及未跟踪资料保持。证据.local/portal-enable-20261012。
