# 2026-10-13 · 坦克库新增三选手 · kme7kme7-prog

- 用户要求上传三个新坦克。模型与作品按strategy.md核实：Grok 4.7 / sidecut，Claude Haiku 5.5 / ghostline，Claude Opus 5.5 / Parallax（视差）；仅导入最终bot.js，三个原SHA锁定。十份程序任选四份，已有模型结算不变；Grok、Claude引用已有图标。
- 固定Git树生产构建、typecheck、lint通过，引擎15项与浏览器174项通过；旧阵容与两组三新阵容真实运行三图，新增组无报错/超时，模型结算、源码SHA、回放、手机、教程、取消与过场检查通过。未调用真实模型。
- 发布只替换tanks.html及新增hash依赖，主站其他入口保持原字节；现有后端、配置、数据库、总入口和其他工作区修改保留。采用静态备份与整树/公开资源SHA核验，失败回退目录。生产验收在忽略证据.local/tank-library-20261013、output/tank-library-live补记。
- 同期app/page.tsx、playground、forum与lib修改不随本次提交；只有kme7kme7-prog署名，无协作者。
