# 2026-10-04 · 总入口施工提示 · Atmeplz

- 负责人：Atmeplz；执行 AI：Codex。提交基线：acf02e3，范围为本提交。
- 目标：总入口左侧添加施工提示，正常点击与运行不受影响；用户随后明确授权提交、推送、部署。
- 改动：portal/index.html 添加黄黑路障图标和「玩法升级中，后续可能有大变化」。线上已使用独立 /portal.js 及 script-src 'self'；同步 build-portal.mjs、portal/README.md 与 ARCHITECTURE.md，避免旧内联构建破坏过渡。过渡脚本与线上内容一致。
- 验证：构建、脚本语法、仅外置脚本结构断言、与线上过渡脚本逐字比较、git diff --check 通过；1440×900 / 390×844 截图目检通过，实际点击来一局加载线上首页并进入玩法菜单。本地 favicon 404 为既有问题。未跑整站 typecheck/lint/游戏回归，因为只改独立入口 HTML 与无依赖打包脚本，不改应用业务逻辑。
- 决策：见 DECISIONS.md 同日「总入口施工提示不限制进入」。无待拍板事项。
- 发布：提交时尚未替换生产文件；计划从推送后的固定提交构建，备份后原子替换 /www/wwwroot/arenaofbias-home/index.html，核验 SHA-256 及公开浏览器入口。portal.js 内容保持一致；不修改 Nginx、子站或后端。实际执行证据保存在 D:/webarenabias/.local/portal-construction-20261004。
- 遗留：原工作区既有未跟踪 components/work-frame.tsx、components/work-image.tsx、scripts/validate-work-failures.mjs、public/works 文件全部保留，不加入本次提交。原分叉工作分支保留，发布在最新主线的独立工作区完成。
