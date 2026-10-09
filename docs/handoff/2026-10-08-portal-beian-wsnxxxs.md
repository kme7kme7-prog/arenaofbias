# 2026-10-08 · 总入口备案链接 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：Codex。范围：origin/main dadf17d 上独立导航页源码、交接与本归档；隔离工作区 codex/portal-beian-20261008。
- 目标：用户要求 arenaofbias.icu 导航页增加备案号、美观摆放，并提交、推送、部署。
- 改动：portal/index.html 页脚条款/隐私后添加「闽ICP备2026019671号-2」，沿用两子站现有域名备案号，链接 https://beian.miit.gov.cn/，新窗口打开；页脚信息导航补可访问名称。桌面靠右，手机左对齐并允许自然换行，备案号自身不拆行。
- 决策：只改页脚。生产施工文案与禁用玩法按钮存在早于本轮的源码/线上差异，不能因本次备案发布一起改变。使用现有 build-portal.mjs，从当前线上入口重建源输入，构建先逐字节复现旧线上 HTML，再应用本轮三个页脚差异；断言新旧成品仅这些差异。没有待拍板事项。
- 验证：独立入口构建、node --check portal/transition.js、现有 check-portal-entry.mjs、git diff --check 通过；本地桌面1440/手机390截图目检、320宽无横溢，公网桌面1440/手机390截图目检、备案内容与href、完整HTML SHA核对通过。控制台仅既有favicon404，无捕获的脚本异常。Gallery配套 npm run check 66文件/0错，npm test 30/30，npm run build 176件/69site，CI=1 npm run check:intake 0错/8既有提示；该仓并行功能修改未纳入本轮。
- 发布：备份后仅原子替换 /www/wwwroot/arenaofbias-home/index.html，保留原权限与归属。旧SHA 5e363780a33da943faf7074a0dfcf31c7d05c00640e1a9f3924f405038176756，新SHA 94b25484d9ebc267d3c3a0c41b1602fb5c4207d7554f9019456f93580872d558；服务器与公网一致。portal.js SHA 2cce0d1378e553d8a46e17d801ddb07bfaaaef1de4f5fed72300442b994315e1 保持不变。
- 明确没做：没有整站游戏 typecheck/lint/build 或全交互/真机验收，因为只改独立入口 HTML/CSS；没有修改过渡行为、Nginx、后端、子站或业务数据，没有新增测试。没有发布Gallery或私有数据包。
- 遗留物：备份 /root/aob-portal-beian-20261008/index.html.before；忽略的本地证据 Gallery output/portal-preview/，含线上旧HTML、可复现构建脚本、hash报告及截图。原游戏工作树与其他会话的Gallery改动保持原样；本轮一条英文提交、署名wsnxxxs及其GitHub noreply邮箱，正常推送origin/main，无强推。
