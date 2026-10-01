# 2026-10-01 · 四仓同步与统一部署 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：Codex
- 功能基线：`f304d26..72c7f103b0eba237a572c75ed7dd95e5d8681e06`；本轮最终提交仅文档。

## 本轮目标

按用户授权核查四仓推送状况，保留协作者有效修改，合并应合入分支，关闭无用分支/PR，更新交接并统一部署。

## 改动

- 本仓初始干净，仅 main worktree。远端主题分支两条 Atmeplz 提交有效且已先行上线；main 从 f304d26 快进至 72c7f10，保留作者。origin/main 与 fork/main 常规 push 同步，祖先证明后删除 origin/codex/paper-ink-theme。无开放 PR，无本地待删除主题分支，无强推。
- 更新根交接及长期发布说明，明确独立总入口与 game 现行拓扑。本仓无数据包 pin，正式题目/作品由共享 API 运行时提供。
- 从已推送 72c7f10 的 core.autocrlf=false git archive 构建 game/portal，仅 junction 复用既有 node_modules，排除工作区未跟踪作品。初次 export 受 autocrlf 影响发现 CRLF，已重新生成 LF 并复跑全部门禁；正式产物来自 source-lf。

## 决策

沿用既有产品与主题决定，不新增产品决策。最终文档后继不需重建已核对的功能基线。

## 验证与实际部署

- Node 24.16.0 本地 LF export 上 typecheck、lint、check:game、check:theme、build、portal build 通过；主会话使用 Gallery 最终 final-source-lf 完成 check-portal-entry，协议一致检查通过。
- 未重新 npm ci：复用已有依赖；未重复既有完整浏览器回归：本轮仅快进已验收实现。
- 主会话于 2026-10-01T11:26:56.467257Z（Brisbane 21:26:56）切换 game 与 Gallery。规范 LF Show1 72c7f10 的完整 820 文件、Gallery e23d9a5 的完整 2417 文件，逐项 SHA-256/精确集合线上通过。总入口 arenaofbias-home/index.html 已与当前源码产物完全相同，1 文件核对通过，未重复切换。
- 正式数据包 ba442b61 / source 997676d 的规范 2366 文件核对通过，20 题/182 件；前后端 catalogDigest 同为 `ee927cc83ceb774170a86e33bfa6b66453a8c50957329eb4f01a0584b2311ae3`。
- 生产 Node 22 后端源码 23574、数据库 v25 已部署，capture/content/auto=true。立即切换前后计数及 integrity 通过；完整后端记录见 arenaofbias-server/docs/archive/2026-10-01-latest-release-wsnxxxs.md。
- 三站公网 HTTPS 200，总入口两卡片前往 game/gallery 正确；game 首屏纸面与登录/注册入口正常，Gallery 展示 182 份，console error 0。viewport override 未生效，实际 609px，本轮不声明完成窄屏验收。
- 旧目录 *.prev 保留；服务器备份与验证证据在 `/root/aob-final-release-20261001/`。

## 明确没做

没有创建生产测试账号、投稿、投票、清票、数据库恢复或依赖升级。本仓执行者未直接操作生产，统一部署及其验证由主会话完成。

## 遗留物

忽略的 dist/node_modules/output 历史证据及本轮 archive/export 保持；未清理他人文件。文档最终提交后同步 origin/main 与 fork/main，不触发再次部署。
