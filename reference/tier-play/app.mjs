import { TIERS, newBoard, validBoard, moveCard } from './state.mjs';
import {
  readTierRound,
  readTierIdentities,
  readTierTopics,
  tierConfig,
} from './catalog-access.mjs';

const $ = (selector) => document.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = tierConfig().storageKey || 'aob-tier-demo-v1';
const themeKey = tierConfig().themeKey || 'aob-tier-demo-theme';
const zoomIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>';
let data,
  board,
  ids,
  order,
  identities = {},
  history = [],
  selected = null,
  drag = null,
  revealing = false,
  changing = false,
  exporting = false,
  topics = [];
let current = null,
  frame = null,
  frameRevision = 0,
  loadTimer = null,
  viewerReturn = null,
  viewerMotion = null,
  viewerEpoch = 0,
  closing = null;
const cards = new Map();
const announce = (text) => {
  $('#announcement').textContent = text;
};
const shuffled = (values) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const letter = (id) => String.fromCharCode(65 + order.indexOf(id));
const work = (id) => data.works.find((item) => item.id === id);
function save() {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ topic: data.topicId, board, order }),
    );
  } catch {
    /* Session storage is optional. */
  }
}
function animateMove(before) {
  if (reduced.matches) return;
  for (const [id, card] of cards) {
    const old = before.get(id),
      now = card.getBoundingClientRect();
    if (
      old &&
      now.width &&
      Math.abs(old.x - now.x) + Math.abs(old.y - now.y) > 2
    ) {
      card.animate(
        [
          {
            transform: `translate(${old.x - now.x}px,${old.y - now.y}px) scale(${old.width / now.width},${old.height / now.height})`,
          },
          { transform: 'none' },
        ],
        { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
  }
}
function render({ motion = false } = {}) {
  const before = motion
    ? new Map(
        [...cards].map(([id, card]) => [id, card.getBoundingClientRect()]),
      )
    : new Map();
  document.body.dataset.revealed = String(board.revealed);
  for (const [index, row] of board.rows.entries()) {
    const zone = $(`[data-zone="${index}"]`);
    zone.replaceChildren(...row.map((id) => cards.get(id)));
    if (!row.length) {
      const hint = document.createElement('span');
      hint.className = 'drop-hint';
      hint.textContent = index === 0 ? '' : '—';
      zone.append(hint);
    }
  }
  $('#tray').replaceChildren(...board.tray.map((id) => cards.get(id)));
  for (const [id, card] of cards) {
    card.classList.toggle('is-selected', selected === id);
    card.setAttribute('aria-pressed', String(selected === id));
    card.setAttribute(
      'aria-label',
      board.revealed
        ? `${identities[id]?.model || '署名加载中'}，按回车回看作品`
        : `匿名作品 ${letter(id)}，点击放大，拖动排档，空格选中`,
    );
    const name = card.querySelector('.card-name');
    name.textContent = board.revealed
      ? identities[id]?.model || '署名加载中'
      : '匿名作品';
    name.title = name.textContent;
    card.querySelector('.mini-frame').hidden = board.revealed;
    card.querySelector('.model-face').hidden = !board.revealed;
    card.querySelector('.card-letter').hidden = board.revealed;
    card.querySelector('.card-zoom').hidden = board.revealed;
  }
  const count = ids.length - board.tray.length;
  $('#count').textContent =
    `${String(count).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}`;
  $('#shelf-title').textContent = board.revealed ? '已揭晓' : '候场区';
  $('#shelf-note').textContent = board.revealed
    ? '这张榜，凭你的喜欢。'
    : `${board.tray.length} 件作品，尚未署名。`;
  $('#reveal').disabled = Boolean(
    board.tray.length || board.revealed || revealing || changing,
  );
  $('#reveal span').textContent = revealing
    ? '正在揭晓'
    : board.revealed
      ? '署名已揭晓'
      : '揭晓模型';
  $('#undo').disabled =
    !history.length || board.revealed || revealing || changing;
  $('#restart').disabled = revealing || changing || exporting;
  $('#change-topic').disabled = revealing || changing || exporting;
  $('#change-topic').textContent = changing ? '正在准备…' : '⤨ 换个题目';
  $('#export').hidden = !board.revealed;
  $('#export').disabled = revealing || changing || exporting;
  $('#status').textContent = board.revealed
    ? `${data.topic} · 偏好榜`
    : selected
      ? `作品 ${letter(selected)} 已选中，点一个档位放进去。`
      : board.tray.length
        ? '拖动排档，点作品放大看。'
        : '还可以换位置，满意了就揭晓。';
  $$('.tier-label').forEach((button) => {
    button.disabled = board.revealed;
  });
  updateQuickTiers();
  save();
  animateMove(before);
}
function $$(selector) {
  return [...document.querySelectorAll(selector)];
}
function place(id, target, before = null) {
  if (revealing || changing) return;
  const next = moveCard(board, id, target, before);
  if (next === board) return;
  history.push(structuredClone(board));
  board = next;
  selected = null;
  render({ motion: true });
  announce(
    `作品 ${letter(id)} 已放入${target === 'tray' ? '候场区' : TIERS[target]}`,
  );
}
function selectCard(id) {
  if (revealing || changing) return;
  if (board.revealed) {
    openViewer(id);
    return;
  }
  selected = selected === id ? null : id;
  render();
}
function makeCard(item) {
  const card = document.createElement('div');
  card.className = `work-card${data.kind === 'text' ? ' text-card' : ''}`;
  card.dataset.id = item.id;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const rim = document.createElement('div');
  rim.className = 'mini-frame';
  if (data.kind === 'text') {
    const heading = document.createElement('span');
    heading.className = 'excerpt-kind';
    heading.textContent =
      {
        forum: '回帖',
        chat: '消息',
        orange: '吆喝',
        letter: '来信',
        forest: '故事',
        channels: '三种口吻',
        blackout: '故事',
        waiting: '故事',
      }[data.skin] || '节选';
    const excerpt = document.createElement('p');
    excerpt.className = 'text-excerpt';
    const opening = ['forum', 'orange', 'letter'].includes(data.skin)
      ? item.paragraphs.find((p) => p.trim())
      : item.paragraphs.find(
          (p) => p.trim().length > 20 && !/^【[^】]+】$/.test(p.trim()),
        ) || item.paragraphs[0];
    excerpt.textContent = opening.replace(/^#+\s*|\*\*/g, '').slice(0, 110);
    rim.append(heading, excerpt);
  } else {
    const image = document.createElement('img');
    image.src = item.poster;
    image.alt = '';
    image.draggable = false;
    rim.append(image);
  }
  const modelFace = document.createElement('div');
  modelFace.className = 'model-face';
  modelFace.hidden = true;
  const logo = document.createElement('img');
  logo.className = 'model-logo';
  logo.alt = '';
  logo.draggable = false;
  modelFace.append(logo);
  const zoom = document.createElement('button');
  zoom.className = 'card-zoom';
  zoom.innerHTML = zoomIcon + '<span>放大看</span>';
  zoom.setAttribute('aria-label', `放大作品 ${letter(item.id)}`);
  zoom.title = '放大看看';
  zoom.addEventListener('pointerdown', (event) => event.stopPropagation());
  zoom.addEventListener('click', (event) => {
    event.stopPropagation();
    openViewer(item.id, zoom);
  });
  const label = document.createElement('div');
  label.className = 'card-label';
  const code = document.createElement('span');
  code.className = 'card-letter';
  code.textContent = letter(item.id);
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = '匿名作品';
  label.append(code, name);
  card.append(rim, modelFace, zoom, label);
  card.addEventListener('pointerdown', (event) => startDrag(event, item.id));
  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      openViewer(item.id, card);
    } else if (event.key === ' ') {
      event.preventDefault();
      selectCard(item.id);
    } else if (/^[1-5]$/.test(event.key) && !board.revealed) {
      event.preventDefault();
      place(item.id, Number(event.key) - 1);
      card.focus();
    } else if (event.key === 'Escape') {
      selected = null;
      render();
    }
  });
  // AT-generated clicks do not have a pointer sequence.
  card.addEventListener('click', (event) => {
    if (event.detail === 0 && event.target === card) openViewer(item.id, card);
  });
  return card;
}
function startDrag(event, id) {
  if (event.button !== 0 || revealing || changing) return;
  if (board.revealed) {
    openViewer(id, cards.get(id));
    return;
  }
  if (drag) finishDrag(false);
  const card = cards.get(id),
    rect = card.getBoundingClientRect();
  drag = {
    id,
    pointer: event.pointerId,
    card,
    x: event.clientX,
    y: event.clientY,
    dx: event.clientX - rect.x,
    dy: event.clientY - rect.y,
    rect,
    active: false,
    zone: null,
    before: null,
  };
  card.setPointerCapture(event.pointerId);
}
function trackDrag(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (
    !drag.active &&
    Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6
  )
    return;
  event.preventDefault();
  if (!drag.active) {
    drag.active = true;
    const ghost = drag.card.cloneNode(true);
    ghost.classList.remove('is-selected');
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('role');
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${Math.max(122, drag.rect.width)}px`;
    document.body.append(ghost);
    drag.ghost = ghost;
    drag.card.classList.add('is-dragging');
    document.body.classList.add('drag-active');
  }
  drag.ghost.style.left = `${event.clientX - drag.dx}px`;
  drag.ghost.style.top = `${event.clientY - drag.dy}px`;
  $$('.is-over').forEach((node) => node.classList.remove('is-over'));
  $$('.insert-before').forEach((node) =>
    node.classList.remove('insert-before'),
  );
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const zone =
    hit?.closest('[data-zone]') ||
    hit?.closest('.tier-row')?.querySelector('[data-zone]');
  drag.zone = zone?.dataset.zone ?? null;
  drag.before = null;
  if (zone) {
    zone.classList.add('is-over');
    const r = zone.getBoundingClientRect();
    const rack = getComputedStyle(zone).display === 'grid';
    if (rack) {
      if (event.clientY > r.bottom - 38) zone.scrollTop += 16;
      if (event.clientY < r.top + 38) zone.scrollTop -= 16;
    } else {
      if (event.clientX > r.right - 38) zone.scrollLeft += 16;
      if (event.clientX < r.left + 38) zone.scrollLeft -= 16;
    }
    const children = [...zone.querySelectorAll('.work-card')].filter(
      (card) => card !== drag.card,
    );
    const before = children.find((card) => {
      const rect = card.getBoundingClientRect();
      if (rack) {
        if (event.clientY < rect.top) return true;
        if (event.clientY > rect.bottom) return false;
      }
      return event.clientX < rect.x + rect.width / 2;
    });
    if (before) {
      drag.before = before.dataset.id;
      before.classList.add('insert-before');
    }
  }
}
function finishDrag(commit = true) {
  if (!drag) return;
  const finished = drag;
  drag = null;
  if (finished.card.hasPointerCapture(finished.pointer))
    finished.card.releasePointerCapture(finished.pointer);
  finished.ghost?.remove();
  finished.card.classList.remove('is-dragging');
  document.body.classList.remove('drag-active');
  $$('.is-over,.insert-before').forEach((node) =>
    node.classList.remove('is-over', 'insert-before'),
  );
  if (commit && finished.active && finished.zone !== null)
    place(finished.id, finished.zone, finished.before);
  else if (commit && !finished.active) openViewer(finished.id, finished.card);
}
addEventListener('pointermove', trackDrag, { passive: false });
addEventListener('pointerup', (event) => {
  if (drag?.pointer === event.pointerId) finishDrag();
});
addEventListener('pointercancel', () => finishDrag(false));
addEventListener('blur', () => finishDrag(false));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drag) {
    event.preventDefault();
    finishDrag(false);
  }
});

function updateQuickTiers() {
  if (!current) return;
  $$('#quick-tiers button').forEach((button, index) => {
    button.setAttribute(
      'aria-pressed',
      String(board.rows[index].includes(current)),
    );
    button.disabled = board.revealed;
  });
}
function teardownFrame() {
  frameRevision++;
  clearTimeout(loadTimer);
  frame?.remove();
  frame = null;
  $('#scene').dataset.ready = 'false';
  $('#scene').dataset.live = 'false';
  $('#reset-view').disabled = true;
}
function cardTransform(id) {
  const card = cards.get(id),
    dialog = $('#viewer');
  const target = card?.getBoundingClientRect(),
    box = dialog.getBoundingClientRect();
  // Use one scale on both axes: a scene never squashes while being brought closer.
  if (!target?.width || target.bottom < 0 || target.top > innerHeight)
    return 'scale(.96)';
  const scale = Math.max(
    0.08,
    Math.min(target.width / box.width, target.height / box.height),
  );
  return `translate(${target.x + target.width / 2 - box.x - box.width / 2}px,${target.y + target.height / 2 - box.y - box.height / 2}px) scale(${scale})`;
}
function openViewer(id, trigger) {
  if (!id || changing || revealing) return;
  finishDrag(false);
  const dialog = $('#viewer'),
    opening = !dialog.open;
  viewerEpoch++;
  viewerMotion?.cancel();
  viewerMotion = null;
  closing = null;
  dialog.dataset.closing = 'false';
  current = id;
  if (opening) {
    viewerReturn = trigger || cards.get(id);
    dialog.showModal();
  }
  $('#viewer-letter').textContent = letter(id);
  $('#viewer-title').textContent = board.revealed
    ? identities[id].model
    : '匿名作品';
  $('#viewer-index').textContent = `${order.indexOf(id) + 1} / ${ids.length}`;
  $('#load-text').textContent = '把作品拿近一点…';
  $('#retry').hidden = true;
  teardownFrame();
  updateQuickTiers();
  dialog.dataset.kind = data.kind;
  dialog.dataset.length =
    data.kind === 'text' &&
    ['forum', 'orange', 'letter', 'waiting'].includes(data.skin)
      ? 'short'
      : 'long';
  $('#scene').dataset.kind = data.kind;
  $('#scene').dataset.skin = data.skin || '';
  $('#text-reader').hidden = data.kind !== 'text';
  $('#reset-view').hidden = data.kind === 'text';
  $('#viewer-hint').textContent =
    data.kind === 'text'
      ? '读完直接排档 · 左右切换作品'
      : '拖动旋转 · 滚轮缩放';
  if (opening && !reduced.matches) {
    viewerMotion = dialog.animate(
      [
        { transform: cardTransform(id), opacity: 0.25 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
    viewerMotion.finished.catch(() => {});
  }
  if (data.kind === 'text') {
    $('#text-context').textContent = data.context || data.topic;
    const paragraphs = work(id).paragraphs.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      if (/^【[^】]+】$/.test(text.trim()) || /^#{1,3} /.test(text.trim()))
        p.className = 'story-heading';
      return p;
    });
    $('#text-story').replaceChildren(...paragraphs);
    $('#text-reader').scrollTop = 0;
    $('#scene').dataset.ready = 'true';
  } else {
    $('#scene-poster').src = work(id).poster;
    const revision = frameRevision;
    frame = document.createElement('iframe');
    frame.title = `作品 ${letter(id)} 的 3D 预览`;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.referrerPolicy = 'no-referrer';
    frame.src = work(id).src;
    $('#frame-mount').append(frame);
    loadTimer = setTimeout(() => {
      if (revision !== frameRevision || $('#scene').dataset.ready === 'true')
        return;
      $('#load-text').textContent = '作品还没准备好，可以重试，或先看下一件。';
      $('#retry').hidden = false;
    }, 22000);
  }
  if (!opening && !reduced.matches)
    $('#scene').animate(
      [
        { opacity: 0.5, transform: 'translateX(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: 'ease-out' },
    );
  if (opening) $('#close-viewer').focus();
}
function closeViewer() {
  const dialog = $('#viewer');
  if (!dialog.open) return Promise.resolve();
  if (closing) return closing;
  const epoch = ++viewerEpoch;
  viewerMotion?.cancel();
  dialog.dataset.closing = 'true';
  teardownFrame();
  cards
    .get(current)
    ?.getAnimations()
    .forEach((animation) => animation.cancel());
  const transform = cardTransform(current);
  closing = (async () => {
    if (!reduced.matches) {
      viewerMotion = dialog.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform, opacity: 0 },
        ],
        { duration: 220, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' },
      );
      await viewerMotion.finished.catch(() => {});
    }
    if (epoch !== viewerEpoch) return;
    dialog.close();
    viewerMotion?.cancel();
    viewerMotion = null;
    closing = null;
  })();
  return closing;
}
let readyBits = {};
addEventListener('message', (event) => {
  if (
    !current ||
    !frame ||
    event.source !== frame.contentWindow ||
    event.origin !== new URL(work(current).src).origin
  )
    return;
  if (readyBits.revision !== frameRevision)
    readyBits = { revision: frameRevision };
  if (event.data === 'tier:work-ready') readyBits.loaded = true;
  if (event.data?.stage === 'work-ready') readyBits.loaded = true;
  if (event.data?.stage === 'rendered') readyBits.rendered = true;
  if (event.data?.stage === 'camera-ready') {
    readyBits.camera = true;
    $('#reset-view').disabled = event.data.available === false;
  }
  if (
    readyBits.loaded &&
    readyBits.rendered &&
    readyBits.camera &&
    $('#scene').dataset.ready !== 'true'
  ) {
    $('#scene').dataset.ready = 'true';
    clearTimeout(loadTimer);
    const revision = frameRevision;
    requestAnimationFrame(async () => {
      await Promise.all(
        $('#frame-mount')
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      );
      if (revision === frameRevision && frame)
        $('#scene').dataset.live = 'true';
    });
  }
});
function post(stage, extra = {}) {
  if (frame && current)
    frame.contentWindow?.postMessage(
      { stage, ...extra },
      new URL(work(current).src).origin,
    );
}
$('#close-viewer').addEventListener('click', closeViewer);
$('#viewer').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeViewer();
});
$('#viewer').addEventListener('close', () => {
  teardownFrame();
  current = null;
  viewerReturn?.focus({ preventScroll: true });
});
$('#viewer').addEventListener('click', (event) => {
  if (event.target !== $('#viewer')) return;
  const r = $('#viewer').getBoundingClientRect();
  if (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
    closeViewer();
});
$('#viewer').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    openViewer(
      order[
        (order.indexOf(current) +
          (event.key === 'ArrowLeft' ? -1 : 1) +
          ids.length) %
          ids.length
      ],
    );
  }
});
$('#retry').addEventListener('click', () => openViewer(current));
$('#reset-view').addEventListener('click', () => post('reset'));
for (const [selector, direction] of [
  ['#prev-work', -1],
  ['#next-work', 1],
])
  $(selector).addEventListener('click', () =>
    openViewer(
      order[(order.indexOf(current) + direction + ids.length) % ids.length],
    ),
  );
document.addEventListener('visibilitychange', () =>
  post('active', { value: !document.hidden }),
);
for (const [index, tier] of TIERS.entries()) {
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.dataset.tier = index;
  const label = document.createElement('button');
  label.className = 'tier-label';
  label.textContent = tier;
  label.setAttribute('aria-label', `放入${tier}档`);
  label.addEventListener('click', () => {
    if (selected) place(selected, index);
    else announce('先选中一件作品，再点击档位。');
  });
  const zone = document.createElement('div');
  zone.className = 'row-cards dropzone';
  zone.dataset.zone = index;
  zone.setAttribute('role', 'group');
  zone.setAttribute('aria-label', `${tier}档`);
  zone.addEventListener('click', (event) => {
    if (selected && !event.target.closest('.work-card')) place(selected, index);
  });
  row.append(label, zone);
  $('#ranking').append(row);
  const quick = document.createElement('button');
  quick.textContent = tier;
  quick.addEventListener('click', () => {
    if (current) place(current, index);
  });
  $('#quick-tiers').append(quick);
}
$('#tray').addEventListener('click', (event) => {
  if (selected && !event.target.closest('.work-card')) place(selected, 'tray');
});
for (const [selector, direction] of [
  ['#shelf-prev', -1],
  ['#shelf-next', 1],
])
  $(selector).addEventListener('click', () => {
    $('#tray').scrollBy({
      left: direction * 230,
      behavior: reduced.matches ? 'auto' : 'smooth',
    });
  });
$('#undo').addEventListener('click', () => {
  if (history.length && !board.revealed) {
    board = history.pop();
    selected = null;
    render({ motion: true });
    announce('已撤销上一步');
  }
});
$('#restart').addEventListener('click', () => $('#confirm-reset').showModal());
$('#keep-board').addEventListener('click', () => $('#confirm-reset').close());
$('#clear-board').addEventListener('click', () => {
  board = newBoard(order);
  history = [];
  selected = null;
  $('#confirm-reset').close();
  render({ motion: true });
  announce('已清空档位，可以重新排');
});
async function loadIdentities() {
  const names = await readTierIdentities(data.topicId);
  if (ids.some((id) => !names[id]?.model || !names[id]?.logo))
    throw Error('模型信息不完整');
  // Prepare the reverse face before turning the cards; a failed asset leaves sorting intact.
  await Promise.all(
    ids.map(async (id) => {
      const logo = cards.get(id).querySelector('.model-logo');
      logo.src = names[id].logo;
      await logo.decode();
    }),
  ).catch(() => {
    throw Error('模型 Logo 暂时无法加载');
  });
  identities = names;
}
async function revealModels() {
  const ranked = board.rows.flat().map((id) => cards.get(id));
  const turn = (from, to, duration) =>
    ranked.map((card) =>
      card.animate(
        [
          { transform: `perspective(700px) rotateY(${from}deg)` },
          { transform: `perspective(700px) rotateY(${to}deg)` },
        ],
        { duration, easing: 'cubic-bezier(.3,.65,.3,1)', fill: 'both' },
      ),
    );
  let animations = reduced.matches ? [] : turn(0, 90, 170);
  await Promise.all(animations.map((a) => a.finished));
  board.revealed = true;
  history = [];
  render();
  animations.forEach((a) => a.cancel());
  animations = reduced.matches ? [] : turn(-90, 0, 240);
  await Promise.all(animations.map((a) => a.finished));
  animations.forEach((a) => a.cancel());
}
$('#reveal').addEventListener('click', async () => {
  if (board.tray.length || board.revealed || revealing || changing) return;
  revealing = true;
  finishDrag(false);
  selected = null;
  render();
  try {
    await loadIdentities();
    await revealModels();
    announce('模型榜单已揭晓，档位和顺序保持不变。');
  } catch (error) {
    $('#status').textContent = `${error.message}，请再试一次。`;
    announce(error.message);
  } finally {
    revealing = false;
    $('#export').disabled = false;
    $('#restart').disabled = false;
    $('#change-topic').disabled = false;
    $('#reveal').disabled = board.revealed;
    $('#reveal span').textContent = board.revealed ? '署名已揭晓' : '重试揭晓';
  }
});
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme span').textContent = theme === 'paper' ? '纸面' : '墨色';
  $('#theme').setAttribute(
    'aria-label',
    theme === 'paper' ? '切换为暗色' : '切换为浅色',
  );
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    /* Optional preference. */
  }
}
try {
  const preference = localStorage.getItem(themeKey);
  setTheme(
    preference === 'ink' ||
      (preference === 'system' &&
        matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'ink'
      : 'paper',
  );
} catch {
  setTheme('paper');
}
$('#theme').addEventListener('click', () =>
  setTheme(
    document.documentElement.dataset.theme === 'paper' ? 'ink' : 'paper',
  ),
);

$('#export').addEventListener('click', async () => {
  if (!board.revealed || changing || revealing || exporting) return;
  exporting = true;
  $('#change-topic').disabled = true;
  $('#restart').disabled = true;
  $('#export').disabled = true;
  try {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    const widths = 114,
      heights = board.rows.map(
        (row) => Math.max(1, Math.ceil(row.length / 8)) * 150 + 10,
      );
    canvas.height = 225 + heights.reduce((sum, h) => sum + h, 0);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f2f0e7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#354438';
    ctx.font = '500 49px MiSans, sans-serif';
    ctx.fillText(`${data.topic} · 偏好榜`, 50, 80);
    ctx.fillStyle = '#7b8173';
    ctx.font = '22px MiSans, sans-serif';
    ctx.fillText(`${ids.length} 件作品 · 匿名排序后揭晓`, 52, 122);
    let y = 160;
    const colors = ['#b76a52', '#c99a60', '#d3c887', '#a9b798', '#93aaa8'];
    for (const [tier, row] of board.rows.entries()) {
      const height = heights[tier];
      ctx.fillStyle = colors[tier];
      ctx.fillRect(50, y, 230, height);
      ctx.fillStyle = tier === 0 ? '#fff9ec' : '#354438';
      ctx.font = '500 36px MiSans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(TIERS[tier], 165, y + height / 2 + 12);
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#d1d3c4';
      ctx.strokeRect(280, y, 1270, height);
      for (const [index, id] of row.entries()) {
        const x = 300 + (index % 8) * 130,
          top = y + 23 + Math.floor(index / 8) * 150;
        const image = cards.get(id).querySelector('.model-logo');
        ctx.fillStyle = '#fffdf5';
        ctx.beginPath();
        ctx.roundRect(x, top, widths, widths, 7);
        ctx.fill();
        ctx.stroke();
        const scale = Math.min(
          62 / image.naturalWidth,
          62 / image.naturalHeight,
        );
        ctx.drawImage(
          image,
          x + (widths - image.naturalWidth * scale) / 2,
          top + 5 + (68 - image.naturalHeight * scale) / 2,
          image.naturalWidth * scale,
          image.naturalHeight * scale,
        );
        ctx.fillStyle = '#354438';
        ctx.font = '14px MiSans, sans-serif';
        ctx.textAlign = 'center';
        const lines = [];
        let line = '';
        for (const word of identities[id].model.split(' ')) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(candidate).width > widths - 12) {
            lines.push(line);
            line = word;
          } else line = candidate;
        }
        lines.push(line);
        lines.forEach((line, n) =>
          ctx.fillText(
            line,
            x + widths / 2,
            top + (lines.length === 1 ? 103 : 92) + n * 16,
          ),
        );
        ctx.textAlign = 'left';
      }
      y += height;
    }
    ctx.fillStyle = '#7b8173';
    ctx.font = '17px MiSans, sans-serif';
    ctx.fillText(
      'ARENA OF BIAS   /   野榜制造 · 个人喜好',
      50,
      canvas.height - 24,
    );
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw Error('图片生成失败');
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `${data.topic}-偏好榜.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    announce('榜单图片已生成');
  } catch {
    announce('图片暂时生成失败，请重试');
    $('#status').textContent = '图片暂时生成失败，请重试。';
  } finally {
    exporting = false;
    $('#export').disabled = false;
    $('#change-topic').disabled = false;
    $('#restart').disabled = false;
  }
});

async function fetchRound(topic) {
  const round = await readTierRound(topic || '004');
  if (!round.works?.length || !['scene', 'text'].includes(round.kind))
    throw Error('作品清单不完整');
  if (round.kind === 'scene')
    await Promise.all(
      round.works.map(async (item) => {
        const poster = new Image();
        poster.src = item.poster;
        let timeout;
        try {
          await Promise.race([
            poster.decode(),
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(Error('作品预览还没准备好')),
                12000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
  return round;
}
function mountRound(round, saved) {
  data = round;
  ids = data.works.map((item) => item.id);
  order = shuffled(ids);
  board = newBoard(order);
  if (
    (saved?.topic || '004') === data.topicId &&
    validBoard(saved?.board, ids) &&
    Array.isArray(saved.order) &&
    saved.order.length === ids.length &&
    new Set(saved.order).size === ids.length &&
    saved.order.every((id) => ids.includes(id))
  ) {
    board = saved.board;
    order = saved.order;
  }
  history = [];
  identities = {};
  selected = null;
  cards.clear();
  for (const item of data.works) cards.set(item.id, makeCard(item));
  $('#topic').textContent = data.topic;
  $('#topic-context').hidden = data.kind !== 'text';
  $('#topic-context').textContent = data.context || '';
  $('#show-prompt').hidden = !data.prompt;
  $('#prompt-title').textContent = data.topic;
  $('#prompt-body').textContent = data.prompt || '';
  document.body.dataset.kind = data.kind;
  document.body.dataset.skin = data.skin || '';
  $('#tray').scrollLeft = 0;
  $('#tray').scrollTop = 0;
  $$('.row-cards').forEach((zone) => {
    zone.scrollLeft = 0;
  });
}
$('#show-prompt').addEventListener('click', () =>
  $('#prompt-dialog').showModal(),
);
$('#close-prompt').addEventListener('click', () => $('#prompt-dialog').close());
$('#prompt-dialog').addEventListener('click', (event) => {
  if (event.target === $('#prompt-dialog')) $('#prompt-dialog').close();
});
$('#change-topic').addEventListener('click', async () => {
  if (changing || revealing || exporting) return;
  changing = true;
  finishDrag(false);
  render();
  let failed = false;
  try {
    // The availability index is only needed after the player asks for another topic.
    if (!topics.length) topics = await readTierTopics();
    const pool = topics.filter((t) => t.id !== data.topicId);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) throw Error('暂时没有其他公开题目');
    const round = await fetchRound(next.id);
    await closeViewer();
    mountRound(round);
    const url = new URL(location.href);
    url.searchParams.set('topic', data.topicId);
    window.history.replaceState(null, '', url);
    render();
    if (!reduced.matches)
      $('.game').animate(
        [
          { opacity: 0.4, transform: 'translateY(5px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 220, easing: 'ease-out' },
      );
    announce(`换到${data.topic}，${ids.length} 件匿名作品可以重新排档。`);
  } catch {
    failed = true;
    announce('换题失败，原来的榜单已保留。');
  } finally {
    changing = false;
    render();
    if (failed)
      $('#status').textContent = '这组作品暂时没准备好，原来的榜单还在。';
  }
});
async function start() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(storageKey));
  } catch {
    /* Optional session. */
  }
  const requested =
    new URL(location.href).searchParams.get('topic') || saved?.topic || '004';
  const round = await fetchRound(requested);
  mountRound(round, saved);
  if (board.revealed) await loadIdentities();
  render();
  $('.desk').dataset.entered = 'true';
  window.PlaygroundEntry?.ready();
}
start().catch((error) => {
  $('#tray').textContent = error.message;
  $('#status').textContent = '刷新页面再试一次。';
  $('.desk').dataset.entered = 'true';
  window.PlaygroundEntry?.ready();
});
