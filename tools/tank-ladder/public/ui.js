import { createRenderer } from '/render.mjs';
import { prepareEffects, recentEffects } from '/presentation.mjs';

const config = window.TankLadderConfig || {};
const apiPath = url => config.apiBase ? config.apiBase + url.replace(/^\/api/, '') : url;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const signed = value => `${value > 0 ? '+' : ''}${value}`;
const fmt = value => new Intl.NumberFormat('zh-CN').format(value);
const date = value => new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
let csrf = '', state, sort = 'rating', tab = 'hall', pollTimer, toastTimer, source = '', previousSignature = '';
let refreshRead, refreshController, refreshVersion = 0, accountEpoch = 0, accountIdentity = config.accountId, fileRequest = 0;
let replayCache, previewRead;
const replayReads = new Map();
let featureId = '', featureReplay, featureEvents = [], featureTime = 0, replay, replayEvents = [], time = 0, playing = false, replayRequest = 0;
const pages = { rank: 1, works: 1, jobs: 1, matches: 1 };
const pageSizes = { rank: 6, works: 4, jobs: 6, matches: 6 };
const featureRenderer = createRenderer($('featured-canvas')), renderer = createRenderer($('replay-canvas'));
const statusText = { queued:'等待计算', running:'正在计算', completed:'已完成', held:'已暂停', failed:'未计分 / 检查失败', cancelled:'已取消', ready:'检查通过', checking:'运行检查中', rejected:'检查未通过' };
let theme = localStorage.getItem(config.apiBase ? 'aob-theme' : 'ladder-theme') === 'ink' ? 'ink' : 'paper';
document.documentElement.dataset.theme = theme;
$('theme').onclick = () => { theme = theme === 'paper' ? 'ink' : 'paper'; document.documentElement.dataset.theme = theme; localStorage.setItem(config.apiBase ? 'aob-theme' : 'ladder-theme', theme); };
function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('visible'); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5000); }
async function api(url, input, signal) {
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(apiPath(url), { method: input === undefined ? 'GET' : 'POST', credentials:'include', signal:controller.signal,
      ...(input === undefined ? {} : { headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrf }, body:JSON.stringify(input) }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || '请求失败。'); return result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function switchTab(next) {
  tab = next;
  for (const el of document.querySelectorAll('[data-tab]')) { el.classList.toggle('selected', el.dataset.tab === tab); if (el.dataset.tab === tab) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); }
  for (const el of document.querySelectorAll('main>.panel')) el.hidden = el.id !== tab;
}
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
document.querySelectorAll('dialog').forEach(dialog => {
  let backdropPress = false;
  dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backdropPress && event.target === dialog) dialog.close(); });
});
const mapName = id => state?.maps.find(m => m.id === id)?.name || id;

function pageOf(items, key) {
  const total = Math.max(1, Math.ceil(items.length / pageSizes[key]));
  pages[key] = Math.min(Math.max(1, pages[key]), total);
  const offset = (pages[key] - 1) * pageSizes[key];
  const unit = { rank:'位选手', works:'件作品', jobs:'项任务', matches:'场比赛' }[key];
  const control = (value, label, name, disabled = false) => `<button data-pager="${key}" data-page="${value}" aria-label="${name}" ${disabled?'disabled':''} ${value===pages[key]&&label===String(value)?'aria-current="page"':''}>${label}</button>`;
  const visible = Array.from({length:total},(_,i)=>i+1).filter(n=>total<=5 || n===1 || n===total || Math.abs(n-pages[key])<=1);
  const numbered = visible.map((n,i)=>(i && n-visible[i-1]>1 ? '<span class="page-count" aria-hidden="true">…</span>' : '') + control(n,String(n),`第 ${n} 页`)).join('');
  $(`${key}-pages`).innerHTML = items.length ? `<span class="page-count">${offset+1}–${Math.min(offset+pageSizes[key],items.length)} / ${items.length} ${unit}</span>${total>1?`<div class="page-buttons">${control(pages[key]-1,'←','上一页',pages[key]===1)}${numbered}${control(pages[key]+1,'→','下一页',pages[key]===total)}</div>`:''}` : '';
  return items.slice(offset, offset + pageSizes[key]);
}

function rankings() {
  if (!state) return;
  const query = $('search').value.trim().toLowerCase();
  const entries = [...state.rankings].filter(r => `${r.name} ${r.model}`.toLowerCase().includes(query));
  if (sort !== 'rating') entries.sort((a,b) => b[sort] - a[sort] || b.games - a.games);
  const placed = state.rankings.filter(r => !r.provisional);
  const slice = pageOf(entries, 'rank');
  $('rankings').innerHTML = entries.length ? slice.map(r => {
    const place = placed.findIndex(p => p.id === r.id) + 1;
    return `<tr><td class="${place && place < 4 ? 'rank-top':''}">${place || '—'}</td><td><button class="entry-button" data-detail="${esc(r.id)}"><span class="tank-name"><span class="tank-icon" aria-hidden="true">${esc(r.name.slice(0,1).toUpperCase())}</span><span class="tank-info"><strong>${esc(r.name)}</strong><small>${esc(r.model)} · ${esc(r.effort)}${r.official ? '' : ' · 作者声明'}</small></span></span></button></td><td><span class="score">${r.games ? fmt(r.rating) : '—'}</span>${r.provisional ? `<span class="provisional">${r.games ? `定级 ${r.games}/12` : '等待出战'}</span>`:''}</td><td class="number" data-label="胜率">${r.games ? (r.winRate*100).toFixed(1)+'%' : '—'}</td><td class="number" data-label="场均击杀">${r.games ? r.avgKills.toFixed(2) : '—'}</td><td class="number" data-label="场数">${r.games}</td></tr>`;
  }).join('') : '<tr><td class="empty-row" colspan="6">没有找到对应作品，试试其他名字。</td></tr>';
}
$('search').addEventListener('input', () => { pages.rank=1; rankings(); });
document.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => {
  sort = button.dataset.sort; pages.rank=1;
  document.querySelectorAll('[data-sort]').forEach(el => {
    el.classList.toggle('chosen', el===button);
    el.textContent = {rating:'排位分',winRate:'胜率',avgKills:'场均击杀'}[el.dataset.sort] + (el===button?' ↓':'');
    if(el===button)el.closest('th').setAttribute('aria-sort','descending');else el.closest('th').removeAttribute('aria-sort');
  }); rankings();
});
function mine() {
  const groups = new Map();
  for (const version of state.mine) { if (!groups.has(version.work)) groups.set(version.work, []); groups.get(version.work).push(version); }
  const expanded = new Set([...document.querySelectorAll('[data-history][open]')].map(el=>el.dataset.history));
  const row = v => `<div class="version-row"><div><strong>v${v.number}</strong><span class="badge ${v.active===v.id?'active':''}">${v.active===v.id?'当前主力':esc(statusText[v.status])}</span><small>${esc(v.model)} · ${esc(v.effort)} · ${v.games} 场${v.games ? ` · ${fmt(v.rating)} 分`:''}${v.note?`<br>${esc(v.note)}`:''}</small>${v.issue?`<small class="issue">${esc(v.issue)}</small>`:''}</div>${v.status==='ready' ? `<button class="secondary" ${v.active===v.id?`data-batch="${esc(v.id)}"`:`data-activate="${esc(v.id)}"`}>${v.active===v.id?(config.apiBase?'加赛 12 场':'安排 12 场'):'切换为主力'} ↗</button>`:''}</div>`;
  const visible = pageOf([...groups.entries()], 'works');
  $('my-works').innerHTML = groups.size ? visible.map(([id, versions]) => {
    const sorted=[...versions].sort((a,b)=>b.number-a.number);
    const current=sorted.find(v=>v.active===v.id) || sorted[0];
    // Keep the current contender and latest upload visible while old versions fold away.
    const primary=sorted.filter(v=>v===current || v===sorted[0]);
    const history=sorted.filter(v=>!primary.includes(v));
    return `<article class="work-card"><header><h3>${esc(current.name)}</h3><button data-new-version="${esc(id)}">上传新版本 ↗</button></header>${primary.map(row).join('')}${history.length?`<details class="version-history" data-history="${esc(id)}" ${expanded.has(id)?'open':''}><summary>历史版本 · ${history.length} 份</summary>${history.map(row).join('')}</details>`:''}</article>`;
  }).join('') : '<div class="empty full"><h3>下一位选手，还在你的代码里。</h3><p>提交第一份 bot.js，通过检查后自动参加排位。</p><button class="secondary" data-upload>提交我的坦克 ↗</button></div>';
  jobs();
}
function jobs() {
  const visible=pageOf(state.jobs,'jobs');
  $('jobs').innerHTML = state.jobs.length ? visible.map(job => `<div class="job"><div>${job.kind==='validate'?'作品运行检查':job.automatic?'自动排位对局':'四人排位对局'} <small>· ${date(job.created)}</small>${job.issue?`<small class="issue">${esc(job.issue)}</small>`:''}</div><span>${esc(statusText[job.status])}</span></div>`).join('') : '<div class="job quiet">目前没有待计算的任务。</div>';
}
function matches() {
  const visible=pageOf(state.matches,'matches');
  $('match-list').innerHTML = state.matches.length ? visible.map(m => `<button class="match-card" data-watch="${esc(m.id)}"><div class="match-map">${esc(mapName(m.mapId))}<time>${date(m.created)}</time></div><div class="match-contenders">${[...m.rows].sort((a,b)=>a.rank-b.rank).map(r=>`<div class="contender"><strong>${r.rank} · ${esc(r.name)}</strong><small>${r.kills} 击杀 <span class="delta ${r.delta<0?'negative':''}">${signed(r.delta)}</span></small></div>`).join('')}</div><span class="match-link">回放 ↗</span></button>`).join('') : '<div class="empty"><h3>战场还在等第一声炮响。</h3><p>提交自己的坦克，通过运行检查后自动参加对局。</p><button class="secondary" data-show-hall>去排位大厅 ↗</button></div>';
}
async function readReplay(id) {
  if (replayCache?.id === id) return replayCache.value;
  if (!replayReads.has(id)) {
    const pending = api(`/api/matches/${id}/replay`).then(value => { replayCache = { id, value }; return value; }).finally(() => replayReads.delete(id));
    replayReads.set(id, pending);
  }
  return replayReads.get(id);
}
async function feature() {
  // A one-frame map preview keeps the hall useful without downloading each new match.
  if (!featureReplay) {
    previewRead ||= api('/api/preview').catch(error => { previewRead = null; throw error; });
    featureReplay = await previewRead; featureEvents = [];
  }
  const latest = state.matches[0];
  if (!latest) {
    $('featured-info').innerHTML = '<p class="feature-caption"><strong>十字猎场</strong>中央交锋，四路入场。</p>';
    return;
  }
  if (featureId === latest.id) return;
  featureId = latest.id;
  $('watch-overlay').textContent = '▶ 观看最新交锋';
  $('watch-label').textContent = '最新交锋';
  const winners = latest.rows.filter(r=>r.rank===1).map(r=>r.name).join(' / ');
  $('featured-info').innerHTML = `<p class="feature-caption"><strong>${esc(winners)} · 胜出</strong>${esc(mapName(latest.mapId))} · ${date(latest.created)}</p>`;
}
function renderState(next) {
  state = next;
  if (config.apiBase) { csrf=next.csrf; $('identity').textContent=next.user ? `${next.user.name} · S01` : '登录主站账号，即可投稿'; }
  $('entry-count').textContent = fmt(state.rankings.length); $('match-count').textContent = fmt(state.counts.matches);
  const pending = state.jobs.filter(j=>['queued','running','held'].includes(j.status)&&j.kind==='match'&&!j.automatic);
  $('queue-label').textContent = state.counts.running ? `计算中 · ${state.counts.queued} 场等待` : state.counts.queued ? `${state.counts.queued} 场等待`:'赛场待命';
  document.querySelector('.queue-status').classList.toggle('busy',state.counts.running>0);
  $('queue-pause').hidden = !pending.some(j=>j.status==='queued'); $('queue-resume').hidden = !pending.some(j=>j.status==='held');
  $('trial-start').disabled = pending.length>0;
  $('trial-progress').textContent = pending.length ? `本组还有 ${pending.length} 场${pending.some(j=>j.status==='held')?' · 已暂停':' · 可离开页面，计算继续'}` : '';
  $('mine-count').textContent = new Set(state.mine.map(v=>v.work)).size || '';
  const options = (config.apiBase ? state.mine.filter(r=>r.active===r.id && r.status==='ready') : state.rankings.filter(r=>r.official)).map(r=>`<option value="${esc(r.id)}">${esc(r.model)} / ${esc(r.name)}</option>`).join('');
  if ($('trial-bot').dataset.options !== options) { const old = $('trial-bot').value; $('trial-bot').innerHTML=options; $('trial-bot').dataset.options=options; if ([...$('trial-bot').options].some(o=>o.value===old)) $('trial-bot').value=old; }
  if (config.apiBase) { $('trial-bot').hidden=!$('trial-bot').options.length; $('trial-start').textContent=$('trial-bot').options.length ? '加赛 12 场 ↗' : '提交我的坦克 ↗'; if (!state.nodeOnline) $('queue-label').textContent='计算节点暂时离线 · 已提交任务保留，恢复后继续'; }
  if (config.apiBase && state.automatic?.enabled && state.nodeOnline) {
    const a=state.automatic;
    $('queue-label').textContent = ({capacity:'存储保护触发 · 自动排赛暂停', 'season-limit':'本季剩余场次不足一整组',cooldown:'自动排赛稍后重试',error:'自动排赛暂缓 · 等待恢复',entrants:'自动排赛 · 等待四位选手'})[a.state] || (state.counts.running ? `自动排位中 · ${state.counts.queued} 场等待` : '自动排位 · 正在安排下一组');
    if (!pending.length && $('trial-bot').options.length) $('trial-progress').textContent='主力已参加自动排位 · 场次少的优先';
  }
  const signature = JSON.stringify([state.rankings,state.mine,state.jobs,state.matches]), changed = signature !== previousSignature;
  if (changed) { previousSignature=signature; rankings(); mine(); matches(); }
  if (changed || !featureReplay) void feature().catch(()=>{});
}
function refresh(force = false) {
  if (refreshRead && !force) return refreshRead;
  const ticket = ++refreshVersion;
  clearTimeout(pollTimer); refreshController?.abort();
  const controller = refreshController = new AbortController();
  refreshRead = (async () => {
    try { const next=await api('/api/state',undefined,controller.signal); if(ticket===refreshVersion && !controller.signal.aborted)renderState(next); }
    catch { if(ticket===refreshVersion && !controller.signal.aborted)$('queue-label').textContent='暂时无法连接，正在重试'; }
    finally { if(ticket===refreshVersion){refreshRead=null;refreshController=null;pollTimer=setTimeout(()=>void refresh(),document.hidden ? 30000 : config.apiBase ? 10000 : 2500);} }
  })();
  return refreshRead;
}
function openUpload(work = '') {
  if (config.apiBase && !state?.user) { config.openAccount?.(); return; }
  fileRequest++; $('upload-form').reset(); source=''; $('file-name').textContent='选择或拖入 bot.js'; $('form-error').textContent='';
  const works=[...new Map((state?.mine||[]).map(v=>[v.work,v])).values()];
  $('work-select').innerHTML='<option value="">新建坦克作品</option>'+works.map(v=>`<option value="${esc(v.work)}">${esc(v.name)} · 新版本</option>`).join('');
  $('work-select').value=work; fillExisting(); $('upload-dialog').showModal();
}
function fillExisting() {
  const existing=state?.mine.find(v=>v.work===$('work-select').value);
  if (existing) for(const name of ['name','model','effort']) $('upload-form').elements[name].value=existing[name];
  $('upload-form').elements.name.readOnly=Boolean(existing);
}
$('work-select').onchange=fillExisting; $('upload-open').onclick=()=>openUpload();
async function loadFile(file) {
  const ticket=++fileRequest, owner=accountEpoch;
  source='';
  if (!file || !file.name.toLowerCase().endsWith('.js') || file.size>262144) { $('form-error').textContent='请选择不超过 256 KiB 的 .js 文件。'; return; }
  const code=await file.text(); if(ticket!==fileRequest || owner!==accountEpoch)return;
  source=code; $('file-name').textContent=`${file.name} · ${(file.size/1024).toFixed(1)} KiB`; $('form-error').textContent='';
}
$('bot-file').onchange=()=>loadFile($('bot-file').files[0]);
$('dropzone').ondragover=e=>{e.preventDefault();$('dropzone').classList.add('over');};
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('over');
$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('over');$('bot-file').required=false;void loadFile(e.dataTransfer.files[0]);};
$('upload-form').onsubmit=async e=>{
  e.preventDefault(); if (!source) { $('form-error').textContent='请先选择代码文件。'; return; }
  const owner=accountEpoch; $('submit-bot').disabled=true;
  try { await api('/api/versions',{...Object.fromEntries(new FormData(e.target)),source}); if(owner!==accountEpoch)return; pages.works=1; $('upload-dialog').close(); switchTab('mine'); toast('已保存版本，正在独立环境中检查。'); await refresh(true); }
  catch(error){if(owner===accountEpoch)$('form-error').textContent=error.message;} finally{if(owner===accountEpoch)$('submit-bot').disabled=false;}
};
async function arrange(version,exhibition=false){const owner=accountEpoch;await api('/api/batches',{version,exhibition});if(owner!==accountEpoch)return;toast('12 场已入队：三张地图，四席轮换。');await refresh(true);}
$('trial-start').onclick=async()=>{const b=$('trial-start'),owner=accountEpoch;b.disabled=true;try{if (config.apiBase && !$('trial-bot').value) openUpload(); else await arrange($('trial-bot').value,!config.apiBase);}catch(e){if(owner===accountEpoch){toast(e.message);b.disabled=false;}}};
for(const action of ['pause','resume','cancel']) $('queue-'+action).onclick=async()=>{const owner=accountEpoch;try{await api('/api/queue',{action});if(owner!==accountEpoch)return;toast(action==='pause'?'当前一场完成后暂停。':action==='resume'?'继续计算。':'已取消尚未开始的比赛，完成的成绩已保留。');await refresh(true);}catch(e){if(owner===accountEpoch)toast(e.message);}};

function detail(id){
  const r=[...state.rankings,...state.mine].find(v=>v.id===id);if(!r)return;
  $('detail-title').textContent=r.name;
  $('detail-body').innerHTML=`<dl><dt>生成模型</dt><dd>${esc(r.model)} · ${esc(r.effort)}${r.official?'':'（作者声明）'}</dd><dt>版本</dt><dd>v${r.number} · ${r.provisional?'定级中':'已定级'}</dd><dt>排位分</dt><dd>${r.games?fmt(r.rating):'等待出战'} · ${r.games} 场</dd><dt>平均表现</dt><dd>${r.avgKills.toFixed(2)} 击杀 / ${r.avgPoints.toFixed(2)} 得分</dd><dt>运行异常</dt><dd>${r.faults} 场</dd><dt>代码指纹</dt><dd>${esc(r.sha)}</dd><dt>执行规则</dt><dd>${esc(state.profile)}</dd></dl><p class="quiet">参赛源代码不向访客公开。排位属于这份代码版本，不直接代表生成模型的总体能力。</p>`;
  $('detail-dialog').showModal();
}
async function watch(id){
  const ticket=++replayRequest;toast('正在载入回放…');
  const loaded=await readReplay(id); if(ticket!==replayRequest)return;
  if($('toast').textContent==='正在载入回放…'){clearTimeout(toastTimer);$('toast').classList.remove('visible');}
  replay=loaded;replayEvents=prepareEffects(replay);time=0;playing=true;
  $('replay-title').textContent=mapName(replay.meta.mapId);$('replay-meta').textContent=`MATCH / SEED ${replay.meta.seed}`;
  $('seek').max=replay.frames.length-1;$('seek').value=0;$('play-toggle').textContent='Ⅱ';
  $('replay-players').innerHTML=[...replay.meta.ladder.entries].sort((a,b)=>a.rank-b.rank).map(r=>`<div class="replay-player"><strong>${r.rank} · ${esc(r.name)}</strong><small>${esc(r.model)} · ${esc(r.effort)}<br>v${r.number} · ${r.kills} 击杀 / ${r.points} 得分${['error','timeout'].includes(r.status)?'<br>运行异常出局':''}</small><span class="delta ${r.delta<0?'negative':''}">${fmt(r.after)} <small>${signed(r.delta)} 排位分</small></span></div>`).join('');
  $('replay-download').href=apiPath(`/api/matches/${id}/replay`); $('replay-download').download=`tank-match-${id}.json`;
  $('replay-dialog').showModal();
}
$('featured-watch').onclick=()=>{if(featureId)void watch(featureId).catch(e=>toast(e.message));else toast('真实对局完成后，这里会出现回放。');};
$('replay-dialog').addEventListener('close',()=>{playing=false;replayRequest++;replay=null;});
$('play-toggle').onclick=()=>{if(replay&&time>=replay.frames.length-1)time=0;playing=!playing;$('play-toggle').textContent=playing?'Ⅱ':'▶';};
$('seek').oninput=()=>{time=Number($('seek').value);playing=false;$('play-toggle').textContent='▶';};
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.pager){
    const key=button.dataset.pager;
    const render={rank:rankings,works:mine,jobs,matches}[key];if(!render)return;
    pages[key]=Number(button.dataset.page);render();
    const pager=$(`${key}-pages`);
    pager.querySelector('[aria-current=page]')?.focus({preventScroll:true});
    const start={rank:document.querySelector('.ranking-panel'),works:$('my-works'),jobs:document.querySelector('.queue-panel'),matches:$('match-list')}[key];
    if(start.getBoundingClientRect().top<0)start.scrollIntoView({block:'start',behavior:reduced.matches?'instant':'smooth'});
    return;
  }
  if(button.hasAttribute('data-show-hall')){switchTab('hall');return;}
  if(button.hasAttribute('data-upload'))return openUpload();
  if(button.dataset.newVersion)return openUpload(button.dataset.newVersion);
  if(button.dataset.detail)return detail(button.dataset.detail);
  if(button.dataset.watch){try{await watch(button.dataset.watch);}catch(error){toast(error.message);}return;}
  if(button.dataset.batch||button.dataset.activate){const owner=accountEpoch;button.disabled=true;try{if(button.dataset.batch)await arrange(button.dataset.batch);else{await api('/api/activate',{id:button.dataset.activate});if(owner!==accountEpoch)return;toast('已切换主力。其他作品和历史战绩仍保留。');await refresh(true);}}catch(error){if(owner===accountEpoch)toast(error.message);}finally{if(owner===accountEpoch)button.disabled=false;}}
});
let last=performance.now();const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function frame(now){
  const delta=Math.min((now-last)/1000,.15);last=now;
  if(featureReplay&&tab==='hall'&&!document.hidden){
    if(featureId&&!reduced.matches)featureTime=(featureTime+delta*10)%featureReplay.frames.length;
    const i=Math.floor(featureTime),f=featureReplay.frames[i];if(f)featureRenderer.draw(f,{next:featureReplay.frames[i+1],blend:featureTime-i,events:recentEffects(featureEvents,featureTime),theme,reduced:reduced.matches});
  }
  if(replay&&$('replay-dialog').open){
    if(playing&&!document.hidden)time=Math.min(replay.frames.length-1,time+delta*10*Number($('speed').value));
    if(time>=replay.frames.length-1){playing=false;$('play-toggle').textContent='▶';}
    const i=Math.floor(time);renderer.draw(replay.frames[i],{next:replay.frames[i+1],blend:time-i,events:recentEffects(replayEvents,time),theme,reduced:reduced.matches});
    $('seek').value=time;$('clock').textContent=`00:${String(Math.floor(time/10)).padStart(2,'0')}`;
  }
  requestAnimationFrame(frame);
}
async function init(){try{if (!config.apiBase) { const session=await api('/api/session',{});csrf=session.csrf;$('identity').textContent=`${session.name} · 本地试玩身份`; }await refresh();requestAnimationFrame(frame);}catch(e){$('queue-label').textContent='连接失败，请刷新重试';toast(e.message);}}
if (config.apiBase) {
  document.querySelector('.export').href=apiPath('/api/export');
  window.addEventListener('ladder-account-change',()=>{
    if(accountIdentity!==config.accountId){
      accountIdentity=config.accountId;accountEpoch++;fileRequest++;source='';csrf='';
      $('upload-dialog').close();$('detail-dialog').close();$('upload-form').reset();$('submit-bot').disabled=false;
      $('file-name').textContent='选择或拖入 bot.js';$('form-error').textContent='';
      if(state)renderState({...state,user:null,csrf:'',mine:[],jobs:[]});
      $('identity').textContent='正在确认当前账号';
    }
    previousSignature='';void refresh(true);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}
void init();
