# 巡衡 · GPT-6.1 Sol / high

- 作品代号：`trial-sol61-high`
- 正式主文件：`bot.js`，单文件同步 `act(view)`。
- 作者模型：GPT-6.1 Sol；思考强度：high。
- 冻结 SHA-256：`5d8c5f8410a96b221f1253051cafc50713b887c7415809736775ae9d51725cdf`
- 仅支持当前 FFA 规则 `aob-generals-ffa-1.0.0`、接口 `aob-generals-bot/1`。不宣称支持未来特殊目标关卡。

## 独立策略

本程序独立编写，没有复制或改名使用陪练。阅读了规则、API、兼容约定，以及公开的 locust、luna-sentinel、sol-vanguard、terra-bastion 的实现来理解训练环境；未访问私有作品、网络、工作区外文件或模型接口，未创建子代理。

1. **观察与记忆**：按实际宽高创建邻接表，记忆已见地形、最近所有者和兵力、已发现将军与近期行军边。山和未识别的迷雾结构阻断寻路；没有把迷雾兵力 0 当作确定无守军。对普通未知格仍使用启发式低防御估计，这是风险来源。
2. **局部护将**：从自己的将军计算至多九步的可达距离，依据七步内可见敌军估算保留兵力；危险足够近时优先侧翼截击，其次通过己方领地及时回援。邻接且可击破的敌将具有最高直接斩首优先级。该模块只响应当前可见威胁，不能保证未知方向安全。
3. **行军与进攻**：对有上限的主要兵源运行正权重搜索，路程、敌军兵力与预计损耗共同影响路线。搜索预测沿路损耗及友军汇合，评估城市、普通地、探索视野与敌将；优先选择预计能突破的敌将路线。已发现敌将会保留为目标，直到视野证实其身份改变。
4. **经济**：空地扩张带来全领地周期增长；能够支付守军且剩余时间足够时争取城市，利用城市的稳定增兵。探索价值与未见邻域数量相关，避免固定开局路线或坐标。
5. **补给**：通过己方道路向边界送出后方积累的兵力，近期反向移动被降分。这个方案成本低，但可能造成兵力分散；这是开发集已经观察到的弱点。

## 开局、冷启动与残局

程序没有基于回合编号执行固定开局脚本。首个视野就可以包含多块领地、城市、大军或可见敌将，都会立即进入同一套威胁与目标计算。宽高、人数、自己席位改变或回合回退时重建缓存；第 83 回合首次调用也不依赖之前的历史。

使用 `maxTurns - turn` 限制目标路程：不可在剩余回合内到达的目标被排除；剩余时间不足时降低普通扩张、放弃不能兑现的城市经济，并增加攻将价值。输入只剩两回合时，会考虑能及时到达的可见敌将。临危将军的救援优先级高于普通扩张，但不可救局面没有必胜解法。

**残局目前仅通过输入兼容检查。** 合成测试没有按动作推进残局，不能证明能救下将军、斩首或完成解题。普通开局的 2/3/4 人对局才是真实比赛证据。

## 开发过程与版本选择

最多三轮主要实现，全部在开发种子 11、37 上实际跑过基础和进阶组。每轮两组分别覆盖 14/18 地图：easy 用席位 0、1，hard 用席位 2、3；每组 8 场、上限 1600 回合。两组总计覆盖四个席位。完整报告、回放和历史源码均保留。

| 轮次 | easy 胜/平/负 | easy 平局时自身存活/已淘汰 | hard 胜/平/负 | hard 平局时自身存活/已淘汰 | 自己 faults |
| --- | --- | --- | --- | --- | --- |
| R1（最终选中） | 4/4/0 | 1/3 | 3/0/5 | 0/0 | 0 |
| R2（弃用） | 1/7/0 | 4/3 | 1/1/6 | 1/0 | 0 |
| R3（弃用） | 4/3/1 | 1/2 | 2/0/6 | 0/0 | 0 |

R2 加强驻军与持续主力补给，R3 尝试保守出兵及已知敌将前的集兵，但开发集获胜数均低于 R1。冻结时按开发结果恢复 R1，之后才首次运行种子 67，未根据留出结果修改代码。`bot-r1.js` 与正式源码同 SHA；R2/R3 仅为失败实验归档，不能当作正式主文件。

开发 SHA：

- R1：`5d8c5f8410a96b221f1253051cafc50713b887c7415809736775ae9d51725cdf`
- R2：`40fd14998e0600e650a40f231af901ff8910f2c6c964c2a93f6f39d4040fa50d`
- R3：`2fa4f6dfd0ead3136265fcfd3c3522eb33b8466ddd150125110d2bc09deb81c5`

历史结果不能混作最终源码的新成绩。统计工具 `audit.mjs` 读取每份报告及回放，核对最终 SHA、所有选手 faults 和终局淘汰状态，生成 `evidence-summary.json`。

## 最终同 SHA 实测

四人留出配置统一为：**seed=67、sizes=14,18、slots=0,1,2,3、turns=2400**。两组各 8 场。

| 真实对局批次 | 场数 | 胜 | 引擎平局 | 负 | 平局时自身存活 | 平局时自身已淘汰 |
| --- | --- | --- | --- | --- | --- | --- |
| `runs/final-easy` | 8 | 7 | 1 | 0 | 0 | 1 |
| `runs/final-hard` | 8 | 5 | 0 | 3 | 0 | 0 |
| `runs/final-duel`（2人，hard默认luna） | 2 | 1 | 0 | 1 | 0 | 0 |
| `runs/final-trio`（3人，hard默认luna/sol） | 3 | 1 | 0 | 2 | 0 | 0 |

基础组那场平局为 `g14-s67-p0.json`：自己在第 75 回合已淘汰，其他选手继续到 2400 回合后判平。**这不是自己守住了平局。** 如果按自身存活结果读该组，应理解为 7 胜、1 次自身淘汰。

四人合计 12 胜、1 引擎平局、3 负；含二/三人补充的最终实战合计 21 场，14 胜、1 引擎平局、6 负。全部最终实战同一冻结 SHA。最终真实对局中自己最慢宿主调用 21ms；这是本机观测值，不是跨机器时限保证。

### 所有选手 faults

所有开发与最终真实比赛共 69 场：

| 选手 | faults 总数 |
| --- | --- |
| trial-sol61-high | 0 |
| locust | 0 |
| blitz | 0 |
| fortress | 0 |
| luna-sentinel | 0 |
| sol-vanguard | 0 |
| terra-bastion | 0 |

random 未参战。最终批次上述所有实际参战选手也均为 0。无吞异常包装，无把程序异常归入纯策略输局的情况。

### 兼容与固定材料

`runs/final-compat/compat.json`：**9/9 通过，所有 case faults=0，最慢 33ms**。

- 14×14/2人，26×26/3人，18×18/4人。
- 64×96/20人，128×128/20人首席与末席。
- 第0回合成形局面、低兵将军遇袭、剩两回合且敌将可见。
- 涵盖中途初始化、尺寸变化与额外字段。

大图与 20 人仅有合成输入兼容证据，没有整场强度验证；普通真实比赛仍为本引擎支持的 2–4 人正方形。较大输入限制主要源点和每次搜索节点数，可能丢失远处有价值的路线。

`node --check` 通过；`node tools/check-workspace.mjs` 通过，固定 58 个文件未改。运行日志见 `checks.txt`。未运行与本任务无关的引擎测试、网页、发布、Git、额外随机大规模测试。

## 可复现命令

以下命令均从本工作区根目录运行；输出目录必须不存在，复跑时将目录后缀改为新的名字，仍须留在本 entry 内。

```powershell
node tools/init.mjs trial-sol61-high
node --check entries/trial-sol61-high/bot.js

# 开发每轮用对应历史 bot；R1 即最终 bot.js。
node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/dev-r1-easy --group easy --seeds 11,37 --sizes 14,18 --slots 0,1 --turns 1600
node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/dev-r1-hard --group hard --seeds 11,37 --sizes 14,18 --slots 2,3 --turns 1600

node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/final-easy --group easy --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/final-hard --group hard --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/final-duel --players 2 --group hard --seeds 67 --sizes 18 --slots 0,1 --turns 2400
node tools/evaluate.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/final-trio --players 3 --group hard --seeds 67 --sizes 18 --slots 0,1,2 --turns 2400
node tools/check-compat.mjs --bot entries/trial-sol61-high/bot.js --out entries/trial-sol61-high/runs/final-compat
node tools/check-workspace.mjs
node entries/trial-sol61-high/audit.mjs
Get-FileHash entries/trial-sol61-high/bot.js -Algorithm SHA256
```

## 已知弱点与证据边界

- 早期开拓时可能把将军兵力发得过薄，遇到尚未看到的中等部队直插会提前淘汰，开发集及最终 seed67 的基础组席位0均有实际证据。
- 后方汇兵向边界分散，不能稳定形成最有效的攻城/攻将主力；开发 seed11 的 18 地图席位0曾有显著经济优势但仍到时平局。
- 用当前视野预测路线，不能预知敌方同回合调兵或新的伏兵；即使估算能攻将，也可能被增援打断。
- 迷雾普通格与记忆兵力为启发式估计。隐藏将军、长时间失去视野或未知城市防线会使路线估计失准。
- 没有终局多步完全搜索；二/三人补充样本很少，且实际胜率低于这批四人留出结果，不能外推全模式强度。
- seed67 只有一个地图种子、每种尺寸四席，属于有限留出复测，不代表未知种子必胜，也不代表作者模型通用实力。
- 未发现、未修补引擎问题；没有改固定规则、陪练或验证工具。
