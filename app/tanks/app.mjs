import {
  createBrawl,
  snapshotBrawl,
  runBrawl,
  BRAWL_SIDES,
} from './engine/core/brawl.js';
import {
  BRAWL_MAPS,
  BRAWL_SPAWNS,
  loadBrawlMap,
} from './engine/core/brawl-maps.js';
import { validateStage } from './engine/core/stage.js';
import { validateBrawlReplay } from './engine/runner/brawl-replay.js';
import { createBrawlAudio } from './engine/ui/brawl-audio.js';
import { createBrowserAdapter, DECISION_BUDGET } from './worker.mjs';
import { ROSTER } from './roster.mjs';
import { createRenderer, drawMini } from './render.mjs';
import { prepareEffects, recentEffects } from './presentation.mjs';
import {
  PAINTS,
  occupied,
  defaultColors,
  readColors,
  readSeats,
  validateDraft,
  vacantSpawn,
  setSeatColor,
} from './workbench.mjs';
import { createTour } from './tour.mjs';

const $ = (selector) => document.querySelector(selector);
const clone = (value) => structuredClone(value);
const sides = BRAWL_SIDES;
const storageKey = 'aob-tank-workbench-v2';
const defaults = () => ({
  mapId: 'crossroads',
  name: '十字猎场',
  experimental: false,
  stage: { map: loadBrawlMap('crossroads'), spawns: clone(BRAWL_SPAWNS) },
  seats: { A: null, B: null, C: null, D: null },
  colors: defaultColors(),
  seed: 2,
});
let config = defaults(),
  selected = 'A',
  tool = 'move',
  brush = 1,
  editing = false;
let theme = 'paper',
  phase = 'setup',
  replay = null,
  frameIndex = 0,
  fraction = 0,
  playing = false;
let closedResult = false,
  controller = null,
  gesture = null,
  hover = null,
  ghost = null;
let lastTime = 0,
  lastHud = -1,
  raf,
  preview,
  eventsByTick = new Map(),
  visualEffects = [],
  eventRows = [];
const undo = [],
  renderer = createRenderer($('#board')),
  audio = createBrawlAudio();
const intents = {
  advance: '向前推进',
  flank: '侧翼转移',
  hold: '原地观察',
  pursue: '追击目标',
  retreat: '撤离交锋',
  resupply: '争抢补给',
  defend: '防守',
  siege: '进攻',
  unknown: '等待行动',
};
const motion = matchMedia('(prefers-reduced-motion: reduce)');

function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('error', error);
}
function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
function identity(id) {
  if (phase !== 'watch')
    return ROSTER.find((r) => r.id === config.seats[id]) || null;
  const record = replay?.meta.website?.entrants?.[replay.meta.seatSlots[id]];
  const known = ROSTER.find(
    (r) => r.id === record?.id && r.sha256 === record?.sha256,
  );
  return known
    ? {
        ...known,
        reasoningEffort: ['default', 'medium', 'high', 'max'].includes(
          record.reasoningEffort,
        )
          ? record.reasoningEffort
          : known.reasoningEffort,
      }
    : {
        name: replay.names?.[id] || `选手 ${id}`,
        model: '导入回放',
        logo: null,
      };
}
function appendEffort(container, entry) {
  if (!['default', 'medium', 'high', 'max'].includes(entry?.reasoningEffort)) return;
  const badge = document.createElement('span');
  badge.className = 'reasoning-badge';
  badge.textContent = entry.reasoningEffort;
  badge.title = `生成此坦克时的思考强度：${entry.reasoningEffort}`;
  badge.setAttribute('aria-label', `思考强度 ${entry.reasoningEffort}`);
  container.append(badge);
}
function workMeta(entry, showName = true) {
  const meta = document.createElement('span');
  meta.className = 'work-meta';
  if (showName) {
    const name = document.createElement('span');
    name.className = 'work-name';
    name.textContent = entry?.name || '从坦克库加入';
    meta.append(name);
  }
  appendEffort(meta, entry);
  return meta;
}
function readConfig(value) {
  if (
    !value ||
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed > 4294967295
  )
    throw Error('布置文件中的种子不正确。');
  const seats = readSeats(value.seats, ROSTER),
    stage = validateDraft({ ...value, seats });
  const original = BRAWL_MAPS.find((m) => m.id === value.mapId);
  const standard =
    original &&
    JSON.stringify(stage.map) === JSON.stringify(loadBrawlMap(original.id)) &&
    JSON.stringify(stage.spawns) === JSON.stringify(BRAWL_SPAWNS);
  return {
    stage,
    seats,
    colors: readColors(value.colors),
    seed: value.seed,
    mapId: original?.id || 'crossroads',
    name: standard ? original.name : '自定义战场',
    experimental: !standard,
  };
}
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) config = readConfig(JSON.parse(saved));
} catch {
  /* Start from the known map if an old local draft is invalid. */
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    status('当前布置仍可使用；浏览器暂时无法保留草稿。');
  }
}
function checkpoint() {
  undo.push(clone(config));
  if (undo.length > 50) undo.shift();
}
function updatePreview() {
  const state = createBrawl(config.mapId, config.seed);
  state.map = clone(config.stage.map);
  for (const id of sides)
    Object.assign(state.tanks[id], config.stage.spawns[id], {
      onField: config.seats[id] ? 1 : 0,
    });
  preview = snapshotBrawl(state);
}
function seatColors() {
  return sides.map((id) =>
    phase === 'watch'
      ? readColors(replay.meta.website?.colors)[id]
      : config.colors[id],
  );
}
function resetBase(mapId = config.mapId) {
  if (phase !== 'setup') return;
  const map = BRAWL_MAPS.find((m) => m.id === mapId) || BRAWL_MAPS[0];
  config.mapId = map.id;
  config.name = map.name;
  config.experimental = false;
  config.stage = { map: loadBrawlMap(map.id), spawns: clone(BRAWL_SPAWNS) };
  undo.length = 0;
  tool = 'move';
  editing = false;
  gesture = null;
  ghost = null;
  hover = null;
  commit(`已恢复${map.name}，选手与颜色保留。`);
  renderPalette();
}
function markExperiment() {
  config.experimental = true;
  config.name = '自定义战场';
}
function commit(message) {
  updatePreview();
  persist();
  renderSetup();
  if (message) status(message);
}

function renderMaps() {
  $('#maps').replaceChildren();
  for (const [i, map] of BRAWL_MAPS.entries()) {
    const button = document.createElement('button');
    button.className = 'map-choice';
    button.dataset.map = map.id;
    button.setAttribute('aria-label', `选择${map.name}`);
    button.setAttribute('aria-pressed', String(config.mapId === map.id));
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = map.name;
    button.append(canvas, text);
    button.addEventListener('click', () => {
      resetBase(map.id);
    });
    $('#maps').append(button);
    drawMini(canvas, loadBrawlMap(map.id), theme);
    button.dataset.index = String(i);
  }
}
function renderRoster() {
  $('#roster').replaceChildren();
  const colors = seatColors();
  for (const [i, id] of sides.entries()) {
    const r = identity(id),
      card = document.createElement('div');
    card.className = 'entrant' + (!r ? ' vacant' : '');
    card.dataset.side = id;
    card.style.setProperty('--c', colors[i]);
    card.setAttribute('aria-pressed', String(id === selected));
    const choose = document.createElement('button');
    choose.className = 'entrant-select';
    choose.setAttribute(
      'aria-label',
      r ? `选中坦克 ${id}：${r.model}` : `为 ${id} 席挑选选手`,
    );
    choose.disabled = phase === 'computing';
    const img = document.createElement('img');
    img.className = 'entrant-logo';
    img.alt = '';
    if (r?.logo) img.src = r.logo;
    else img.hidden = true;
    const plus = document.createElement('span');
    plus.className = 'seat-plus';
    plus.textContent = '+';
    plus.hidden = !!r;
    const text = document.createElement('span');
    text.className = 'entrant-copy';
    const model = document.createElement('strong');
    model.textContent = r?.model || '挑选选手';
    text.append(model, workMeta(r));
    const letter = document.createElement('span');
    letter.className = 'entrant-letter';
    letter.textContent = id;
    choose.append(img, plus, text, letter);
    card.append(choose);
    choose.addEventListener('click', () => {
      if (phase === 'computing') return;
      selected = id;
      if (!r) {
        openLibrary(id);
        return;
      }
      if (phase === 'setup') {
        tool = 'move';
        renderPalette();
      }
      renderRoster();
      updateSelection();
      lastHud = -1;
    });
    if (phase === 'watch') {
      const data = document.createElement('div');
      data.className = 'entrant-data';
      data.innerHTML =
        '<span class="life"></span><span class="armor"></span><span class="points"></span>';
      const intent = document.createElement('p');
      intent.className = 'intent';
      card.append(data, intent);
    } else {
      const tools = document.createElement('div');
      tools.className = 'seat-tools';
      const color = document.createElement('button');
      color.className = 'seat-color';
      color.setAttribute('aria-label', `更换 ${id} 席颜色`);
      const dot = document.createElement('i');
      dot.style.background = colors[i];
      color.append(dot, document.createTextNode('颜色'));
      color.disabled = phase === 'computing';
      color.addEventListener('click', () => openColors(id));
      tools.append(color);
      if (r) {
        const change = document.createElement('button');
        change.textContent = '换选手';
        change.className = 'text-button';
        change.disabled = phase === 'computing';
        change.addEventListener('click', () => openLibrary(id));
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.className = 'seat-remove';
        remove.setAttribute('aria-label', `移出 ${id} 席选手`);
        remove.disabled = phase === 'computing';
        remove.addEventListener('click', () => {
          checkpoint();
          config.seats[id] = null;
          commit(`${r.name} 已回到坦克库。`);
        });
        tools.append(change, remove);
      } else {
        const label = document.createElement('span');
        label.className = 'seat-wait';
        label.textContent = '等待入场';
        tools.append(label);
      }
      card.append(tools);
    }
    $('#roster').append(card);
  }
}
let librarySeat = 'A';
function openLibrary(
  id = sides.find((side) => !config.seats[side]) || selected,
) {
  if (phase !== 'setup') return;
  librarySeat = id;
  $('#library-search').value = '';
  renderLibrary();
  $('#tank-library').showModal();
  $('#library-search').focus();
}
function renderLibrary() {
  $('#library-title').textContent = `给 ${librarySeat} 席挑位选手`;
  const q = $('#library-search').value.trim().toLowerCase();
  const entries = ROSTER.filter((r) =>
    `${r.name} ${r.model} ${r.reasoningEffort}`.toLowerCase().includes(q),
  );
  $('#library-count').textContent = `${entries.length} 份坦克程序`;
  $('#library-list').replaceChildren();
  $('#library-empty').hidden = !!entries.length;
  $('#library-error').textContent = '';
  for (const r of entries) {
    const used = sides.find((id) => config.seats[id] === r.id),
      card = document.createElement('button');
    card.className = 'library-card';
    card.dataset.bot = r.id;
    card.disabled = !!used;
    const img = document.createElement('img');
    img.alt = '';
    if (r.logo) img.src = r.logo;
    else img.hidden = true;
    const copy = document.createElement('span');
    copy.className = 'library-copy';
    const model = document.createElement('strong');
    model.textContent = r.model;
    copy.append(model, workMeta(r));
    const action = document.createElement('span');
    action.className = 'library-action';
    action.textContent = used ? `已在 ${used} 席` : '入场 ↗';
    card.append(img, copy, action);
    card.setAttribute(
      'aria-label',
      `${r.model} · ${r.name}${used ? `，已在 ${used} 席` : '，加入本场'}`,
    );
    card.addEventListener('click', () => {
      const p = vacantSpawn(config, librarySeat);
      if (!p) {
        $('#library-error').textContent =
          '战场没有能容下坦克的 2 × 2 空间，请先擦出一块空地。';
        return;
      }
      checkpoint();
      config.seats[librarySeat] = r.id;
      config.stage.spawns[librarySeat] = p;
      if (JSON.stringify(p) !== JSON.stringify(BRAWL_SPAWNS[librarySeat]))
        markExperiment();
      selected = librarySeat;
      tool = 'move';
      $('#tank-library').close();
      commit(`${r.name} 已入场，可以拖动它安排位置。`);
      renderPalette();
    });
    $('#library-list').append(card);
  }
}
function openColors(id) {
  if (phase !== 'setup') return;
  $('#color-title').textContent = `${id} 席，换个颜色`;
  $('#color-options').replaceChildren();
  for (const p of PAINTS) {
    const button = document.createElement('button');
    button.className = 'color-option';
    button.dataset.color = p.value;
    button.setAttribute('aria-label', p.name);
    button.setAttribute('aria-pressed', String(config.colors[id] === p.value));
    const swatch = document.createElement('i');
    swatch.style.background = p.value;
    button.append(swatch, document.createTextNode(p.name));
    button.addEventListener('click', () => {
      setSeatColor(config, id, p.value);
      $('#color-dialog').close();
      commit(`${id} 席换成${p.name}。`);
    });
    $('#color-options').append(button);
  }
  $('#color-dialog').showModal();
}
$('#open-library').addEventListener('click', () => openLibrary());
$('#empty-library').addEventListener('click', () => openLibrary());
$('#close-library').addEventListener('click', () => $('#tank-library').close());
$('#close-colors').addEventListener('click', () => $('#color-dialog').close());
$('#library-search').addEventListener('input', renderLibrary);
$('#reset-all').addEventListener('click', () => resetBase());
function updateSelection() {
  const r = identity(selected);
  $('#selected-label').textContent = r
    ? `选中 ${selected} · ${r.name}`
    : '先从坦克库挑选选手';
  $('#rotate').disabled = phase !== 'setup' || !r;
}
function renderSetup() {
  document.body.dataset.state = phase;
  document.body.dataset.editing = String(editing && phase === 'setup');
  $('#map-title').textContent =
    phase === 'watch'
      ? replay.meta.website?.label ||
        BRAWL_MAPS.find((m) => m.id === replay.meta.mapId)?.name ||
        '自定义战场'
      : config.name;
  const experimental =
    phase === 'watch' ? !!replay.meta.stage : config.experimental;
  $('#mode-badge').textContent = experimental
    ? '实验玩法 · 自由布阵'
    : '标准地图';
  $('#mode-badge').classList.toggle('experimental', experimental);
  $('#map-description').textContent = config.experimental
    ? '把难题摆在战场上，看看它们怎么应对。'
    : BRAWL_MAPS.find((m) => m.id === config.mapId)?.desc;
  const watch = phase === 'watch';
  const count = occupied(config).length;
  $('#empty-arena').hidden =
    watch || phase === 'computing' || count > 0 || editing;
  $('#open-library').hidden = watch;
  $('#board-hint>span').textContent = count
    ? '↖ 拖动坦克，安排开场位置'
    : '先挑选手，再拖动坦克安排位置';
  $('.setup-tools').hidden = watch;
  $('#match-story').hidden = !watch;
  $('#editor').hidden = !editing;
  $('#edit-map').hidden = editing;
  $('#position-tools').hidden = watch;
  $('.round-controls').hidden = watch;
  $('#board-hint').hidden = watch;
  $('#transport').hidden = !watch;
  $('#start').hidden = watch;
  $('#new-round').hidden = !watch;
  $('#loading').hidden = phase !== 'computing';
  $('#round-note').textContent =
    !watch && count < 4
      ? `已入场 ${count} / 4 · 还差 ${4 - count} 位选手`
      : experimental
        ? '实验局 · 自绘地图与布阵随回放保存'
        : '三条命 · 两格装甲 · 最多一分钟';
  $('#seed').value = config.seed;
  $('#undo').disabled = undo.length === 0;
  renderMaps();
  renderRoster();
  updateSelection();
  for (const el of document.querySelectorAll(
    '.setup-tools button,.setup-tools input,.setup-tools select,.round-controls button,.round-controls input,#start,#reset-positions,#open-replay,#open-library,#help,#empty-library',
  )) {
    el.disabled = phase === 'computing' || (el.id === 'undo' && !undo.length);
  }
  $('#start').disabled = phase === 'computing' || count !== 4;
  $('#shuffle').disabled = phase !== 'setup' || count < 2;
  $('#reset-positions').disabled = phase !== 'setup' || !count;
  if (!watch) {
    $('#phase').textContent = phase === 'computing' ? '正在推演' : '等待开场';
    $('#clock').innerHTML = '60<span>.0</span>';
  }
}
function renderPalette() {
  $('#palette').replaceChildren();
  for (const [value, name] of [
    [0, '空地'],
    [1, '砖墙'],
    [2, '钢墙'],
    [3, '河道'],
    [4, '草地'],
  ]) {
    const button = document.createElement('button');
    button.className = 'paint-tool';
    button.dataset.tile = value;
    button.setAttribute('aria-label', `${name}画笔`);
    button.setAttribute('aria-pressed', String(tool === value));
    button.innerHTML = `<i class="paint-chip" data-tile="${value}" aria-hidden="true"></i><span>${name}</span>`;
    button.addEventListener('click', () => {
      tool = value;
      hover = null;
      renderPalette();
      status(`正在画${name}。点选右侧 AI 可切回移动坦克。`);
    });
    $('#palette').append(button);
  }
}
function applyTheme(preference, save = false) {
  theme =
    preference === 'ink' ||
    (preference === 'system' &&
      matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'ink'
      : 'paper';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === 'ink' ? 'dark' : 'light';
  $('#theme span').textContent = theme === 'ink' ? '墨色' : '纸面';
  $('#theme').setAttribute(
    'aria-label',
    theme === 'ink' ? '切换为纸面主题' : '切换为墨色主题',
  );
  document.querySelector('meta[name=theme-color]').content =
    theme === 'ink' ? '#1f2b26' : '#f1efe5';
  if (save)
    try {
      localStorage.setItem('aob-theme', theme);
    } catch {}
  renderMaps();
}
try {
  applyTheme(localStorage.getItem('aob-theme'));
} catch {
  applyTheme('paper');
}
$('#theme').addEventListener('click', () =>
  applyTheme(theme === 'paper' ? 'ink' : 'paper', true),
);
window.addEventListener('storage', (e) => {
  if (e.key === 'aob-theme') applyTheme(e.newValue);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  try {
    if (localStorage.getItem('aob-theme') === 'system') applyTheme('system');
  } catch {}
});

// Map editing uses a draft per pointer stroke, so a rejected placement never
// partially moves another tank or leaves an invalid saved configuration.
const board = $('#board');
function cell(event) {
  const r = board.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(25, Math.floor(((event.clientX - r.left) * 26) / r.width)),
    ),
    y: Math.max(
      0,
      Math.min(25, Math.floor(((event.clientY - r.top) * 26) / r.height)),
    ),
  };
}
function canPlace(id, p) {
  try {
    validateStage(
      {
        map: config.stage.map,
        spawns: { ...config.stage.spawns, [id]: p },
      },
      occupied(config),
    );
    return true;
  } catch {
    return false;
  }
}
function tryMove(id, p, saveUndo = true) {
  if (!config.seats[id]) {
    status('先从坦克库挑一名选手，再安排位置。');
    return false;
  }
  if (!canPlace(id, p)) {
    status(
      '这里放不下：车身需要完整的 2 × 2 空地或草地，且不能与其他坦克重叠。',
      true,
    );
    return false;
  }
  if (JSON.stringify(config.stage.spawns[id]) === JSON.stringify(p))
    return false;
  if (saveUndo) checkpoint();
  config.stage.spawns[id] = p;
  markExperiment();
  commit(`已移动 ${id} · ${identity(id).name}。`);
  return true;
}
function paintAt(point) {
  const map = config.stage.map.map((row) => row.slice());
  for (let dy = 0; dy < brush; dy++)
    for (let dx = 0; dx < brush; dx++) {
      let x = point.x + dx,
        y = point.y + dy;
      if (x > 25 || y > 25) continue;
      for (let r = 0; r < ($('#mirror').checked ? 4 : 1); r++) {
        map[y][x] = tool;
        [x, y] = [25 - y, x];
      }
    }
  try {
    validateStage({ map, spawns: config.stage.spawns }, occupied(config));
  } catch {
    hover = { ...point, size: brush, valid: false };
    return;
  }
  if (JSON.stringify(map) === JSON.stringify(config.stage.map)) return;
  config.stage.map = map;
  markExperiment();
  gesture.changed = true;
  updatePreview();
}
function linePaint(from, to) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
  for (let i = 0; i <= steps; i++)
    paintAt({
      x: Math.round(from.x + ((to.x - from.x) * i) / steps),
      y: Math.round(from.y + ((to.y - from.y) * i) / steps),
    });
}
board.addEventListener('pointerdown', (e) => {
  if (phase !== 'setup' || e.button !== 0) return;
  e.preventDefault();
  board.focus({ preventScroll: true });
  board.setPointerCapture(e.pointerId);
  const p = cell(e),
    id = sides.find((id) => {
      if (!config.seats[id]) return false;
      const t = config.stage.spawns[id];
      return p.x >= t.x && p.x < t.x + 2 && p.y >= t.y && p.y < t.y + 2;
    });
  if (id) {
    selected = id;
    tool = 'move';
    gesture = {
      kind: 'tank',
      id,
      dx: p.x - config.stage.spawns[id].x,
      dy: p.y - config.stage.spawns[id].y,
    };
    renderRoster();
    updateSelection();
    renderPalette();
  } else if (tool === 'move') {
    gesture = { kind: 'tap', point: p };
  } else {
    gesture = { kind: 'paint', before: clone(config), last: p, changed: false };
    paintAt(p);
  }
});
board.addEventListener('pointermove', (e) => {
  if (phase !== 'setup') return;
  const p = cell(e);
  if (gesture?.kind === 'tank') {
    const t = config.stage.spawns[gesture.id],
      candidate = { x: p.x - gesture.dx, y: p.y - gesture.dy, dir: t.dir };
    ghost = { id: gesture.id, ...candidate };
    hover = { ...candidate, size: 2, valid: canPlace(gesture.id, candidate) };
  } else if (gesture?.kind === 'paint') {
    hover = { ...p, size: brush, valid: true };
    linePaint(gesture.last, p);
    gesture.last = p;
  } else {
    hover = tool === 'move' ? null : { ...p, size: brush, valid: true };
  }
});
function endGesture(e, cancelled = false) {
  if (!gesture) return;
  if (!cancelled && gesture.kind === 'tank' && ghost) {
    const { x, y, dir } = ghost;
    tryMove(gesture.id, { x, y, dir });
  }
  if (!cancelled && gesture.kind === 'tap') {
    const p = cell(e);
    tryMove(selected, {
      x: p.x,
      y: p.y,
      dir: config.stage.spawns[selected].dir,
    });
  }
  if (gesture.kind === 'paint') {
    if (cancelled) config = gesture.before;
    else if (gesture.changed) {
      undo.push(gesture.before);
      if (undo.length > 50) undo.shift();
    }
    commit(
      cancelled
        ? '已取消这次绘制。'
        : gesture.changed
          ? '地形已更新。实验战场准备好了。'
          : '坦克脚下保留可通行地面。',
    );
  }
  gesture = null;
  ghost = null;
  hover = null;
}
board.addEventListener('pointerup', (e) => endGesture(e));
board.addEventListener('pointercancel', (e) => endGesture(e, true));
board.addEventListener('lostpointercapture', (e) => endGesture(e, true));
board.addEventListener('pointerleave', () => {
  if (!gesture) hover = null;
});
function rotate() {
  if (phase !== 'setup' || !config.seats[selected]) return;
  const p = config.stage.spawns[selected];
  tryMove(selected, { ...p, dir: (p.dir + 1) % 4 });
}
$('#rotate').addEventListener('click', rotate);
$('#edit-map').addEventListener('click', () => {
  editing = true;
  tool = 1;
  renderSetup();
  renderPalette();
  status('实验功能：按住拖动画地形，画错可撤销；撤销全部会恢复基底战场。');
});
$('#finish-edit').addEventListener('click', () => {
  editing = false;
  tool = 'move';
  hover = null;
  renderSetup();
});
$('#brush').addEventListener('change', (e) => {
  brush = Number(e.target.value);
});
$('#undo').addEventListener('click', () => {
  if (!undo.length || phase !== 'setup') return;
  config = undo.pop();
  commit('已撤销上一步。');
});
$('#clear-map').addEventListener('click', () => {
  checkpoint();
  config.stage.map = Array.from({ length: 26 }, () => Array(26).fill(0));
  markExperiment();
  commit('空白战场已铺好，开始画吧。');
});
$('#reset-positions').addEventListener('click', () => {
  try {
    validateStage(
      { map: config.stage.map, spawns: BRAWL_SPAWNS },
      occupied(config),
    );
  } catch {
    status('四角被地形占住了，请先擦出坦克能放下的空间。', true);
    return;
  }
  checkpoint();
  config.stage.spawns = clone(BRAWL_SPAWNS);
  config = readConfig(config);
  commit('四辆坦克已回到四角。');
});
$('#shuffle').addEventListener('click', () => {
  checkpoint();
  const slots = sides.map((id) => config.seats[id]);
  for (let i = 3; i > 0; i--) {
    const j = newSeed() % (i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  config.seats = Object.fromEntries(sides.map((id, i) => [id, slots[i]]));
  commit('选手已换位，地图与起点保持。');
});
function captureSeed() {
  const n = Number($('#seed').value);
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    n > 4294967295 ||
    !$('#seed').value.trim()
  )
    throw Error('种子请填 0 到 4294967295 之间的整数。');
  config.seed = n;
}
$('#seed').addEventListener('change', () => {
  try {
    captureSeed();
    persist();
  } catch (e) {
    status(e.message, true);
  }
});
$('#random-seed').addEventListener('click', () => {
  config.seed = newSeed();
  $('#seed').value = config.seed;
  persist();
  status('新的随机种子已准备好。');
});

function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function start() {
  if (controller) return;
  try {
    if (occupied(config).length !== 4) throw Error('先从坦克库挑满四位选手。');
    captureSeed();
    validateStage(config.stage);
  } catch (e) {
    status(e.message, true);
    return;
  }
  const captured = clone(config);
  controller = new AbortController();
  const job = controller;
  playing = false;
  phase = 'computing';
  $('#result').hidden = true;
  $('#compute-fill').style.width = '0%';
  $('#compute-count').textContent = '0 / 600';
  renderSetup();
  status('四个 AI 正在本机推演，算完就开场。');
  try {
    const chosen = sides.map((id) =>
      ROSTER.find((r) => r.id === captured.seats[id]),
    );
    const sources = await Promise.all(chosen.map((r) => r.source()));
    if (job.signal.aborted)
      throw Object.assign(Error('已取消计算'), { code: 'cancelled' });
    const r = await runBrawl({
      mapId: captured.experimental ? 'custom' : captured.mapId,
      seed: captured.seed,
      botSources: sources,
      adapterFactory: createBrowserAdapter,
      signal: job.signal,
      stage: captured.experimental ? captured.stage : null,
      seatSlots: Object.fromEntries(sides.map((id, i) => [id, i])),
      onProgress: (tick) => {
        if (tick % 5 === 0) {
          $('#compute-count').textContent = `${tick + 1} / 600`;
          $('#compute-fill').style.width = `${(tick + 1) / 6}%`;
        }
      },
    });
    r.names = Object.fromEntries(sides.map((id, i) => [id, chosen[i].name]));
    r.meta.website = {
      version: 1,
      profile: 'browser-entertainment',
      decisionBudgetMs: DECISION_BUDGET,
      label: captured.name,
      colors: clone(captured.colors),
      entrants: chosen.map(({ id, name, model, sha256, reasoningEffort }) => ({
        id,
        name,
        model,
        sha256,
        reasoningEffort,
      })),
    };
    install(r);
    status(
      captured.experimental
        ? '实验局已开场。看看它们怎么破局。'
        : '对局已开场。谁能留到最后？',
    );
  } catch (e) {
    phase = 'setup';
    renderSetup();
    status(
      e.code === 'cancelled'
        ? '已取消，可以继续布阵。'
        : `未能开场：${e.message}`,
      e.code !== 'cancelled',
    );
  } finally {
    controller = null;
    $('#loading').hidden = true;
  }
}
function install(value) {
  validateBrawlReplay(value);
  if (value.meta.website) {
    const w = value.meta.website;
    if (
      typeof w.label !== 'string' ||
      w.label.length > 60 ||
      !Array.isArray(w.entrants) ||
      w.entrants.length !== 4
    )
      throw Error('回放中的选手信息不完整。');
  }
  replay = value;
  visualEffects = prepareEffects(replay);
  phase = 'watch';
  frameIndex = 0;
  fraction = 0;
  playing = true;
  closedResult = false;
  lastHud = -1;
  eventsByTick = new Map();
  for (const e of replay.events) {
    if (!eventsByTick.has(e.tick)) eventsByTick.set(e.tick, []);
    eventsByTick.get(e.tick).push(e);
  }
  $('#scrub').max = replay.frames.length - 1;
  $('#scrub').value = 0;
  $('#result').hidden = true;
  renderSetup();
  buildEvents();
  syncPlay();
}
function eventText(e) {
  return e.text.replace(/\b[A-D]\b/g, (id) => identity(id).name);
}
function buildEvents() {
  $('#events').replaceChildren();
  eventRows = [];
  for (const e of replay.events) {
    if (
      ![
        'frag',
        'eliminated',
        'rapid',
        'repair',
        'zone',
        'timeout',
        'error',
      ].includes(e.kind)
    )
      continue;
    const li = document.createElement('li'),
      button = document.createElement('button'),
      time = document.createElement('time'),
      text = document.createElement('span');
    time.textContent = `${(e.tick / 10).toFixed(1)}s`;
    text.textContent = eventText(e);
    button.append(time, text);
    button.addEventListener('click', () => seek(e.tick));
    li.append(button);
    li.hidden = true;
    $('#events').append(li);
    eventRows.push({ li, e });
  }
}
function syncPlay() {
  $('#play').textContent = playing ? 'Ⅱ' : '▶';
  $('#play').setAttribute('aria-label', playing ? '暂停播放' : '继续播放');
}
function seek(t) {
  if (phase !== 'watch') return;
  frameIndex = Math.max(0, Math.min(replay.frames.length - 1, t));
  fraction = 0;
  playing = false;
  closedResult = false;
  lastHud = -1;
  syncPlay();
}
function toggle() {
  if (phase !== 'watch') return;
  if (frameIndex >= replay.frames.length - 1) {
    frameIndex = 0;
    fraction = 0;
    closedResult = false;
  }
  playing = !playing;
  lastHud = -1;
  syncPlay();
}
function showResult() {
  const winnerModels = [
    ...new Set(replay.winners.map((id) => identity(id).model)),
  ];
  $('#winner').textContent = replay.winners.length
    ? winnerModels.join('、') +
      (replay.winners.length > 1 ? ' 并列获胜' : ' 获胜')
    : '本场无有效胜者';
  $('#result-detail').textContent =
    `${(replay.frames.length / 10).toFixed(1)} 秒 · ${replay.reason === 'survivor' ? '生存结算' : '到时结算'}${replay.meta.stage ? ' · 实验局' : ''}`;
  $('#standings').replaceChildren();
  for (const row of replay.ranking) {
    const line = document.createElement('div');
    line.className = 'standing';
    const place = document.createElement('span'),
      name = document.createElement('span'),
      score = document.createElement('small');
    place.textContent = String(row.rank).padStart(2, '0');
    const entry = identity(row.id),
      model = document.createElement('span');
    model.className = 'standing-model';
    model.textContent = entry.model;
    const sharedModel =
      replay.ranking.filter((other) => identity(other.id).model === entry.model)
        .length > 1;
    name.append(model, workMeta(entry, sharedModel));
    name.style.color = seatColors()[sides.indexOf(row.id)];
    score.textContent = ['error', 'timeout'].includes(row.status)
      ? row.status === 'timeout'
        ? '计算超时'
        : '运行异常'
      : `${row.points} 分 / ${row.kills} 击毁`;
    line.append(place, name, score);
    $('#standings').append(line);
  }
  $('#result').hidden = closedResult;
}
function hud() {
  const f = replay.frames[frameIndex],
    ended = frameIndex === replay.frames.length - 1;
  $('#phase').textContent = ended
    ? '本场结束'
    : { skirmish: '四方争夺', collapse: '缩圈中', finale: '最后决胜' }[
        f.arena.phase
      ];
  const seconds = Math.max(0, 60 - (frameIndex + 1) / 10)
    .toFixed(1)
    .split('.');
  $('#clock').innerHTML = `${seconds[0]}<span>.${seconds[1]}</span>`;
  const format = (t) =>
    `${Math.floor(t / 600)
      .toString()
      .padStart(
        2,
        '0',
      )}:${Math.floor(t / 10) % 60 < 10 ? '0' : ''}${Math.floor(t / 10) % 60}`;
  $('#time-read').textContent =
    `${format(frameIndex + 1)} / ${format(replay.frames.length)}`;
  $('#scrub').value = frameIndex;
  for (const id of sides) {
    const t = f.tanks[id],
      sc = f.scores[id],
      card = $(`.entrant[data-side="${id}"]`);
    card.classList.toggle('out', !t.lives);
    card.querySelector('.life').textContent =
      '● '.repeat(t.lives) + '○ '.repeat(3 - t.lives);
    card.querySelector('.armor').textContent = `装甲 ${t.hp} / 2`;
    card.querySelector('.points').textContent = String(sc.points).padStart(
      2,
      '0',
    );
    card.querySelector('.intent').textContent =
      sc.status === 'timeout'
        ? '计算超时'
        : sc.status === 'error'
          ? '运行异常'
          : !t.lives
            ? '已出局'
            : !t.onField
              ? `${(t.respawnTicks / 10).toFixed(1)} 秒后复活`
              : `${intents[t.intent] || '观察战场'} · ${sc.kills} 击毁`;
  }
  for (const { li, e } of eventRows) li.hidden = e.tick > frameIndex;
  if (ended && !playing) showResult();
  else $('#result').hidden = true;
}
function backToSetup() {
  playing = false;
  phase = 'setup';
  editing = false;
  tool = 'move';
  gesture = null;
  hover = null;
  ghost = null;
  $('#result').hidden = true;
  updatePreview();
  renderSetup();
  status('回到布阵桌。可以调整地图和位置，再开一局。');
}
$('#start').addEventListener('click', start);
$('#cancel').addEventListener('click', () => controller?.abort());
$('#back-setup').addEventListener('click', backToSetup);
$('#new-round').addEventListener('click', () => {
  backToSetup();
  config.seed = newSeed();
  $('#seed').value = config.seed;
  persist();
  void start();
});
$('#play').addEventListener('click', toggle);
$('#scrub').addEventListener('input', (e) => seek(Number(e.target.value)));
$('#to-start').addEventListener('click', () => seek(0));
$('#replay').addEventListener('click', () => {
  seek(0);
  playing = true;
  syncPlay();
});
$('#close-result').addEventListener('click', () => {
  closedResult = true;
  $('#result').hidden = true;
});
$('#save-replay').addEventListener('click', () => {
  if (replay) {
    download(
      replay,
      `坦克斗蛐蛐-${replay.meta.mapId}-${replay.meta.seed}.json`,
    );
    status('回放已保存，可以随时打开重看。');
  }
});
$('#open-replay').addEventListener('click', () => $('#replay-file').click());
$('#replay-file').addEventListener('change', async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw Error('回放文件不能超过 20MB。');
    const r = JSON.parse(await file.text());
    install(r);
    status('已打开本地回放。');
  } catch (error) {
    status(`无法打开：${error.message}`, true);
  } finally {
    e.target.value = '';
  }
});
$('#sound').addEventListener('click', async () => {
  try {
    const on = await audio.toggle();
    $('#sound').textContent = on ? '音效开' : '音效关';
    $('#sound').setAttribute('aria-pressed', String(on));
  } catch {
    status('浏览器暂时不能播放音效。', true);
  }
});
function showRules() {
  playing = false;
  syncPlay();
  $('#help-dialog').showModal();
}
const tour = createTour({
  isWatching: () => phase === 'watch',
  pause: () => {
    playing = false;
    syncPlay();
  },
  rules: showRules,
  setup: [
    {
      target: '#maps',
      title: '先挑一片战场。',
      text: '三张基底地图各有地形。点缩略图即可切换；每次重选都会恢复这张地图与出生位置，已经挑好的选手和颜色会保留。',
    },
    {
      target: '#open-library',
      title: '把选手请进来。',
      text: '战场一开始没有坦克。打开坦克库，搜索模型或程序名称，依次加入四个席位。一份程序只能占一个席位，随时可以换人或移出。',
    },
    {
      target: () => `.entrant[data-side="${selected}"] .seat-color`,
      title: '认准你的颜色。',
      text: '点击席位下方的颜色，给坦克换身涂装。车身、子弹、选手卡和回放都会使用这个颜色；选到已占用的颜色时，两席会交换。',
    },
    {
      target: '#board',
      title: '位置，也由你安排。',
      text: '选手入场后可以直接拖动坦克。手机先点右侧选手，再点地图；转向按钮或键盘 R 可调整朝向。车身需要完整的 2 × 2 空地，不能叠在另一辆车上。',
    },
    {
      target: () => (editing ? '#editor' : '#edit-map'),
      title: '出一道自己的难题。',
      text: '自己画地图是实验功能。砖墙、钢墙、河道、草地任你布置，也可以开启对称画笔。画错可撤销一步；撤销全部会回到当前基底战场。',
    },
    {
      target: '#start',
      title: '四方就绪，好戏开场。',
      text: '挑满四位选手，按钮就会亮起。点击后浏览器先算完整场，再自动播放；观战时可以暂停、拖动进度、调倍速，并保存这场回放。',
    },
  ],
  watching: [
    {
      target: '#transport',
      title: '这一场，由你掌镜。',
      text: '暂停后拖动进度条，或用左右方向键逐帧查看。右侧可以调倍速；空格继续播放。',
    },
    {
      target: '#roster',
      title: '看看谁还在场。',
      text: '圆点是剩余生命，装甲和积分来自当前时刻的真实战况。左侧交锋记录可以点击，跳到对应瞬间。',
    },
    {
      target: '#save-replay',
      title: '把这场好戏留下。',
      text: '保存回放后，可以随时用页脚的打开回放重新观看，不必再次计算。选手、配色、自绘地图和出生位置都会保留。',
    },
  ],
});
$('#help').addEventListener('click', () => tour.start());
$('#empty-guide').addEventListener('click', () => tour.start());
$('#rules').addEventListener('click', showRules);
$('#close-help').addEventListener('click', () => $('#help-dialog').close());
$('.brand').addEventListener('click', (e) => {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  controller?.abort();
  playing = false;
  if (window.PlaygroundEntry) window.PlaygroundEntry.navigate('/#play', true);
  else location.assign('/#play');
});
window.addEventListener('keydown', (e) => {
  if (
    document.querySelector('dialog[open]') ||
    ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)
  )
    return;
  if (e.code === 'Escape') {
    if (controller) controller.abort();
    else if (phase === 'watch') {
      closedResult = true;
      $('#result').hidden = true;
    }
    return;
  }
  if (phase === 'watch') {
    if (e.code === 'Space') {
      e.preventDefault();
      toggle();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seek(frameIndex - (e.shiftKey ? 10 : 1));
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      seek(frameIndex + (e.shiftKey ? 10 : 1));
    } else if (e.code === 'Home') {
      e.preventDefault();
      seek(0);
    } else if (e.code === 'End') {
      e.preventDefault();
      seek(replay.frames.length - 1);
    }
    return;
  }
  if (phase !== 'setup' || e.target !== board) return;
  if (e.code === 'KeyR') {
    e.preventDefault();
    rotate();
    return;
  }
  const d = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[e.code];
  if (d) {
    e.preventDefault();
    const p = config.stage.spawns[selected];
    tryMove(selected, { ...p, x: p.x + d[0], y: p.y + d[1] });
  }
});
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.15);
  lastTime = time;
  if (phase === 'watch' && replay) {
    const before = frameIndex;
    if (playing) {
      fraction += dt * 10 * Number($('#speed').value);
      while (fraction >= 1) {
        fraction--;
        if (frameIndex < replay.frames.length - 1) frameIndex++;
        else {
          playing = false;
          fraction = 0;
          syncPlay();
          lastHud = -1;
          break;
        }
      }
    }
    if (playing && frameIndex !== before)
      for (let t = before + 1; t <= frameIndex; t++)
        audio.play(eventsByTick.get(t) || []);
    if (lastHud !== frameIndex) {
      hud();
      lastHud = frameIndex;
    }
    renderer.draw(replay.frames[frameIndex], {
      next: replay.frames[frameIndex + 1],
      blend: fraction,
      events: recentEffects(visualEffects, frameIndex + fraction),
      reduced: motion.matches,
      colors: seatColors(),
      theme,
    });
  } else if (preview)
    renderer.draw(preview, {
      theme,
      colors: seatColors(),
      editing: true,
      selected,
      hover,
      ghost,
    });
  raf = requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    playing = false;
    syncPlay();
  }
  lastTime = performance.now();
});
window.addEventListener('pagehide', () => {
  controller?.abort();
  cancelAnimationFrame(raf);
  playing = false;
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }
});
updatePreview();
renderSetup();
renderPalette();
persist();
raf = requestAnimationFrame(loop);
window.PlaygroundEntry?.ready();
