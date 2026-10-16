export function decodeFrame(frame,meta) {
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const o=bytes(frame.o),a=bytes(frame.a);
  const owners=new Int8Array(o.buffer), armies=new Uint32Array(a.buffer);
  const mask=(s,fallback)=>s?bytes(s):Uint8Array.from(fallback.flat(),Boolean);
  return {t:frame.t,owners,armies,generals:mask(frame.g,meta.generals),cities:mask(frame.c,meta.castles),eliminated:frame.eliminated||[],events:frame.events||[],faults:frame.faults||[]};
}
export function validateReplay(data) {
  const m=data?.meta;
  if(!m||m.schema!=='aob-generals-replay/2')throw new Error('请导入将军对垒 v2 回放；旧版录像缺少逐帧地形，暂不转换');
  const int=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;
  if(!int(m.n,2,4)||!int(m.h,8,26)||m.w!==m.h||!int(m.turns,0,5000)||!int(m.winner,-1,m.n-1))throw new Error('回放配置不合法');
  if(!Array.isArray(m.bots)||m.bots.length!==m.n||m.bots.some(s=>typeof s!=='string'||s.length>100))throw new Error('回放选手信息不合法');
  if(m.entrants!==undefined&&(!Array.isArray(m.entrants)||m.entrants.length!==m.n||m.entrants.some(e=>!e||typeof e.name!=='string'||e.name.length>100||typeof e.model!=='string'||e.model.length>100)))throw new Error('回放署名不合法');
  if(m.faults===undefined)m.faults=Array(m.n).fill(0);
  if(!Array.isArray(m.faults)||m.faults.length!==m.n||m.faults.some(x=>!int(x,0,5000)))throw new Error('回放异常计数不合法');
  if(!Array.isArray(data.frames)||data.frames.length!==m.turns+1)throw new Error('回放帧不完整');
  const n=m.h*m.w;
  data.frames.forEach((f,i)=>{
    if(f.t!==i||['o','a','g','c'].some(k=>typeof f[k]!=='string'||f[k].length>n*6))throw new Error('回放帧格式不合法');
    const d=decodeFrame(f,m);
    if(d.owners.length!==n||d.armies.length!==n||d.generals.length!==n||d.cities.length!==n)throw new Error('回放帧尺寸不符');
    if(d.owners.some(x=>x<-2||x>=m.n)||d.generals.some(x=>x>1)||d.cities.some(x=>x>1)||d.armies.some(x=>x>10000000))throw new Error('回放帧数值不合法');
    if(!Array.isArray(f.eliminated)||f.eliminated.length!==m.n||f.eliminated.some(x=>typeof x!=='boolean'))throw new Error('淘汰状态不合法');
    if(f.events!==undefined&&(!Array.isArray(f.events)||f.events.some(e=>!e||!['capture','forfeit','resign'].includes(e.type)||!int(e.t,0,i)||!int(e.target,0,m.n-1)||(e.type==='capture'&&!int(e.by,0,m.n-1)))))throw new Error('回放事件不合法');
  });
  return data;
}
