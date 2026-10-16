// A deterministic timeline keeps the key cue, troop motion and result in sync.
export function sampleLesson(scene, elapsed, manualStage=null) {
  if(manualStage!==null)return {stage:manualStage,phase:manualStage?'result':'select',pressed:false,arrow:null};
  if(!scene.arrow){
    const total=scene.stages.length*2800+1000;
    return {stage:Math.min(scene.stages.length-1,Math.floor(elapsed%total/2800)),phase:'observe',pressed:false,arrow:null};
  }
  const total=4400+(scene.stages.length-1)*2800+800,t=elapsed%total;
  const phase=t<1200?'point':t<2400?'select':t<3000?'press':t<4400?'move':'result';
  const stage=t<4400?0:Math.min(scene.stages.length-1,1+Math.floor((t-4400)/2800));
  const p=Math.max(0,Math.min(1,(t-3000)/1400)),eased=p*p*(3-2*p);
  return {stage,phase,pressed:t>=2400&&t<3400,arrow:phase==='move'?{...scene.arrow,progress:eased}:null};
}

export const instructions={
  welcome:['选“看 AI 交锋”或“我来当将军”。','从选手库安排每个席位。','点击开始；真人局只看得到自己的视野。'],
  maps:['点击一个基底战场，预览地图。','修改种子或点随机按钮换地形。','人数也影响出生点；复现时一起保留。'],
  roster:['点席位卡，打开选手库。','点作品加入；圆点可以更换颜色。','自己的 bot 可用 JS + JSON 两个文件导入。'],
  terrain:['带旗指挥堡：失守就出局。','双塔城池：占领后每 2 回合产兵。','山地：上下左右都不能穿入。'],
  move:['先点有你颜色的格子，边框表示已选中。','按 D 或 →，也可以点右侧相邻格。','原地留 1 兵；选中位置跟随路线前进。'],
  half:['先点“全军出动”或按 Shift 切换。','再点起点，按方向键出兵。','半军向下取整；再次按 Shift 恢复全军。'],
  combat:['先扣除必须留在起点的 1 兵。','出动兵力与守军相减。','切换“9 打 8”：打平仍是对方的地。'],
  growth:['观察普通地、城池和将军的初始兵力。','第 2 回合：只有将军和已占领城市增长。','第 50 回合：全体领地增长，城市额外叠加。'],
  city:['看清城池守军，先在附近集结。','真正派出的兵必须多于守军。','占下来后等到增长回合，观察兵力增加。'],
  fog:['观察未探索区域，轮廓不代表一定是城。','向右占一格，视野随领地扩展。','“教学全貌”只揭开这个独立示例。'],
  capture:['找到并攻下对方带旗的指挥堡。','对手出局，指挥堡转成你的城池。','其余领地换色，驻军向上取整减半。'],
  controls:['按 D / → 试走；每次演示一个已执行步骤。','实战可提前排 8 步，Q 清空未执行指令。','暂停可规划；恢复后每回合执行一步。'],
  replay:['播放 / 暂停控制时间；空格也可以。','拖动时间轴可反复看关键交锋。','导出 JSON 后，下次用“打开回放”继续看。'],
};
