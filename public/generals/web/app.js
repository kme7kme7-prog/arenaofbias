import E from '../engine/core.js';
import {Match} from '../engine/runtime.js';
import {decodeFrame,validateReplay} from '../engine/replay.js';
import {drawBoard,fieldVisibility} from './render.js';
import {createTutorial} from './tutorial.js';
const $=id=>document.getElementById(id);
const COLORS=['#b96950','#568999','#b49a50','#847b9d'];
const HUMAN={id:'local-human',name:'你',model:'本地玩家',human:true,reasoningEffort:'unknown'};
const S={mode:'watch',phase:'setup',pool:[],selected:[],colors:[...COLORS],size:18,seed:42,turns:1200,count:4,match:null,replay:null,index:0,playing:false,speed:4,queue:[],selectedCell:-1,half:false,paused:false,epoch:0,picking:0,resultShown:false,frame:null,previous:null,frameAt:0};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const show=(id,on)=>$(id).hidden=!on;
const status=text=>{$('status').textContent=text;show('status-wrap',Boolean(text));};
let toastTimer,animationTime=0,playAccumulator=0,liveTimer;
function askConfirm(message){const dialog=$('confirm-dialog');$('confirm-message').textContent=message;dialog.returnValue='no';return new Promise(resolve=>{dialog.onclose=()=>resolve(dialog.returnValue==='yes');dialog.showModal();});}
$('confirm-yes').onclick=()=>$('confirm-dialog').close('yes');
$('confirm-no').onclick=()=>$('confirm-dialog').close('no');
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function applyTheme(preference){
  document.documentElement.dataset.theme=preference==='ink'||(preference==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'ink':'paper';
  updateTheme();
}
function updateTheme(){const ink=document.documentElement.dataset.theme==='ink';$('theme').textContent=ink?'◐ 墨色':'◐ 纸面';document.documentElement.style.colorScheme=ink?'dark':'light';draw();}
$('theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='ink'?'paper':'ink';try{localStorage.setItem('aob-theme',theme);}catch{}applyTheme(theme);};
window.addEventListener('storage',event=>{if(event.key==='aob-theme')applyTheme(event.newValue);});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{try{if(localStorage.getItem('aob-theme')==='system')applyTheme('system');}catch{}});

async function loadLibrary(){
  const response=await fetch('/generals/roster.json',{cache:'no-store'});
  if(!response.ok)throw Error('选手库暂时无法读取，请刷新重试');
  const roster=await response.json();
  const pool=await Promise.all(roster.map(async entry=>{
    if(!/^[a-z][a-z0-9-]{1,39}$/.test(entry.id))throw Error('选手代号不合法');
    const response=await fetch('/generals/bots/'+entry.id+'.js',{cache:'no-store'});
    if(!response.ok)throw Error('无法加载作品：'+entry.name);
    const bytes=await response.arrayBuffer();
    const code=new TextDecoder().decode(bytes);
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(sha256!==entry.sha256)throw Error('作品校验失败，请刷新重试：'+entry.name);
    return {...entry,code};
  }));
  let local=[];try{local=JSON.parse(localStorage.getItem('aob-generals-entries-v1')||'[]');}catch{}
  S.pool=pool;for(const e of local)if(!S.pool.some(b=>b.id===e.id))S.pool.push(e);
  if(!S.selected.length)S.selected=['trial-astra-high','trial-sol61-high','trial-luna6-max','trial-terra56-high'];
  S.selected=S.selected.map(id=>S.pool.some(b=>b.id===id)?id:S.pool[0]?.id);
  renderRoster();renderLibrary();
}
function entrants(){const ids=S.selected.slice(0,S.count);return ids.map((id,i)=>S.mode==='human'&&i===0?{...HUMAN,color:S.colors[i]}:{...S.pool.find(b=>b.id===id),color:S.colors[i]});}
function config(){return {size:S.size,seed:S.seed,maxTurns:S.turns};}
function preview(){
  if(S.phase!=='setup')return;
  try{const game=E.createGame({n:S.count,...config()});S.previewGame=game;S.frame=decodeFrame(E.snapshot(game),{h:S.size,w:S.size});S.previous=null;S.selectedCell=-1;draw();}
  catch(e){status(e.message);}
  $('map-label').textContent=`${S.size} × ${S.size}`;$('scale').textContent=`${S.size} × ${S.size}`;
  $('board-caption').textContent=S.mode==='human'?'战争迷雾已开启 · 你是 A 席':'';
  $('start').querySelector('span').textContent=S.mode==='human'?'我来当将军':'开始交锋';
  status('');
}
function setMode(mode){if(S.phase!=='setup')return;S.mode=mode;S.seed=(Math.random()*0xffffffff)>>>0;$('seed').value=S.seed;
  for(const [id,name] of [['spectate-mode','watch'],['human-mode','human']]){$(id).classList.toggle('active',mode===name);$(id).setAttribute('aria-pressed',mode===name);}
  preview();renderRoster();
}
$('spectate-mode').onclick=()=>setMode('watch');$('human-mode').onclick=()=>setMode('human');
$('maps').onclick=e=>{const b=e.target.closest('[data-size]');if(!b||S.phase!=='setup')return;S.size=Number(b.dataset.size);for(const x of $('maps').children)x.classList.toggle('active',x===b);preview();};
$('seed').onchange=()=>{const n=Number($('seed').value);if(!Number.isInteger(n)||n<0||n>0xffffffff){$('seed').value=S.seed;toast('种子必须为0–4294967295整数');return;}S.seed=n;preview();};
$('shuffle').onclick=()=>{S.seed=(Math.random()*0xffffffff)>>>0;$('seed').value=S.seed;preview();};
$('turns').onchange=()=>{S.turns=Number($('turns').value);preview();};
$('count').onchange=()=>{S.count=Number($('count').value);renderRoster();preview();};

function renderRoster(){
  const host=$('roster');host.replaceChildren();
  const list=S.phase==='setup'||S.phase==='computing'?entrants():(S.replay?(S.replay.meta.entrants||S.replay.meta.bots.map((name,i)=>({id:String(i),name}))):S.match?.entries||entrants());
  const frame=S.frame;const stats=list.map(()=>({land:0,army:0}));
  if(frame)frame.owners.forEach((p,i)=>{if(stats[p]){stats[p].land++;stats[p].army+=frame.armies[i];}});
  const max=Math.max(1,...stats.map(s=>s.land));
  list.forEach((e,i)=>{
    const card=el('div',undefined,'entrant');card.style.setProperty('--seat',S.colors[i]);if(frame?.eliminated[i])card.classList.add('eliminated');
    const top=el('div',undefined,'entrant-top'),title=el('div',undefined,'entrant-title');
    title.append(el('b',['内置陪练','baseline'].includes(e.model)?e.name:e.model||e.name));const subtitle=el('small',['内置陪练','baseline'].includes(e.model)?(e.model==='baseline'?'baseline':'内置陪练'):e.human?'你亲自指挥':e.name);
    if(e.reasoningEffort&&e.reasoningEffort!=='unknown')subtitle.append(el('span',e.reasoningEffort,'effort'));title.append(subtitle);
    top.append(title,el('span',String.fromCharCode(65+i),'seat-letter'));card.append(top);
    const bottom=el('div',undefined,'entrant-bottom');
    if(S.phase==='setup'){
      const label=el('label'),color=el('input');color.type='color';color.value=S.colors[i];color.setAttribute('aria-label',`席位${i+1}颜色`);color.oninput=()=>{S.colors[i]=color.value;card.style.setProperty('--seat',color.value);draw();};label.append(color,document.createTextNode('颜色'));bottom.append(label);
      if(!e.human){const b=el('button','换选手');b.onclick=()=>openLibrary(i);bottom.append(b);}else bottom.append(el('span','A 席 / 你','quiet'));
    }else{
      if(S.phase==='human'&&!frame?.eliminated[0]&&i!==0){bottom.append(el('span','敌方兵力在迷雾中','quiet'));card.append(bottom);host.append(card);return;}
      const numbers=el('div',undefined,'stats');for(const [value,name]of[[stats[i].land,'领地'],[stats[i].army,'兵力']]){const n=el('span');n.append(el('b',String(value)),document.createTextNode(name));numbers.append(n);}bottom.append(numbers);
      if(frame?.eliminated[i])bottom.append(el('small','出局'));const bar=el('div',undefined,'score-bar'),fill=el('i');fill.style.width=(stats[i].land/max*100)+'%';bar.append(fill);card.append(bottom,bar);host.append(card);return;
    }
    card.append(bottom);host.append(card);
  });
}
function openLibrary(i=S.mode==='human'?1:0){if(S.phase!=='setup')return;S.picking=i;$('library-hint').textContent=`正在为 ${String.fromCharCode(65+i)} 席挑选作品。`;$('search').value='';renderLibrary();$('library-dialog').showModal();}
function renderLibrary(){const host=$('library-list');host.replaceChildren();const query=$('search').value.toLowerCase(),group=$('training-group').value;
  S.pool.filter(e=>(group==='all'||(group==='entries'?e.kind!=='training':e.group===group))&&(e.name+' '+e.model+' '+e.reasoningEffort).toLowerCase().includes(query)).forEach(e=>{
    const b=el('button',undefined,'library-card');b.append(el('b',e.name),el('span',e.model+(e.reasoningEffort!=='unknown'?' / '+e.reasoningEffort:'')),el('small',e.description||'独立参赛作品'));
    if(e.kind==='training'){const badge=el('span',e.group==='hard'?'进阶陪练':'基础陪练','training-badge');b.prepend(badge);}
    const used=S.selected.slice(0,S.count).some((id,i)=>i!==S.picking&&!(S.mode==='human'&&i===0)&&id===e.id);b.disabled=used;
    b.onclick=()=>{S.selected[S.picking]=e.id;$('library-dialog').close();renderRoster();};if(used)b.append(el('small','已在本场'));host.append(b);
  });
  if(!host.children.length)host.append(el('p','没有找到这位选手。','quiet'));
}
$('library').onclick=()=>openLibrary();$('search').oninput=renderLibrary;$('training-group').onchange=renderLibrary;$('refresh-library').onclick=()=>loadLibrary().catch(e=>toast(e.message));
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();const tutorial=createTutorial({
  beforeOpen:async()=>{
    S.playing=false;updatePlay();
    if(S.phase==='human'){
      S.paused=true;$('pause-live').textContent='继续';status('教学中 · 战局已暂停');
      // Let a decision already in flight settle before showing the teaching layer.
      while(S.match?.busy)await new Promise(resolve=>setTimeout(resolve,30));
    }
  },
  onClose:()=>{if(S.phase==='human')status('战局已暂停 · 点击继续返回交锋');}
});
$('help').onclick=()=>tutorial.open();
$('learn').onclick=()=>tutorial.open();

function setPhase(phase){S.phase=phase;const setup=phase==='setup',human=phase==='human',replay=phase==='replay',computing=phase==='computing';
  show('setup-controls',setup);show('battle-notes',!setup&&!computing);show('calculation',computing);show('replay-controls',replay);show('human-controls',human);show('legend',setup||computing);
  show('start',setup);show('back',human||replay);show('export',replay);show('resign',human);show('pause-live',human);show('count',setup);document.querySelector('.count-row').hidden=!setup;
  $('help').disabled=computing;$('library').disabled=!setup;$('spectate-mode').disabled=!setup;$('human-mode').disabled=!setup;$('import-replay').disabled=computing||human;
  $('stage-badge').textContent=setup?'布阵中':computing?'计算中':human?'亲自下场':'战局回放';renderRoster();resize();
}
async function start(){if(S.phase!=='setup')return;
  const epoch=++S.epoch;S.queue=[];S.selectedCell=-1;S.replay=null;S.resultShown=false;S.paused=false;$('pause-live').textContent='暂停';$('progress').style.width='0';$('progress-text').textContent='准备选手…';
  try{
    const list=entrants();if(list.some(e=>!e.id))throw new Error('请先选择选手');S.match=new Match(list,config());setPhase('computing');status('正在加载各位选手的策略');
    if(S.mode==='watch'){
      const replay=await S.match.run((t,max)=>{if(epoch!==S.epoch)return;$('progress').style.width=(t/max*100)+'%';$('progress-text').textContent=`已计算 ${t} / ${max} 回合`;});
      if(epoch!==S.epoch)return;enterReplay(replay,true);status('计算完成 · 正在播放本地回放');
    }else{
      await S.match.init();if(epoch!==S.epoch)return;setPhase('human');S.frame=decodeFrame(S.match.frames[0],S.match.replay().meta);S.selectedCell=S.frame.generals.findIndex((v,i)=>v&&S.frame.owners[i]===0);renderRoster();draw();status('你是 A 席 · 点领地，按方向键调兵');scheduleLive(epoch);
    }
  }catch(e){if(epoch!==S.epoch)return;S.match?.cancel();setPhase('setup');preview();toast(e.message);}
}
$('start').onclick=start;
function reset(){S.size=Number(document.querySelector("#maps .active").dataset.size);++S.epoch;clearTimeout(liveTimer);S.match?.cancel();S.match=null;S.replay=null;S.playing=false;S.queue=[];S.frame=null;S.resultShown=false;setPhase('setup');$('clock').textContent='回合 0000';preview();renderRoster();}
$('cancel').onclick=reset;$('back').onclick=async()=>{if(S.phase==='human'&&!await askConfirm('离开当前对局，返回布阵桌？'))return;reset();};
async function scheduleLive(epoch,delay=500){
  clearTimeout(liveTimer);liveTimer=setTimeout(async()=>{
    if(epoch!==S.epoch||S.phase!=='human')return;
    if(S.paused||document.querySelector("dialog[open]")){scheduleLive(epoch);return;}
    const begin=performance.now();
    try{const action=S.queue.shift()||null;await S.match.step(action);if(epoch!==S.epoch)return;S.previous=S.frame;S.frame=decodeFrame(S.match.frames.at(-1),S.match.replay().meta);S.frameAt=performance.now();updateFrameUI();
      if(S.match.game.done){S.replay=S.match.replay();enterReplay(S.replay,false,true);status('交锋结束 · 可以回看整场');showResult();return;}
      if(S.match.game.eliminated[0]){S.queue=[];show('human-controls',false);show('resign',false);$('board-caption').textContent='你已退出指挥 · 全局观战';status('你已退出指挥 · 正在观看剩余对手');}else status(S.paused?'已暂停':'');
    }catch(e){toast(e.message);reset();return;}
    if(epoch===S.epoch&&S.phase==='human')scheduleLive(epoch,Math.max(0,500-(performance.now()-begin)));
  },delay);
}
$('pause-live').onclick=()=>{S.paused=!S.paused;$('pause-live').textContent=S.paused?'继续':'暂停';status(S.paused?'已暂停 · 可调整排队指令':'继续交锋');};
$('resign').onclick=async()=>{if(!await askConfirm('确定认输？仍可观看剩余 AI 的比赛。'))return;S.match.resignHuman();S.queue=[];S.paused=false;$('pause-live').textContent='暂停';if(!S.match.busy)scheduleLive(S.epoch,0);status('已认输 · 继续观看剩余对手');};
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(S.phase==='human'){S.paused=true;$('pause-live').textContent='继续';status('页面转入后台，已暂停');}S.playing=false;updatePlay();}});
window.addEventListener('pagehide',()=>{++S.epoch;clearTimeout(liveTimer);S.match?.cancel();});

function enterReplay(data,autoplay=false,last=false){validateReplay(data);S.replay=data;S.size=data.meta.h;S.colors=data.meta.entrants?.map((e,i)=>/^#[0-9a-f]{6}$/i.test(e.color)?e.color:COLORS[i])||[...COLORS];S.index=last?data.frames.length-1:0;S.playing=autoplay;playAccumulator=0;S.resultShown=last;setPhase('replay');$('timeline').max=data.frames.length-1;$('map-label').textContent=`${S.size} × ${S.size}`;$('scale').textContent=`${S.size} × ${S.size}`;$('board-caption').textContent='完整战局 · 自由拖动时间';setFrame(S.index);updatePlay();}
function setFrame(index){S.index=Math.max(0,Math.min(S.replay.frames.length-1,index));S.previous=S.frame;S.frame=decodeFrame(S.replay.frames[S.index],S.replay.meta);S.frameAt=performance.now();$('timeline').value=S.index;updateFrameUI();}
function updateFrameUI(){if(!S.frame)return;$('clock').textContent='回合 '+String(S.frame.t).padStart(4,'0');$('queue-count').textContent=`${S.queue.length} / 8`;renderRoster();renderEvents();draw();}
function renderEvents(){const all=S.phase==='human'?S.match.frames:S.replay?.frames||[];const current=S.frame?.t||0;const rows=all.filter(f=>f.t<=current).flatMap(f=>f.events||[]).filter(e=>S.phase!=='human'||S.frame?.eliminated[0]||e.by===0||e.target===0).slice(-8).reverse();const list=S.replay?.meta.bots||S.match?.entries.map(e=>e.name)||[];$('events').replaceChildren();for(const event of rows){const li=el('li');li.append(el('time','回合 '+event.t),document.createTextNode(event.type==='capture'?`${list[event.by]||'选手'} 攻下 ${list[event.target]||'对手'} 的将军`:`${list[event.target]||'选手'} ${event.type==='resign'?'主动认输':'运行异常，退出指挥'}`));$('events').append(li);}if(!rows.length)$('events').append(el('li','前线尚未传来将军失守的消息。'));}
function updatePlay(){$('play').textContent=S.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',S.playing?'暂停回放':'播放回放');}
$('play').onclick=()=>{if(S.index===S.replay.frames.length-1){setFrame(0);S.resultShown=false;}S.playing=!S.playing;playAccumulator=0;updatePlay();};
$('timeline').oninput=()=>{S.playing=false;updatePlay();setFrame(Number($('timeline').value));};$('speed').onchange=()=>{S.speed=Number($('speed').value);};
function showResult(){const replay=S.replay;if(!replay)return;S.playing=false;updatePlay();const {meta}=replay;const win=meta.winner;const who=meta.entrants?.[win];$('result-title').textContent=win<0?'这一局，未分高下。':(who?.human?'你守住了最后一面旗。':`${who?.model&&!['内置陪练','baseline'].includes(who.model)?who.model:meta.bots[win]} 获胜`);$('result-subtitle').textContent=`${meta.turns} 回合 · ${meta.h} × ${meta.w} · ${win<0?(meta.reason==='all-forfeit'?'所有选手均退出指挥':meta.complete===false?'对局尚未结束':'回合上限内未决出唯一存活者'):'最后一位存活者'}${meta.faults.some(n=>n>0)?' · 本局有程序运行异常':''}`;
  const frame=decodeFrame(replay.frames.at(-1),meta);$('result-rows').replaceChildren();meta.bots.forEach((name,i)=>{const row=el('div',undefined,'result-row'),text=el('div');const e=meta.entrants?.[i];text.append(el('b',e?.model&&!['内置陪练','baseline'].includes(e.model)?e.model:name),el('small',(e?.model&&!['内置陪练','baseline'].includes(e.model)?name+' · ':'')+(e?.reasoningEffort&&e.reasoningEffort!=='unknown'?e.reasoningEffort+' · ':'')+`异常 ${meta.faults[i]||0}`));row.append(text,el('span',i===win?'胜者':frame.eliminated[i]?'已出局':'存活'));$('result-rows').append(row);});$('result-dialog').showModal();S.resultShown=true;
}
$('watch-replay').onclick=()=>{$('result-dialog').close();setFrame(0);S.playing=true;S.resultShown=true;updatePlay();};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>download(S.replay,`将军对垒-${S.replay.meta.seed}.json`);
$('import-replay').onclick=()=>$('replay-file').click();$('replay-file').onchange=async()=>{const file=$('replay-file').files[0];if(!file)return;try{if(file.size>40*1024*1024)throw Error('回放文件不能超过40MB');const data=validateReplay(JSON.parse(await file.text()));reset();enterReplay(data);status('已打开本地回放');}catch(e){toast('无法打开：'+e.message);}$('replay-file').value='';};
$('import-bot').onclick=()=>$('bot-files').click();$('bot-files').onchange=async()=>{try{const files=[...$('bot-files').files],source=files.find(f=>f.name.endsWith('.js')),meta=files.find(f=>f.name==='submission.json');if(!source||!meta)throw Error('请同时选择 bot.js 和 submission.json');if(source.size>262144||meta.size>10000)throw Error('文件过大');const raw=JSON.parse(await meta.text());const e={id:raw.id,name:raw.name,model:raw.model,reasoningEffort:raw.reasoningEffort,rules:raw.rules,apiVersion:raw.apiVersion||'aob-generals-bot/1',supportedModes:raw.supportedModes||['ffa'],description:String(raw.description||"独立参赛作品").slice(0,160)};if(!/^[a-z][a-z0-9-]{1,39}$/.test(e.id)||typeof e.name!=='string'||!e.name||e.name.length>80||typeof e.model!=='string'||!e.model||e.model.length>80||e.rules!==E.VERSION||!['unknown','low','medium','high','xhigh','max'].includes(e.reasoningEffort))throw Error('提交信息不合法，请使用参赛工作区模板');if(e.apiVersion!=='aob-generals-bot/1'||!Array.isArray(e.supportedModes)||!e.supportedModes.includes('ffa'))throw Error('作品不支持当前 bot API / FFA 模式');if(e.id==='local-human'||S.pool.some(b=>b.id===e.id&&b.kind==='training'))throw Error('作品代号与内置选手重复');e.code=await source.text();e.sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.code)))].map(n=>n.toString(16).padStart(2,'0')).join('');let local=[];try{local=JSON.parse(localStorage.getItem('aob-generals-entries-v1')||'[]');}catch{}if(S.pool.some(b=>b.id===e.id)&&!await askConfirm('同名作品已存在，替换本地导入版本？'))return;local=local.filter(b=>b.id!==e.id);local.push(e);localStorage.setItem('aob-generals-entries-v1',JSON.stringify(local));S.pool=S.pool.filter(b=>b.id!==e.id);S.pool.push(e);renderLibrary();toast('已加入选手库：'+e.name);}catch(e){toast(e.message);}$('bot-files').value='';};

function enqueue(direction){if(S.phase!=='human'||S.match.game.eliminated[0])return;flashDirection(direction);const s=S.selectedCell;if(s<0){toast('先选择自己的领地');return;}if(S.queue.length>=8){toast('指令队列已满');return;}const r=Math.floor(s/S.size),c=s%S.size,dirs=[[-1,0],[1,0],[0,-1],[0,1]],[dr,dc]=dirs[direction],nr=r+dr,nc=c+dc;if(nr<0||nr>=S.size||nc<0||nc>=S.size)return;
  S.queue.push([r,c,direction,S.half]);S.selectedCell=nr*S.size+nc;$('queue-count').textContent=`${S.queue.length} / 8`;draw();
}
$('half').onclick=()=>{S.half=!S.half;$('half').textContent=S.half?'半军出动':'全军出动';$('half').setAttribute('aria-pressed',S.half);};$('clear-queue').onclick=()=>{S.queue=[];$('queue-count').textContent='0 / 8';draw();};
const directionTimers=new Map();
function flashDirection(direction){const b=document.querySelector(`[data-dir="${direction}"]`);b.dataset.pressed='true';clearTimeout(directionTimers.get(direction));directionTimers.set(direction,setTimeout(()=>delete b.dataset.pressed,300));}
for(const b of document.querySelectorAll('[data-dir]')){const dir=Number(b.dataset.dir),key=['W','S','A','D'][dir];b.title=key+' / '+b.textContent;b.insertAdjacentHTML('afterbegin',`<kbd>${key}</kbd>`);b.onclick=()=>enqueue(dir);}
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const keys={ArrowUp:0,w:0,W:0,ArrowDown:1,s:1,S:1,ArrowLeft:2,a:2,A:2,ArrowRight:3,d:3,D:3};if(S.phase==='human'&&e.key in keys){e.preventDefault();enqueue(keys[e.key]);}else if(S.phase==='human'&&e.key==='Shift'&&!e.repeat){e.preventDefault();$('half').click();}else if(S.phase==='human'&&e.key.toLowerCase()==='q')$('clear-queue').click();else if(S.phase==='replay'&&e.key===' '){e.preventDefault();$('play').click();}});
$('board').onclick=e=>{if(S.phase!=='human')return;const rect=$('board').getBoundingClientRect(),border=7,w=rect.width-2*border;const c=Math.floor((e.clientX-rect.left-border)/w*S.size),r=Math.floor((e.clientY-rect.top-border)/w*S.size);if(r<0||r>=S.size||c<0||c>=S.size)return;const i=r*S.size+c,from=S.selectedCell;
  if(from>=0&&i!==from){const fr=Math.floor(from/S.size),fc=from%S.size;const direction=[[-1,0],[1,0],[0,-1],[0,1]].findIndex(([dr,dc])=>r-fr===dr&&c-fc===dc);if(direction>=0){enqueue(direction);$('board').focus();return;}}
  if(S.frame.owners[i]===0){S.selectedCell=i;draw();$('board').focus();}else toast('请选择自己的领地');};

let canvasSide=0;
function resize(){const host=$('board-wrap'),mobile=innerWidth<=850;const side=Math.floor(Math.min(host.clientWidth-2,mobile?720:Math.max(80,host.clientHeight-8)));if(side<20)return;canvasSide=side-14;const canvas=$('board');canvas.style.width=side+'px';canvas.style.height=side+'px';for(const edge of host.querySelectorAll('.board-edges'))edge.style.width=side+'px';const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvasSide*dpr);canvas.height=Math.round(canvasSide*dpr);draw();}
const desktopLayout=matchMedia('(min-width:851px)');
const fieldControls=document.querySelector('.arena-bottom'),deskFooter=document.querySelector('.desk>footer');
function positionControls(){
  document.querySelector(desktopLayout.matches?'.briefing':'.arena').append(fieldControls);
  document.querySelector(desktopLayout.matches?'.roster-side':'.desk').append(deskFooter);
  resize();
}
desktopLayout.addEventListener('change',positionControls);
positionControls();
new ResizeObserver(resize).observe($('board-wrap'));
function draw(){
  const f=S.frame;if(!f||!canvasSide)return;
  const cv=$('board'),ctx=cv.getContext('2d'),dpr=cv.width/canvasSide;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const playerView=S.mode==='human'&&(S.phase==='setup'||S.phase==='human'&&!f.eliminated[0]);
  drawBoard(ctx,{frame:f,cols:S.size,width:canvasSide,colors:S.colors,
    ink:document.documentElement.dataset.theme==='ink',
    visible:playerView?fieldVisibility(f,0,S.size):null,
    selected:S.phase==='human'?S.selectedCell:-1,queue:S.phase==='human'?S.queue:[],
    previous:S.previous,flash:matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.max(0,1-(performance.now()-S.frameAt)/380)
  });
}
function animate(now){const elapsed=Math.min(200,now-animationTime);animationTime=now;if(S.phase==='replay'&&S.playing&&!document.querySelector('dialog[open]')){playAccumulator+=elapsed*S.speed/500;const next=Math.floor(playAccumulator);if(next>0){playAccumulator-=next;setFrame(S.index+next);if(S.index===S.replay.frames.length-1){S.playing=false;updatePlay();if(!S.resultShown)showResult();}}}else if(performance.now()-S.frameAt<400)draw();requestAnimationFrame(animate);}
document.querySelector('.brand').addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();++S.epoch;clearTimeout(liveTimer);S.match?.cancel();S.playing=false;
  if(window.PlaygroundEntry)window.PlaygroundEntry.navigate('/#play',true);else location.assign('/#play');
});
$('start').disabled=true;
loadLibrary().then(()=>{preview();renderRoster();resize();$('start').disabled=false;}).catch(e=>{status(e.message);$('start').disabled=true;}).finally(()=>window.PlaygroundEntry?.ready());
try{applyTheme(localStorage.getItem('aob-theme'));}catch{applyTheme('paper');}
requestAnimationFrame(animate);
