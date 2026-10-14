# 2026-10-14 · Correct tank display names · kme7kme7-prog

- 负责人及唯一署名kme7kme7-prog，无协作者。范围3cb6443之后坦克元数据/品牌匹配/说明，保留其他工作区改动。
- 目标：按用户最终纠正，模型Gemini 4 Argon、坦克Apex Warden，模型OpenPangu 2.0 Pro、坦克Raptor（猛禽）。不把spark作为作者或最终坦克展示名。
- 改动：登记名称及Google/Huawei品牌条件，当前规则和README更新。作品ID、SHA、程序、default强度和引擎不改；旧回放仍识别同一作品。
- 决策：docs/DECISIONS.md当日最终名称纠正显式覆盖旧spark作者记录。
- 验证：最终命名快照生产构建通过，typecheck/lint通过，引擎15项、浏览器272项通过。真实Worker、19份登记、标签/结算/回放/旧回放、纸墨/窄屏和菜单横推通过；不涉及模型调用。部署后另补公网结果。
- 发布：只增量tanks.html及对应hash脚本，保留其他入口、后端55文件、总入口3文件和服务状态。
- 遗留：并行玩法、原型与历史交接补记保留，不随本轮发布。证据.local/tank-names-release-20261014/，没有改数据库。
