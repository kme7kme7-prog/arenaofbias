# 潮汐锋

## 作者信息

- 作品代号：`trial-sol56-high`
- 作者模型：GPT-5.6 Sol
- 思考强度：high
- 规则：`aob-generals-ffa-1.0.0`
- 最终 `bot.js` SHA-256：`5d26f6122744972ff8e49c2ced16fa56136b5058b4060e22b23e0c4b891a0707`

## 核心策略

策略按固定优先级组合，而不是执行固定开局路线：

1. 立即检查相邻可斩首的敌将，能攻下时直接全军攻击。
2. 检查己方将军的相邻威胁；能反杀则反杀，否则从己方连通领地拉最近的有效大军回援。
3. 记录已见地形、所有者、敌将坐标与信息年龄。敌将进入雾后仍是高优先级目标；旧敌方领地的价值随时间衰减。
4. 让有限数量的大军和边境军参与寻路，对敌军、可见将军、可攻城市、普通空地和迷雾分别估值。不可击败的可见守军会阻断路径，避免持续撞城。
5. 没有合适的直接进攻时，将后方大军沿己方领地汇向前线。最近移动边会降低反向移动分数，减少来回搬兵。

早期没有近敌时，将军只保留极低的和平期守军，把增长尽快转化为领地；中后期随回合增加基础守军。可见敌军接近五格以内时，守军要求按威胁兵力立即上调。将军出兵使用半军并检查出兵后留守量，其他战线尽量保持集中。

## 冷启动、残局与兼容设计

- 每次调用都先从当前 `owned`、`armies`、可见敌军和将军重建可执行判断。首次调用可以是第 0 回合的成形阵地，也可以是第 83 回合；不依赖经历过标准开局。
- 将军遇袭的局部防守优先于扩张和远程追猎。相邻敌军可击败时先反击，否则沿己方领地回援。
- 使用 `maxTurns - turn`。剩余三回合以内会压低未知地探索、放宽和平期守将，并拒绝路程来不及兑现的低价值目标；可见或已记忆的敌将仍保持最高优先级。
- 所有索引使用 `h * w` 和 `row * w + col`；玩家缓存按 `players` 创建，敌人按真实 owner 处理。尺寸、人数、席位、回合回退或 Worker 冷启动变化时会重置记忆。
- 大图限制参与全图寻路的源栈数。9 档合成检查全部通过，但这只证明输入、时限和动作格式兼容，不代表 20 人或 128×128 完整实战强度，也不代表三个残局已经实战解出。

## 主要迭代记录

- 第 1 版烟测：基础组 1 场 0 胜 1 平 0 负；进阶组 1 场 0 胜 0 平 1 负。发现第 20 回合过早提高和平期守军，50 回合时只有 5 格，属于扩张阈值错误。
- 第 2 版开发集（种子 11、37，14/18，四席，1200 回合）：基础组 16 场 3 胜 13 平 0 负；进阶组 16 场 3 胜 0 平 13 负；自身异常 0。回放分析发现路径会把无法攻下的城市当作中间格，小兵反复撞入守军。
- 第 3 版开发集（种子 11，14/18，四席，1200 回合）：修复不可击败守军的路径穿越后，基础组 8 场 8 胜；进阶组 8 场 2 胜 2 平 4 负；自身异常 0。此后冻结源码，未按种子 67 结果继续调参。

前两版报告保留在 `runs/smoke-*-v1` 和 `runs/dev-*-v2`，其 SHA 与最终源码不同，只用于说明迭代，不能作为最终成绩。`runs/dev-*-v3` 与下列最终证据对应最终 SHA。

## 最终实测证据

最终四人命令：

```powershell
node tools/evaluate.mjs --bot entries/trial-sol56-high/bot.js --out entries/trial-sol56-high/runs/final-easy-seed67 --group easy --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
node tools/evaluate.mjs --bot entries/trial-sol56-high/bot.js --out entries/trial-sol56-high/runs/final-hard-seed67 --group hard --seeds 67 --sizes 14,18 --slots 0,1,2,3 --turns 2400
```

- 基础组：8 胜、0 平、0 负。`trial-sol56-high`、`locust`、`blitz`、`fortress` 的累计 faults 均为 0。
- 进阶组：0 胜、2 平、6 负。两场平局结束时自身都仍存活：14 图为自身、Luna、Terra 三方存活；18 图为自身与 Terra 存活。六场胜者分布为 Terra 5 场、Sol 1 场。`trial-sol56-high`、`luna-sentinel`、`sol-vanguard`、`terra-bastion` 的累计 faults 均为 0。

补充真实人数变化测试均使用进阶组、18 图、种子 67、2400 回合：

```powershell
node tools/evaluate.mjs --bot entries/trial-sol56-high/bot.js --out entries/trial-sol56-high/runs/final-duel-seed67 --players 2 --group hard --seeds 67 --sizes 18 --turns 2400
node tools/evaluate.mjs --bot entries/trial-sol56-high/bot.js --out entries/trial-sol56-high/runs/final-trio-seed67 --players 3 --group hard --seeds 67 --sizes 18 --turns 2400
```

- 两人局轮换两席：2 胜、0 平、0 负；双方累计 faults 均为 0。
- 三人局轮换三席：2 胜、0 平、1 负；自身、Luna、Sol 累计 faults 均为 0，输局胜者为 Sol。

兼容命令：

```powershell
node tools/check-compat.mjs --bot entries/trial-sol56-high/bot.js --out entries/trial-sol56-high/runs/compat-final
```

结果为 9/9 PASS、总 faults 0；覆盖 14×14 两席、26×26 三席、18×18 四席、64×96 二十席、128×128 二十席首末席，以及成形开局、将军受威胁、仅剩两回合三种残局输入。最慢单次调用 14ms。

## 已知弱点

- 最终种子 67 的四人进阶组为 0 胜 2 平 6 负，明显弱于该组，尤其容易被 Terra 在多线混战中终结；不能据基础组全胜宣称整体强势或必胜。
- 威胁判断只掌握当前视野和有限历史。雾中突袭在进入将军附近前无法精确估兵，且单回合只能调动一支部队，多线夹击时可能回援不及。
- 进攻偏集中，决斗和三人局表现好于四人进阶 FFA；集中军离开本土后，侧翼与将军周围可能出现可乘之机。
- 对未识别的雾中结构，兵力不足 56 时选择绕行。这能避免撞山和无谓攻城，但可能延迟发现或占领关键城市。
- 记忆中的敌将坐标只有重新看见该格后才能证伪；目标在雾中被第三方攻下时，策略可能短期继续向旧坐标推进。
