# 星渡 — GPT-6 Astra / high

正式入口是 `bot.js`；`bot-v1.js`、`bot-v2.js`、`bot-v3.js` 仅为开发版本存档。最终采用第二版，已经在运行 seed67 前冻结，之后没有调整策略。

最终 SHA-256：`94507a387c573164b95b9bae0fd45939fa0abe6cd8d32ba09eeb0e456bd3c475`。

## 设计

独立实现同步单文件 act(view)。阅读了公开进阶陪练源码以理解其行为，但没有复制或改名陪练。状态只来源于 view 和自身记忆，不读取宿主状态、隐藏地图、文件、网络、时钟或其他模型。

- 观察缓存：按宽、高、人数、席位和回合回退重建；缓存已知地形、敌将和最后见到的所有者。雾中未知障碍不当成可通行道路，未知普通格按保守的少量兵力成本估算。
- 紧急防守：由我方将军生成距离场；检测六步内威胁。相邻友军优先回援、选择能消灭的近敌或从可达领土调兵。将军保留随领地规模和可见威胁变化的兵力。
- 进攻规划：对最多十个兵堆做带阻力成本的有界路径搜索，估算每步留兵、友军汇合、敌军损失与结构增长。能够攻下的已知敌将最高优先级，其次夺城、敌方领地与探索。
- 集兵：领土成形后，把后方兵堆沿自有领土送到较大前线兵堆；目标惯性和短期反向移动惩罚减少来回调兵。
- 大图：超过4096格时缩至四个搜索源、每个最多1800个扩展节点，仍按实际 h、w 和玩家ID处理。

## 开局、冷启动和残局

不依赖回合0的固定行军路线。第0回合已有成形阵地时立即执行相同观察、防御和目标流程；中途首次调用也可直接重建。

将军遇袭优先检查能否立即斩首，再考虑回援与近敌拦截。该启发式不是完整的多军团战术求解器，多路进攻、远处大军突然露面或援军不足仍可能守不住。

使用 maxTurns-turn 限制路径深度和可兑现的城池收益。剩余不超过3回合时一般经济目标降为负值，可达敌将继续保持优先；仍无必解保证。三种残局检查只验证输入和动作兼容，本次没有正式残局解题评分，因此只能声明“仅通过输入兼容检查”。

动态正方形尺寸、2/3/4人数经过实战；64×96、128×128、20席位仅经过合成输入检查，不能据此声称已验证完整20人比赛。对未知模式和规则版本会抛出明确不支持错误，不把未知模式静默当作FFA。

## 主要迭代与开发证据

总计三轮主要策略版本，没有额外隐藏调参。全部开发批次的所有选手 faults 均为0。

| 批次 | 种子/尺寸/席位/回合上限 | 基础组 胜/平/负 | 进阶组 胜/平/负 | 说明 |
|---|---|---|---|---|
| dev1 | 11 / 14,18 / 0,2 / 1200 | 3/1/0 | 3/0/1 | 平局本人第330回合已淘汰 |
| dev2 | 37 / 14,18 / 1,3 / 1600 | 4/0/0 | 2/0/2 | 加入后备和集兵，最终采用 |
| dev3 | 37 / 14,18 / 1,3 / 1600 | 3/1/0 | 2/0/2 | 更保守版本未改善；平局本人第274回合已淘汰 |

v1 SHA：3570e71c2c8a55ed084ef74bf751b2187125de88e63128cc634a588624ccd97d。
v3 SHA：586dc0f597bdcf617422dddb2196259d1c721e3e803e4df09e9ec22ea27f021f。
旧版本报告保留用于审计，不算最终版本证据。results-summary.json 中 matchesCurrent 显式区分。

## 冻结后结果

| 批次 | 配置 | 胜 | 全局平局 | 负 | 本人已淘汰 |
|---|---|---:|---:|---:|---:|
| final-easy | 4人，seed67，14/18，席位0/1/2/3，2400回合 | 7 | 1 | 0 | 1 |
| final-hard | 4人，seed67，14/18，席位0/1/2/3，2400回合 | 5 | 0 | 3 | 3 |
| duel-final | 2人，seed83，18，席位0/1，1600回合 | 2 | 0 | 0 | 0 |
| trio-final | 3人，seed83，18，席位0/1/2，1600回合 | 3 | 0 | 0 | 0 |

基础组的全局平局为14×14、seed67、席位0，本人第77回合已淘汰；绝不能理解为本作品成功生存平局。若按本作品生存结果表述，四人基础组为7次获胜、1次被淘汰，进阶组5次获胜、3次被淘汰。

以上21场最终实战，所有参与者各自 faults 都为0：trial-astra-high、locust、blitz、fortress、luna-sentinel、sol-vanguard、terra-bastion。各回放保留逐席位faults，results-summary.json 保留逐批次逐选手统计。random未参加本次评估，不宣称它经过验证。

compat-final：9/9通过，总faults=0，最大实际单次24ms；覆盖两人14×14、三人26×26、四人18×18、二十人64×96、二十人128×128首末席位及三种残局合成输入。node --check通过，check-workspace核对58个冻结文件通过。

## 可复现命令

命令从本工作区根目录运行，输出目录必须尚不存在。复跑请把输出目录名改成作品目录内的新名称。

```powershell
node tools/evaluate.mjs --bot entries/trial-astra-high/bot.js --out entries/trial-astra-high/runs/final-easy --group easy --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-astra-high/bot.js --out entries/trial-astra-high/runs/final-hard --group hard --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-astra-high/bot.js --out entries/trial-astra-high/runs/duel-final --group hard --players 2 --seeds 83 --sizes 18 --slots 0,1 --turns 1600
node tools/evaluate.mjs --bot entries/trial-astra-high/bot.js --out entries/trial-astra-high/runs/trio-final --group hard --players 3 --seeds 83 --sizes 18 --slots 0,1,2 --turns 1600
node tools/check-compat.mjs --bot entries/trial-astra-high/bot.js --out entries/trial-astra-high/runs/compat-final
node --check entries/trial-astra-high/bot.js
node tools/check-workspace.mjs
node entries/trial-astra-high/summarize.mjs
```

## 已知弱点

- 仍可能过度分散和陷入逐格消耗；守军、前线和城池收益的启发式不能确保全局最优。
- 对近出生点的早期突袭及多方向围攻存在明显脆弱性；最终基础组有77回合被淘汰的实证。
- 路径预测假设沿途敌方基本静止，无法精确预知同步调兵；只跟踪一条低成本路径，可能错过更有利的汇兵路线。
- 将军保留兵力采用半军约束，可能在不利局面下消极等待。进阶组有3场失败，不能声称必胜或模型实力排名。
- 未做完整26×26、随机陪练、任意规则新模式或正式残局解题实战。未发现需要修改冻结引擎的缺陷。

完整交付目录保留源码、submission、报告、兼容检查、所有回放及分析/汇总脚本。未访问目录外资料、未访问其他选手、未联网、未调用其他模型、未创建子代理、未运行Git。
