# 2026-10-23 排位按需读取与账号边界 - wsnxxxs

负责人 wsnxxxs；主代理与三个同模型子代理并行修复及交叉复核。四仓先同步并核对干净基线；用户已授权本轮修复、提交推送及上线。

## Changes and decisions

正式ladder入口仅在身份相关字段变化时通知；state在途共享、请求代际与12秒含正文截止，真实换号清私密作品、队列、CSRF及草稿，同账号刷新保留编辑。预览失败可随下一次state恢复，不提前读取完整回放。上传、排赛、队列操作和文件文本迟到回执绑定账号代际，不重置新草稿或补发命令。新快照缩容时页数归位。

## Verification

typecheck、相关默认/API lint、主构建与独立ladder构建通过，原主dist1295文件逐字未变。2项旧版复现及14项候选真实dist浏览器通过，1440/390无异常/横溢。公网两宽度实际state/preview完成，指南/记录不读完整回放，手动两次打开共1次回放GET；主代理已目视。未重跑冻结引擎长期对局或无关全仓测试。

## Deployment and remaining work

仅ladder.html及两个新JS共3文件402194B；4保留依赖匹配生产hash。两JS增加1049B，本机gzip+371B（非公网协商测量）。保留其他所有入口和旧资源，回滚/www/wwwroot/show1-dist.before-reads5-20261023。不发布协调器、引擎、i5或成绩；ENGINE/RUNTIME指纹相同。

One English commit, verified wsnxxxs noreply identity. Actual SHA/CI: parent private performance-round5-20261023 receipts. No private fixtures, logs or database snapshots committed. No changes to source works, model registration, datapack or frozen game rules. No production business writes in QA. Data repo unchanged: no empty commit. Subsequent user request for dots branch integration and senior assistant is separate, not claimed complete here. No unrelated uncommitted files.
