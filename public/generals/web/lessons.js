import E from '../engine/core.js';

export const lessons=[
  {id:'welcome',chapter:'上场之前',title:'先选一种入场方式。',target:'.mode-tabs',scene:'move',kicker:'01 / 认识沙盘',body:'你可以看 AI 彼此交锋，也可以亲自当将军。目标只有一个：保护自己的指挥堡，攻下其他人的将军。',tip:'观战会先在本机算完，再播放回放；亲自下场则一边决策、一边推进。',options:[]},
  {id:'maps',chapter:'上场之前',title:'这一次，在哪里交锋？',target:'#maps',scene:'terrain',kicker:'02 / 地图与种子',body:'小图容易短兵相接，大图有更多周旋空间。地图种子决定地形和出生点；相同种子、地图大小与人数，可以重现同一张地图。',tip:'回合上限是时间限制。到点仍有多位玩家存活就是平局，不看谁地多或兵多。',options:[]},
  {id:'roster',chapter:'上场之前',title:'把对手请上战场。',target:'#roster',scene:'capture',kicker:'03 / 本场选手',body:'布阵时，从选手库为各个席位挑选作品，2–4 人都能玩。每个席位有自己的颜色；真人模式下，A 席就是你。',tip:'选手卡上方是模型名，下方是作品名。内置陪练可以直接开局，不用接入模型 API。',options:[]},
  {id:'terrain',chapter:'看懂战场',title:'认出三种地标。',target:'#board',scene:'terrain',kicker:'04 / 将军 · 城池 · 山地',body:'带旗的指挥堡是将军。双塔城池可以攻占、持续产兵。层叠的山地不能穿过，只能绕行。格子里的数字就是兵力。',tip:'浅色空地可以占领；你的颜色会铺成连续的疆域。先看地形，再决定路线。',options:[]},
  {id:'move',chapter:'调兵实战',title:'留下一兵，其余出发。',target:'#board',scene:'move',kicker:'05 / 第一次调兵',body:'点一下自己的格子，再点相邻格，或按方向键 / WASD。一次只走上下左右一格，不能斜走。全军出动会在原地留下 1 兵。',tip:'只有 1 兵时无法出动。走到己方领地会合并兵力；没有兵的空地也要派兵才能占领。',options:['前往空地','合并友军']},
  {id:'half',chapter:'调兵实战',title:'留些兵，守住后路。',target:'#human-controls',scene:'half',kicker:'06 / 半军出动',body:'真人开局后，点击棋盘下方的“全军出动”切成“半军出动”，或按一下 Shift。半军带走当前兵力的一半，小数向下取整。',tip:'12 兵分成 6 + 6；13 兵则带走 6、留下 7。全军与半军是切换模式，不用一直按住 Shift。',options:['12 兵','13 兵']},
  {id:'combat',chapter:'调兵实战',title:'多一兵，才拿得下来。',target:'#board',scene:'combat',kicker:'07 / 攻防结算',body:'出动的兵与守军相减。进攻兵力严格大于守军，格子才归你；如果正好打平，守军变成 0，格子仍属于对方。',tip:'别忘了原地要留 1 兵：12 兵出发，真正参战的是 11。多方同时行动时，还要提防敌人调兵。',options:['12 打 8','9 打 8']},
  {id:'growth',chapter:'看懂战场',title:'领地，也是一座兵工厂。',target:'#board',scene:'growth',kicker:'08 / 兵从哪里来',body:'将军与已占领城池，每 2 回合增加 1 兵。每 50 回合，所有已占领格再增加 1 兵；两种增长可以叠加。',tip:'兵会留在各自格子里，需要你调集。中立城市不会替你产兵，必须先打下来。',options:[]},
  {id:'city',chapter:'调兵实战',title:'攻城有成本，也有回报。',target:'#board',scene:'city',kicker:'09 / 占领城市',body:'正式战场的中立城市通常有 40–50 守军。先集结足够的兵，打下来后，它才会变成你的产兵点。',tip:'这里用 5 守军做演示：12 出发 → 11 进攻 → 城内剩 6。到第 2 回合，城市再长出 1 兵。',options:[]},
  {id:'fog',chapter:'看懂战场',title:'你看不见整张棋盘。',target:'#board',scene:'fog',kicker:'10 / 战争迷雾',body:'真人和 AI 都只能看见自己领地与周围一圈。向外扩张，就能拓开视野；失去领地后，那里会重新进入迷雾。',tip:'雾中的山和城显示同一种轮廓，不能据此分辨。下方切换只针对教学小棋盘，不会揭开你的真实战局。',options:['我的视野','教学全貌']},
  {id:'capture',chapter:'调兵实战',title:'那面旗，就是胜负手。',target:'#board',scene:'capture',kicker:'11 / 攻下将军',body:'攻下敌方将军，对手立即出局。指挥堡变成你的城市，其余领土归你，驻军向上取整减半；攻城剩下的兵不再减半。',tip:'例子里 11 对 8，城内剩 3；对方另一格的 9 兵变为你的 5 兵。最后一位存活者获胜。',options:[]},
  {id:'controls',chapter:'亲自上场',title:'连走几步，也能从容指挥。',target:'#human-controls',scene:'queue',kicker:'12 / 指令与暂停',body:'真人开局后，连续按方向键，会排成一条最多 8 步的路线。每回合执行一步；按 Q 或“清空指令”取消后续动作。点击“暂停”可以停下来想一想。',tip:'试试下方的 → 键。真人局目标每 0.5 秒推进一回合；慢电脑可能更慢。路线是指令，撞山或兵不够时不会强行前进。',options:['→ 走一步','重来']},
  {id:'replay',chapter:'亲自上场',title:'打完，再看懂这一局。',target:'#start',scene:'capture',kicker:'13 / 回放与复盘',body:'观战和真人对局结束后，都可以拖动时间轴、暂停、调节倍速。全局回放能看清每个决策；也可以导出，留到下次再看。',tip:'教程随时可以从右上角重新打开。阅读时真实战局会暂停，关闭后由你决定什么时候继续。',options:[]},
];

// Every rule example runs on a disposable game. The live match is never passed in.
const cropIndices=Array.from({length:15},(_,i)=>(2+Math.floor(i/5))*8+1+i%5);
function board(){const s=E.createGame({n:2,size:8,seed:0,maxTurns:100});s.owner.fill(-1);s.army.fill(0);s.isCity.fill(0);s.isGeneral.fill(0);s.eliminated.fill(false);put(s,0,0,1,true);put(s,63,1,1,true);return s;}
function put(s,i,p,a,g=false,city=false){s.owner[i]=p;s.army[i]=a;s.isGeneral[i]=Number(g);s.isCity[i]=Number(city);}
function crop(s){return {owners:cropIndices.map(i=>s.owner[i]),armies:cropIndices.map(i=>s.army[i]),cities:cropIndices.map(i=>s.isCity[i]),generals:cropIndices.map(i=>s.isGeneral[i]),t:s.time,eliminated:[...s.eliminated]};}
function stage(s,label,detail){return {frame:crop(s),label,detail};}

export function makeLessonScene(kind,option=0){
  const s=board(),stages=[];let arrow=null,labels=[];
  if(kind==='terrain'){
    put(s,25,0,12,true);s.isGeneral[0]=0;put(s,27,-1,45,false,true);s.owner[29]=-2;
    stages.push(stage(s,'将军 / 城池 / 山地','旗帜要守住，城池可攻占，山地要绕行。'));labels=[{cell:5,text:'将军'},{cell:7,text:'城池'},{cell:9,text:'山地'}];
  }else if(kind==='growth'){
    put(s,25,0,12,true);s.isGeneral[0]=0;put(s,27,0,5,false,true);put(s,29,0,3);
    stages.push(stage(s,'第 0 回合','将军 12 · 城池 5 · 普通领地 3'));
    for(let n=0;n<50;n++){E.tick(s,[null,null]);if(s.time===2||s.time===50)stages.push(stage(s,`第 ${s.time} 回合`,s.time===2?'将军与城池各 +1，普通领地不变。':'第 50 回合：普通地 +1，城池和将军额外再 +1。'));}
    labels=[{cell:5,text:'将军'},{cell:7,text:'城池'},{cell:9,text:'普通地'}];
  }else if(kind==='fog'){
    put(s,25,0,12,true);s.isGeneral[0]=0;s.owner[19]=-2;put(s,27,-1,45,false,true);put(s,37,1,20,true);s.isGeneral[63]=0;
    stages.push(stage(s,'出发前','山与城在雾中只有相同轮廓。'));E.tick(s,[[3,1,3,false],null]);stages.push(stage(s,'扩张一格','占下新领地，周围一圈随之亮起。'));arrow={from:5,to:6};
  }else if(kind==='queue'){
    put(s,25,0,12);stages.push(stage(s,'点选起点 · 12 兵','按 → 走一步；每走一格，留下 1 兵。'));
    for(let n=0;n<3;n++){E.tick(s,[[3,n+1,3,false],null]);stages.push(stage(s,`已走 ${n+1} 步`,`前锋 ${11-n} 兵，经过的每一格都留下 1 兵。`));}
  }else{
    const source=26,target=27,a=kind==='combat'&&option===1?9:kind==='half'&&option===1?13:12;
    put(s,source,0,a);
    let targetArmy=0,targetOwner=-1;
    if(kind==='combat'){targetOwner=1;targetArmy=8;}
    if(kind==='city')targetArmy=5;
    if(kind==='move'&&option===1){targetOwner=0;targetArmy=4;}
    if(kind==='capture'){targetOwner=1;targetArmy=8;s.isGeneral[63]=0;put(s,29,1,9);}
    put(s,target,targetOwner,targetArmy,kind==='capture',kind==='city');
    const sent=kind==='half'?Math.floor(a/2):a-1;
    stages.push(stage(s,'出动前',kind==='city'?'教学示例：城市守军设为 5。':kind==='capture'?'守住自己的旗，找到对方的将军。':`${a} 兵待命${targetArmy?` · 目标 ${targetArmy} 兵`:''}`));
    E.tick(s,[[3,2,3,kind==='half'],null]);
    const remaining=s.army[source],arrived=s.army[target];
    const detail=kind==='combat'&&option===1?'8 对 8 抵消，0 兵的格子仍归对方。':kind==='capture'?'将军变城市，另一格 9 兵减半向上取整为 5。':`${sent} 兵出发 · 原地剩 ${remaining} · 目标剩 ${arrived}`;
    stages.push(stage(s,kind==='capture'?'将军失守 · 对手出局':kind==='combat'&&option===1?'打平，没占下来':'行动完成',detail));
    if(kind==='city'){E.tick(s,[null,null]);stages.push(stage(s,'第 2 回合 · 开始产兵','已占领城市 +1：6 → 7。'));}
    arrow={from:6,to:7};
  }
  return {kind,stages,arrow,labels,cols:5,rows:3};
}
