# 单文件 bot 接口

写普通 JavaScript 脚本，在顶层声明同步函数：

```js
let previousTurn = -1;
function act(view) {
  if (view.turn <= previousTurn) { /* 需要时重置自己记忆 */ }
  previousTurn = view.turn;
  for (let i = 0; i < view.owned.length; i++) {
    if (!view.owned[i] || view.armies[i] <= 1) continue;
    const r = Math.floor(i / view.w), c = i % view.w;
    if (r > 0 && !view.mountains[i - view.w]) return [r, c, 0, false];
  }
  return null;
}
```

这只是格式例子，不是推荐策略。不要 module.exports、import/export、require、网络、文件、DOM、计时器、异步、动态代码生成或系统时间。bot.js 最大256KiB。支持标准数组、对象、Set/Map、TypedArray、常规 Math。用作用域内 Math.random() 获得本局固定随机流，不能访问 globalThis.Math 来绕过它。

## view

所有格子数组都是普通一维 JS Array；索引 r*w+c。每次传入新的副本，自行保存需要的记忆。所有观察对应动作执行前的回合。

| 字段 | 内容 |
| --- | --- |
| apiVersion | `aob-generals-bot/1`；新增可选字段不升级主版本 |
| rulesVersion,mode | 当前规则 `aob-generals-ffa-1.0.0`；模式 `ffa` |
| players | 本场总席位数；已淘汰席位不重新编号 |
| maxTurns | 本局回合上限 |
| rules | generalTrade=false、fogRadius=1、structureGrowthEvery=2、landGrowthEvery=50、diagonalMovement=false |
| h,w | 地图高度、宽度；分别使用，不能假设相等 |
| turn | 当前回合，第一步为0 |
| player | 自己席位，0..人数-1 |
| armies | 可见格兵力；雾内为0，0不代表真实无兵 |
| owned | 是否自己的领地 |
| opponent | 是否可见敌方领地 |
| neutral | 是否可见中立地/城 |
| fog | 未见普通格，包括隐藏将军 |
| structures_in_fog | 雾里的山或城市，不能区分二者 |
| mountains | 可见山地 |
| castles | 可见城市 |
| generals | 可见将军 |
| visible | 本回合可见性 |
| owners | 可见所有者：-2山、-1中立、0..players-1 玩家；-3未知 |
| land,army | 自己总面积、总兵力 |
| enemy_land,enemy_army | 所有其他玩家合计面积、兵力 |

动作 null 或 [行,列,方向,半军]。方向0上、1下、2左、3右；半军必须布尔值。没有额外动作或写入引擎的权限。

## 运行寿命与确定性

每位选手独立 Worker，局开始新建、结束释放；正常回合保留顶层变量。宿主超时会终止 Worker，下次从头初始化，故代码应能在任意 view.turn 恢复。累计异常不重置。Node 的 VM 决策超时可能在原 Worker 内返回异常；不要依赖超时后的内部状态。

相同引擎、席位、地图种子和只使用本接口的合法策略，可重现同一对局。预算是实际设备耗时，不是确定性指令计数；慢机器仍可能超时。请把常规单步控制在几十毫秒以内，为不同设备留余量。

浏览器 Worker 与 Node VM 是本机娱乐的隔离与止损措施，不承诺能安全执行蓄意恶意程序。本包没有模型付费调用。比赛不会训练神经网络权重；选手是你独立编写的决策程序。


## 向后兼容

原有字段和动作格式保持不变，旧 bot 可以忽略新增元信息。不要比较 view 的精确键集合。新模板按人数、宽高与席位初始化缓存；当前规则的真实比赛仍限 2–4 人、8–26 地图。见 `../bot-authoring/兼容性与扩展.md` 的合成检查与未来扩展边界。
