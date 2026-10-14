# 2026-10-14 · Two tank works without tests · kme7kme7-prog

- 负责人及唯一Git署名kme7kme7-prog，无协作者；范围7faa6b6之后两份登记程序及相关文档。
- 目标：按用户指令直接上传MiniMax M3.1 Tank.zip与step5-zcode-high.zip，不测试。
- 改动：MiniMax M3.1 / redline（default）、Step 5 Preview / peregrine（游隼）（high），库21份。只复制策略声明最终bot.js，原字节与SHA保留；排除Mac元数据。没有改引擎、规则或其他作品。
- 决策：本轮docs/DECISIONS.md；用户明确跳过测试，Step强度据包名high，MiniMax使用default。
- 验证：生产打包通过；未跑typecheck/lint、引擎/浏览器测试或对局，原因是用户明确要求，不宣称运行通过。部署仅核对公开文件字节与保护哈希。
- 发布：只增量坦克入口/依赖，保留其他页面、旧hash、后端55运行文件、总入口3文件及服务状态；公网发布结果补根HANDOFF。
- 遗留：并行玩法、原型与既有补记保持，不随本轮提交；证据.local/tank-two-release-20261014/。没有调用模型或改数据库。
