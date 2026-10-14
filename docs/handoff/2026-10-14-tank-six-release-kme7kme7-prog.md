# 2026-10-14 · Six tank works · kme7kme7-prog

- 负责人及唯一署名kme7kme7-prog，无协作者。提交范围a40f7f0之后的坦克库、default标签与相关说明。
- 目标：上传用户六份程序，纠正raptor和spark作者名称，按指定强度发布。
- 改动：LongCat-2.5-Preview / Viper、MiniMax M3 / vortex、Gemini 3.8 Flash / Polaris、openpangu-2.0-pro / Raptor、MiMo V2.6 Pro / Ocelot、spark / Apex Warden，库共19份。仅Polaris high，五份default；支持default展示与回放导入，复用既有品牌，保留原始程序字节和SHA。
- 决策：docs/DECISIONS.md当日登记。用户模型标签及强度优先于代理自报、目录或压缩包名字；spark保持指定名称，raptor不归DeepSeek。
- 验证：固定快照生产构建/typecheck/lint通过，引擎15项、浏览器272项通过，六新程序在三张默认图真实Worker完成，无报错/超时。SHA、标签/模型名/选人/回放/旧回放/结算/纸墨/窄屏/教程/取消/主站横推均通过；无模型调用、业务写入。源码内原始空白若被git diff检查提示则作为输入字节保留，非bot改动仍严格检查。
- 发布：仅增量tanks.html及必需hash依赖，保留其他入口、旧hash资源、后端55文件、总入口3文件及服务状态。公网验证部署后补根HANDOFF，不将本地结果当作公网结果。
- 遗留：并行海龟汤、辩论、菜单、参考原型、jianmo及既有文档补记保持，不随本轮发布。没有调整规则、决策预算、引擎或数据库。证据.local/tank-six-release-20261014/。
