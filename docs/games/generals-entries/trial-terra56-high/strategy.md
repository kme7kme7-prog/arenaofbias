# 边境潮汐

## 作者信息

- 作品代号：`trial-terra56-high`
- 作品名：边境潮汐
- 作者模型：GPT-5.6 Terra
- 思考强度：high
- 规则：`aob-generals-ffa-1.0.0`，接口：`aob-generals-bot/1`
- 定稿 `bot.js` SHA-256：`140ab29b23374c43f626cc84fa9da500fcc70969c45a7c24ea0ec9ce64017465`

## 核心策略

每回合从当前可见局面重建可行动的兵堆、敌军、城市和前沿。只记忆已看见的山、城市和敌将最后位置，不把雾格当作空地。优先直接斩首，再处理己将相邻敌军或从己方连通区域补兵，之后用可见敌军、城市、中立格、无结构雾格和记忆敌将构成加权目标。从最大兵堆与有限前沿兵堆分别做宽高分离 BFS，按目标价值、距离、兵力和将军风险选择第一步；没有可用目标时，把后方兵向最强前沿汇集。

首个观察不假设为第 0 回合。仅在己方不足四块领地且前 46 回合，将军以 1 兵保留阈值参与扩张；其他时候阈值按当前敌军总兵力动态提高。发现相邻威胁时无条件优先防守；剩余不超过三回合时，非将军目标会大幅降权，只保留可能即时斩首的路线。

缓存按 `h`、`w`、`players`、`player` 和回合回退重建，索引始终使用 `row * w + col`，对手从 `owners` 动态读取。大图限制战略 BFS 的兵堆候选数（最大兵堆 8 个，另取最多 8 个前沿点），避免为每块领地重复全图搜索。

## 训练与冻结

开发只使用种子 11、37；最终 seed 67 在开发完成后才首次使用，未再据其调参。主要策略迭代共两次：初版和一次有效修正。修正前在“仅有将军”状态使用过高守备阈值，基础组 16 场全平；修正为冷启动扩张后重新训练。中间 `dev-*-02` 曾因一次括号语法错误导致每局累计 50 faults，已作为无效运行保留在 `runs/`，没有计入策略胜负；定稿已通过 `node --check`。

修正后的开发集（seed 11，14/18，四席位，1200 回合）：

- 基础组：8 场，1 胜 7 平 0 负；本作品 faults 0，所有陪练 faults 0。
- 进阶组：8 场，2 胜 1 平 5 负；本作品 faults 0，所有陪练 faults 0。

最终源码没有在最终复测期间改动，以下三份文件均记录同一 SHA：

- `runs/final-easy-seed67/report.json`
- `runs/final-hard-seed67/report.json`
- `runs/compat-final/compat.json`

最终复测命令：

```powershell
node tools/evaluate.mjs --bot entries/trial-terra56-high/bot.js --out entries/trial-terra56-high/runs/final-easy-seed67 --group easy --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-terra56-high/bot.js --out entries/trial-terra56-high/runs/final-hard-seed67 --group hard --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/check-compat.mjs --bot entries/trial-terra56-high/bot.js --out entries/trial-terra56-high/runs/compat-final
node --check entries/trial-terra56-high/bot.js
node tools/check-workspace.mjs
```

最终 seed 67 结果（14/18，slots 0/1/2/3，2400 回合）：

- 基础组：8 场，3 胜 5 平 0 负；本作品 faults 0；Locust、Blitz、Fortress 合计 faults 0。平局均为 2400 回合上限，并不表示本作品获胜或淘汰其他人。
- 进阶组：8 场，4 胜 0 平 4 负；本作品 faults 0；Luna Sentinel、Sol Vanguard、Terra Bastion 合计 faults 0。
- 兼容：9/9 合成视野探针 PASS，faults 0；最慢调用为 `large-20-last` 的 14ms。该检查只证明输入、坐标和同步调用兼容，不代表已完成 20 人或大图实战。
- 工作区固定材料核对：`node tools/check-workspace.mjs` 通过（58 文件）。

## 已知弱点与边界

- 基础组仍有 5 场到回合上限的平局，进阶组最终胜率为 4/8，不能据此宣称通用强度或必胜。
- 敌将离开视野后坐标和兵力会过时，追击可能绕路或错估需要的兵力。
- 将军威胁处理只覆盖相邻敌军和己方连通补给，迷雾外的多回合包围可能防守不足。
- 短时限只通过目标降权和可见斩首倾斜处理，未对具体残局求解。残局、大图和 20 席位仅通过合成输入兼容检查，未作为完整比赛验证。
