# 2026-09-30 · vote-release · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 / Codex desktop
- 提交范围：投票分支发布 `980541642706a3cd9141c3c90ab0da55bec93b87`；后端配套 `c0ab6acf225ebcb4d99a7c3a5e145d011ee93d37`。收尾文档提交不重新部署。

## 本轮目标

按用户「推送部署」发布主站服务端投票聚合，并执行已授权的主站/画廊全部投票清零。

## 改动

- main 和 show1-vote-processing 普通快进推送；保留最新长短题目切换、纸墨主题和原有动效。真实模式榜单读取服务端 aggregate，分类/范围切换取消过时请求；算法细节见上一轮投票归档。
- 共享后端合并最新审核/relay/共享题库后发布，从生产完整停写备份清除 622 票和 622 旧对局，去重一并重置，旧快照不参与计分。27 用户、267 作品、16 评论、56 表情、6 猜题成绩和其余表逐行保留，仅追加清零审计；数据包仍 2cb2a5b。
- 本站从 Git archive 建立独立源码目录，复用经 npm ls 核对的现有依赖构建；完整 786 文件 SHA256 清单通过，更新 6 文件/暂存目录移除 4 旧资源后切换。

## 决策

沿用已确认的 server 计算与两站清零；分支名不含 codex。没有新待拍板事项。收尾不新增无关决策记录。

## 验证

- 当前源码 typecheck/build、validate:leaderboard 12/12 通过；合并双主题后的 check:theme/check:motion/改动源文件定向 lint 通过。既有 scripts 全量 lint 问题未改，未重复全量 lint。
- 后端本机/VPS check 68 文件、141/141 测试通过，GitHub CI 36694501472 成功，实际部署 139 个跟踪文件匹配目标提交；v19 无新迁移。
- 公网两范围×三分类、两组 ratings/games 和 Gallery 榜单为零；3 个入口和 10 个 JS/CSS 文件 200、哈希相同。HTML no-cache，资源沿用现场 max-age=2592000。
- 浏览器空榜、分类/正式切换、纸墨主题、390px 无横向溢出、两侧作品投票入口及 Gallery 首页/零票榜单正常，无 console error。未创建生产测试票/投稿、未重复付费审核或全部原作交互。
- 安装边界：既有 lock 缺少可选 @emnapi 包导致 fresh npm ci 的问题保留，npm ls --depth=0 成功后使用现有依赖；没有改锁文件或引入依赖。

## 明确没做

没有部署 Gallery 静态目录、数据仓或 Nginx 配置；截图/审核/relay 配置保持。生产匿名入口验收未执行登录后的真实投票，写入与算法由隔离后端/浏览器测试覆盖。

## 遗留物

本机发布材料在 server worktree 的忽略目录 output/vote-release/。完整旧站保留在 /www/wwwroot/show1-dist.prev；更早副本在 show1-dist-backups。停写库 before-reset.db、旧后端、manifest、演练及正式验收证据在 VPS /root/arenaofbias-vote-release-20260930-c0ab6ac/。工作区他人遗留未动。

## 下一步建议

新票从零正常累计。回滚后端须先保存上线后的新业务并核对数据库恢复范围；旧后端会读取冻结快照票，不能仅退代码。详细恢复注意事项见共享后端同日 vote-release 归档。
