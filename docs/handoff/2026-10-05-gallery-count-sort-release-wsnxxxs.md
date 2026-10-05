# 2026-10-05 · Gallery 默认排序发布配套游戏复核 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex Desktop。
- 范围：e4e0411 起点，本轮只新增 HANDOFF 与本归档。

## 本轮目标与改动

按用户授权完成四仓联调的游戏仓状态和发布检查。工作树初始干净，fetch 后 origin/main、fork/main 与 main 完全一致；功能分支均已合入，既有工作树和生成物保留。没有业务代码需要提交或合并，本轮记录复核结果并以一条英文简单句提交推送。

## 验证

lint、typecheck、build:check、diff --check 通过；社区题号 3 项、loading 前台时钟及读取取消、vote-split --votes-only、work-ready 16 项全部通过。work-ready 使用隔离浏览器和内存 API 夹具，没有生产写入。没有 check/test 聚合脚本；完整 vote-split 的退役巡览断言不适用，因此不重复执行。未全量复测真实作品、目检生产页面、测试登录计票邮件或真机，因为本轮没有业务改动，统一上线验收由主任务负责。

## 决策与明确没做

沿用既有决定，无新产品决策。未部署、改后端、Gallery、数据包、作品或生产数据库。正式发布需固定 SHA、LF 导出、生产 VITE_API_BASE_URL，并保留旧 works/ZIP/hash 及 game /api 反代；check 模式 dist 仅验证。

## 遗留物与下一步建议

既有 worktree、output/dist 和本地数据保留。主任务协调固定提交构建及统一部署，本仓无需再次合并旧分支。
