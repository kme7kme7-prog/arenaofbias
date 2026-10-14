import './style.css';
import { createTankInspector } from '../inspect.mjs';
import { sampleTank, survivalRows } from '../inspect-state.mjs';
import { ROSTER } from '../roster.mjs';
import { createBrowserAdapter } from '../worker.mjs';
import { createRoyale, snapshot, runRoyale } from './engine.mjs';
import { loadRoyaleSource } from './ports.mjs';
import { createRoyaleRenderer, seatColor } from './render.mjs';

document.title = '坦克大逃杀 · Arena of Bias';
document.body.innerHTML = `<div class="royale">
  <header><a class="r-brand" href="/#play"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ARENA OF <b>BIAS</b></span></a><nav class="r-nav"><a href="/tanks.html">← 返回四人赛</a><button id="r-help">玩法说明</button><button id="r-theme">◐ 纸面</button></nav></header>
  <main class="r-main">
    <aside class="r-left"><div><div class="r-eyebrow">实验玩法</div><h1 class="r-title">坦克<br><em>大逃杀。</em></h1></div>
    <section class="r-block"><div class="r-label">基底战场</div><div class="r-maps"><button class="r-map" data-map="ruins" aria-pressed="true">01 / 碎墙荒原<small>交错掩体</small></button><button class="r-map" data-map="grove" aria-pressed="false">02 / 雾林边境<small>草丛与伏击</small></button><button class="r-map" data-map="open" aria-pressed="false">03 / 最后旷野<small>开阔地形</small></button></div></section>
    <div class="r-block"><label class="r-label" for="r-scale">战场大小</label><select class="r-select" id="r-scale"><option value="auto">标准 · 随人数扩展</option><option value="wide">广域 · 更大地图</option></select><label class="r-label" for="r-seed">战场种子 <button id="r-random" aria-label="随机战场种子">⤨</button></label><input class="r-seed" id="r-seed" type="number" min="0" max="4294967295" value="2"></div>
    <section class="r-guide"><div class="r-label">两条命 / 不限时 / 圈缩至零</div><p>20 秒后开始缩圈。拾取即生效，风暴无视护盾。</p><div class="r-legend"><span><b>+</b>维修</span><span><b>»</b>速射</span><span><b>◇</b>护盾</span><span><b>◎</b>雷达</span></div></section></aside>
    <section class="r-center"><div class="r-board-head"><strong id="r-field">碎墙荒原</strong><span id="r-phase" class="r-live">等待入场</span><span id="r-dim">42 × 42</span></div><div class="r-stage"><canvas id="r-board" class="r-canvas" aria-label="大逃杀战场，可点选坦克关注"></canvas><div class="r-empty" id="r-empty"><p>挑选选手，准备入场。</p></div><div class="r-computing" id="r-computing" hidden><div class="r-orbit"></div><h2>战局正在推演。</h2><p id="r-progress">正在载入选手…</p><button id="r-cancel">取消计算</button></div><div class="r-result" id="r-result" hidden><div><small id="r-result-label">最后幸存</small><strong id="r-winner"></strong></div><button id="r-rewatch">再看一遍 ↺</button></div></div>
    <div class="r-controls"><input id="r-seek" type="range" min="0" max="1" value="0" disabled aria-label="回放进度"><div class="r-control-row"><div><button id="r-play" disabled>播放</button> <select id="r-speed" aria-label="回放速度"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></div><small id="r-clock">尚未开场</small><button id="r-reset" hidden>重新布阵 ↗</button></div></div></section>
    <aside class="r-roster"><div class="r-roster-head"><h2 id="r-roster-title">从坦克库挑选</h2><span class="r-count" id="r-count">00</span></div><div id="r-filters"><input class="r-select" id="r-search" type="search" placeholder="搜索模型 / 作品" aria-label="搜索坦克"><div class="r-roster-actions"><button id="r-all">全员入场 ↗</button><button id="r-none">清空选择</button></div></div><div class="r-ranking-control" id="r-ranking-control" hidden><button id="r-ranking-toggle" aria-expanded="false" aria-controls="r-list-wrap">存活排名 · 击杀 <span>展开 ↓</span></button></div><div class="r-list-wrap" id="r-list-wrap"><div class="r-list-clip"><div class="r-list" id="r-list"></div></div></div></aside>
  </main><footer><p class="r-status" id="r-status" role="status">选择至少两位选手，即可开场。</p><button class="r-primary" id="r-start" disabled><span>开始大逃杀</span><span>↗</span></button></footer>
</div>`;
const $ = s => document.querySelector(s);
const selected = new Set();
let terrain = 'ruins', scale = 'auto', seed = crypto.getRandomValues(new Uint32Array(1))[0], phase = 'setup', preview, replay = null, map, cursor = 0, playing = false, controller, focus = null, last = 0, hudAt = -1, mapIndex = 0;
let generation = 0;
const names = { ruins: '碎墙荒原', grove: '雾林边境', open: '最后旷野' };
const draw = createRoyaleRenderer($('#r-board'));
const inspector = createTankInspector({ canvas: $('#r-board') });
$('#r-seed').value = seed;
const entries = () => ROSTER.filter(e => selected.has(e.id));
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function status(message) { $('#r-status').textContent = message; }
function rebuild() {
  if (phase !== 'setup') return;
  preview = createRoyale({ count: Math.max(2, selected.size), seed, terrain, scale });
  map = preview.map;
  $('#r-empty').hidden = selected.size > 0;
  $('#r-dim').textContent = `${preview.size} × ${preview.size}`;
  $('#r-field').textContent = names[terrain];
  $('#r-count').textContent = String(selected.size).padStart(2, '0');
  $('#r-start').disabled = selected.size < 2;
  renderList();
}
function renderList() {
  const query = $('#r-search').value.trim().toLowerCase();
  const pool = phase === 'setup' ? ROSTER : replay?.meta.entrants || entries();
  $('#r-list').innerHTML = '';
  pool.forEach((e, i) => {
    if (phase === 'setup' && !`${e.model} ${e.name}`.toLowerCase().includes(query)) return;
    const card = document.createElement('button'); card.className = 'r-card'; card.dataset.id = e.id;
    card.setAttribute('aria-pressed', String(selected.has(e.id)));
    card.setAttribute('aria-label', `${phase === 'setup' ? '选择' : '关注'} ${e.model} · ${e.name}`);
    card.innerHTML = `${e.logo ? `<img src="${esc(e.logo)}" alt="">` : '<span aria-hidden="true">◇</span>'}<span class="r-card-copy"><strong>${esc(e.model)}</strong><small>${esc(e.name)} · ${esc(e.reasoningEffort)}</small></span><span class="r-tick">${phase === 'setup' ? selected.has(e.id) ? '✓' : '+' : replay?.meta.ids[i] || ''}</span>`;
    card.addEventListener('click', () => {
      if (phase === 'computing') return;
      if (phase === 'setup') { if (selected.has(e.id)) selected.delete(e.id); else selected.add(e.id); rebuild(); }
      else { inspector.select(replay.meta.ids[i]); hudAt = -1; }
    });
    $('#r-list').append(card);
  });
}
function editable(enabled) {
  document.querySelectorAll('.r-map,#r-scale,#r-seed,#r-random,#r-all,#r-none,#r-search').forEach(el => { el.disabled = !enabled; });
  $('#r-filters').hidden = !enabled;
  if (enabled) { $('#r-count').hidden = false; $('#r-list').classList.remove('r-ranking'); }
  $('#r-roster-title').textContent = enabled ? '从坦克库挑选' : '场上选手';
  $('.r-roster').dataset.watching = String(!enabled);
  $('#r-ranking-control').hidden = enabled;
  $('#r-list-wrap').classList.remove('expanded');
  $('#r-ranking-toggle').setAttribute('aria-expanded', 'false');
  $('#r-ranking-toggle span').textContent = '展开 ↓';
  $('#r-list-wrap').inert = !enabled;
}
async function start() {
  if (phase !== 'setup' || selected.size < 2) return;
  const roster = entries(), token = ++generation;
  phase = 'computing'; editable(false); $('#r-start').disabled = true; $('#r-computing').hidden = false; $('#r-empty').hidden = true;
  $('#r-phase').textContent = '本地推演'; $('#r-progress').textContent = `正在载入 ${roster.length} 位选手…`;
  controller = new AbortController();
  status('本地计算中，可随时取消。');
  try {
    const sources = await Promise.all(roster.map(loadRoyaleSource));
    const sourceHashes = await Promise.all(sources.map(async source => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    }));
    if (token !== generation) return;
    if (controller.signal.aborted) throw Object.assign(Error('已取消本场计算'), { code: 'cancelled' });
    const result = await runRoyale({ sources, entrants: roster.map(({ source: _source, ...e }, i) => ({ ...e, sourceVariant: 'royale-port-v1', originalSha256: e.sha256, sourceSha256: sourceHashes[i] })), seed, scale, terrain, adapterFactory: source => createBrowserAdapter(source), signal: controller.signal,
      onProgress: ({ tick, alive }) => { $('#r-progress').textContent = `战场时间 ${(tick / 10).toFixed(1)} 秒 · ${alive} / ${roster.length} 存活`; } });
    if (token !== generation) return;
    replay = result; phase = 'replay'; cursor = 0; playing = true; mapIndex = 0; hudAt = -1;
    map = structuredClone(replay.meta.initialMap); $('#r-computing').hidden = true; $('#r-reset').hidden = false;
    $('#r-start').hidden = true; $('#r-seek').disabled = false; $('#r-seek').max = String(result.frames.length - 1); $('#r-play').disabled = false;
    renderList();
    const failures = result.ranking.filter(r => ['error', 'timeout'].includes(r.status)).length;
    status(failures ? `推演完成，有 ${failures} 位选手运行异常；回放中会显示出局原因。` : '推演完成。点击选手关注，拖动进度条回看。');
  } catch (error) {
    if (token !== generation) return;
    phase = 'setup'; editable(true); $('#r-computing').hidden = true; rebuild();
    $('#r-phase').textContent = '等待入场'; status(error.code === 'cancelled' ? '已取消计算，布阵保留。' : `无法开始：${error.message}`);
  }
}
function reset() {
  inspector.reset();
  controller?.abort(); generation++; phase = 'setup'; replay = null; playing = false; cursor = 0; focus = null;
  $('#r-start').hidden = false; $('#r-reset').hidden = true; $('#r-result').hidden = true; $('#r-computing').hidden = true;
  $('#r-seek').disabled = true; $('#r-seek').value = '0'; $('#r-play').disabled = true; $('#r-play').textContent = '播放';
  $('#r-clock').textContent = '尚未开场'; $('#r-phase').textContent = '等待入场'; editable(true); rebuild(); status('选手已保留，可以换地图或调整阵容。');
}
$('#r-ranking-toggle').onclick = () => {
  const open = $('#r-list-wrap').classList.toggle('expanded');
  $('#r-ranking-toggle').setAttribute('aria-expanded', String(open));
  $('#r-ranking-toggle span').textContent = open ? '收起 ↑' : '展开 ↓';
  $('#r-list-wrap').inert = !open;
};
$('#r-start').onclick = start;
$('#r-cancel').onclick = () => { controller?.abort(); };
$('#r-reset').onclick = reset;
$('#r-all').onclick = () => { ROSTER.forEach(e => selected.add(e.id)); rebuild(); };
$('#r-none').onclick = () => { selected.clear(); rebuild(); };
$('#r-search').oninput = renderList;
document.querySelectorAll('.r-map').forEach(button => { button.onclick = () => { terrain = button.dataset.map; document.querySelectorAll('.r-map').forEach(b => b.setAttribute('aria-pressed', String(b === button))); rebuild(); }; });
$('#r-scale').onchange = e => { scale = e.target.value; rebuild(); };
$('#r-seed').onchange = e => { const n = Number(e.target.value); seed = Number.isFinite(n) ? n >>> 0 : 2; e.target.value = seed; rebuild(); };
$('#r-random').onclick = () => { seed = crypto.getRandomValues(new Uint32Array(1))[0]; $('#r-seed').value = seed; rebuild(); };
$('#r-play').onclick = () => { if (!replay) return; if (cursor >= replay.frames.length - 1) cursor = 0; playing = !playing; hudAt = -1; };
$('#r-rewatch').onclick = () => { cursor = 0; playing = true; hudAt = -1; };
$('#r-seek').oninput = e => { cursor = Number(e.target.value); playing = false; hudAt = -1; };
$('#r-help').onclick = () => {
  const dialog = document.createElement('dialog'); dialog.style.cssText = 'max-width:480px;width:calc(100% - 36px);padding:30px;background:var(--panel);color:var(--text);border:1px solid var(--line);line-height:1.9';
  dialog.innerHTML = '<h2>最后一辆，留在场上。</h2><p>挑选至少两件作品，也可以全员参赛。地图会随人数扩展，每辆坦克两条命，每条命两格装甲。首次阵亡后优先在安全区空位重新入场；安全区无空位时在圈外入场，仍会受到风暴伤害。</p><p>20 秒开始缩圈，每 3 秒收缩一格，直到安全区消失。圈外每秒损失一格装甲，最后幸存者获胜；同拍全灭则无人生还。</p><p>维修恢复一格装甲；速射与全图雷达持续 8 秒；护盾抵挡一发炮弹，不挡风暴。所有道具自动拾取。</p><p>先在本机计算，再播放回放；不调用模型，不计正式成绩。旧作品做了兼容移植，保留原件，娱乐模式成绩不代表原四人赛实力。</p><button autofocus>明白了</button>';
  dialog.querySelector('button').onclick = () => dialog.close(); dialog.onclose = () => dialog.remove(); document.body.append(dialog); dialog.showModal();
};
function themeLabel() { $('#r-theme').textContent = document.documentElement.dataset.theme === 'ink' ? '◐ 墨色' : '◐ 纸面'; }
$('#r-theme').onclick = () => { const value = document.documentElement.dataset.theme === 'ink' ? 'paper' : 'ink'; document.documentElement.dataset.theme = value; try { localStorage.setItem('aob-theme', value); } catch {} themeLabel(); };
document.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !window.PlaygroundEntry) return;
  event.preventDefault(); controller?.abort(); window.PlaygroundEntry.navigate(a.href, true);
}));
document.addEventListener('keydown', e => {
  if (!replay || /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); $('#r-play').click(); }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.preventDefault(); cursor = Math.max(0, Math.min(replay.frames.length - 1, Math.floor(cursor) + (e.code === 'ArrowRight' ? 1 : -1))); playing = false; hudAt = -1; }
});
function updateHud(frame, index) {
  const alive = Object.values(frame.tanks).filter(t => t.onField).length;
  $('#r-count').textContent = String(alive).padStart(2, '0'); $('#r-seek').value = index;
  $('#r-clock').textContent = `${(frame.tick / 10).toFixed(1)}s / ${(replay.frames.at(-1).tick / 10).toFixed(1)}s`;
  $('#r-play').textContent = playing ? '暂停' : '播放';
  $('#r-phase').textContent = index === replay.frames.length - 1 ? '本场结束' : frame.arena.phase === 'skirmish' ? '自由交锋' : frame.arena.phase === 'collapse' ? '风暴收缩' : '最后交锋';
  const ended = index === replay.frames.length - 1;
  $('#r-result').hidden = !ended;
  if (ended) {
    const leaders = replay.ranking.filter(r => r.rank === 1 && !['error', 'timeout'].includes(r.status));
    $('#r-result-label').textContent = replay.winners.length ? '本场第一' : leaders.length ? '全员阵亡 · 本场排名' : '本场结束';
    $('#r-winner').textContent = leaders.length > 1 ? `${leaders.length} 位选手并列第一` : leaders.length ? replay.meta.entrants[replay.meta.ids.indexOf(leaders[0].id)].model : '选手运行异常';
  }
  $('#r-roster-title').textContent = ended ? '本场排名' : '场上存活';
  $('#r-count').hidden = ended;
  $('#r-list').classList.add('r-ranking');
  const rows = survivalRows(frame, replay.meta.ids);
  document.querySelectorAll('.r-card').forEach((card, i) => {
    const id = replay.meta.ids[i], t = frame.tanks[id], sc = frame.scores[id];
    const result = rows.find(r => r.id === id);
    card.style.order = String(rows.findIndex(r => r.id === id));
    card.classList.toggle('eliminated', !ended && !t.onField); card.classList.toggle('winner', ended && result.rank === 1 && !['error', 'timeout'].includes(sc.status));
    card.style.borderLeft = `3px solid ${seatColor(i)}`;
    card.setAttribute('aria-pressed', String(focus === id));
    card.querySelector('.r-tick').textContent = ended || !result.alive ? String(result.rank).padStart(2, '0') : '·';
    const place = ended && replay.ranking.filter(r => r.rank === result.rank).length > 1 ? '并列 · ' : '';
    card.querySelector('small').textContent = `${place}${sc.kills} 击杀 · ${sc.status === 'error' ? '程序异常' : sc.status === 'timeout' ? '决策超时' : t.onField ? `${t.lives} 命` : `${(sc.eliminatedAt / 10).toFixed(1)}s 淘汰`}`;
  });
  if (focus) {
    const i = replay.meta.ids.indexOf(focus), sc = frame.scores[focus];
    const failure = replay.events.find(e => e.side === focus && ['error', 'timeout'].includes(e.kind) && e.tick <= frame.tick);
    status(`${replay.meta.entrants[i].model} · ${replay.meta.entrants[i].name} — ${failure ? failure.text : `${sc.kills} 击毁 / ${sc.damage} 伤害`}`);
  } else {
    const note = replay.events.findLast(e => e.tick <= frame.tick && ['eliminated', 'frag', 'pickup', 'zone', 'error', 'timeout', 'end'].includes(e.kind));
    const model = note?.side ? replay.meta.entrants[replay.meta.ids.indexOf(note.side)]?.model : '';
    status(note ? `${(note.tick / 10).toFixed(1)}s · ${model ? `${model} — ` : ''}${note.text}` : '交锋开始。点击选手关注，拖动进度条回看。');
  }
}
function animate(time) {
  const elapsed = Math.min(80, time - (last || time)); last = time;
  if (replay) {
    if (playing) cursor = Math.min(replay.frames.length - 1, cursor + elapsed / 100 * Number($('#r-speed').value));
    if (cursor >= replay.frames.length - 1) playing = false;
    const index = Math.floor(cursor), frame = replay.frames[index];
    if (index < mapIndex) { map = structuredClone(replay.meta.initialMap); mapIndex = 0; }
    for (let i = mapIndex + 1; i <= index; i++) for (const b of replay.frames[i].brickBreaks) map[b.y][b.x] = 0;
    mapIndex = index;
    inspector.update(replay.meta.ids.map((id, i) => {
      const t = frame.tanks[id], sc = frame.scores[id], e = replay.meta.entrants[i];
      return { ...sampleTank(t, replay.frames[index + 1]?.tanks[id], cursor % 1), id, model: e.model, name: e.name, logo: e.logo, effort: e.reasoningEffort, color: seatColor(i), kills: sc.kills, damage: sc.damage,
        status: sc.status === 'error' ? '运行异常' : sc.status === 'timeout' ? '决策超时' : !t.onField ? '已淘汰' : [t.shield && '护盾', t.rapidTicks && '速射', t.radarTicks && '雷达'].filter(Boolean).join(' · ') || '正在交战' };
    }), replay.meta.size);
    if (focus !== inspector.id) { focus = inspector.id; hudAt = -1; }
    draw({ map, frame, next: replay.frames[Math.min(index + 1, replay.frames.length - 1)], fraction: cursor % 1, ids: replay.meta.ids, focus, effects: replay.events.filter(e => ['fire', 'armorHit', 'eliminated', 'shieldHit'].includes(e.kind) && frame.tick - e.tick <= 5 && frame.tick >= e.tick) });
    if (hudAt !== index) { hudAt = index; updateHud(frame, index); }
  } else if (preview) { inspector.update([], preview.size, false); draw({ map, frame: snapshot(preview), ids: preview.ids, selected: selected.size }); }
  requestAnimationFrame(animate);
}
window.addEventListener('pagehide', () => controller?.abort());
themeLabel(); rebuild(); requestAnimationFrame(animate); window.PlaygroundEntry?.ready();
