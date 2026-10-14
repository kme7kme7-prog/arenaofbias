import './inspect.css';
import { createInspectState, hitTank } from './inspect-state.mjs';

export function createTankInspector({ canvas, host = canvas.parentElement, onSelect = () => {} }) {
  const state = createInspectState();
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
  const card = document.createElement('section');
  card.className = 'tank-inspector'; card.inert = true;
  card.setAttribute('aria-label', '坦克信息');
  card.innerHTML = `<div class="ti-top"><span class="ti-seat"></span><span class="ti-mode">坦克信息</span><button class="ti-pin" aria-label="固定坦克信息" aria-pressed="false">固定</button><button class="ti-fold" aria-label="收起坦克信息" aria-expanded="true"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 10 4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="ti-close" aria-label="关闭坦克信息">×</button></div><div class="ti-identity"><img alt=""><div><strong></strong><small class="ti-work"></small><small class="ti-summary"></small></div></div><div class="ti-details"><div><div class="ti-stats"></div><p class="ti-status"></p></div></div>`;
  host.append(card);
  const $ = s => card.querySelector(s);
  let items = [], point = null, pressed = null, hovering = false, active = false, visibleId = null, signature = '', pulse = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    return hitTank(items, { x: (e.clientX - rect.left) / rect.width * grid, y: (e.clientY - rect.top) / rect.height * grid }, Math.min(.6, 7 / rect.width * grid));
  }
  let grid = 26;
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') point = { clientX: e.clientX, clientY: e.clientY }; });
  canvas.addEventListener('pointerleave', () => { point = null; state.hover(null, performance.now()); });
  canvas.addEventListener('pointerdown', e => { if (active && e.button === 0) pressed = { id: pick(e), x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!active || !pressed) return;
    if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 12) {
      const id = pressed.id || pick(e);
      if (id) select(id); else state.close();
    }
    pressed = null;
  });
  canvas.addEventListener('pointercancel', () => { pressed = null; });
  card.addEventListener('pointerenter', () => { hovering = true; });
  card.addEventListener('pointerleave', () => { hovering = false; });
  $('.ti-pin').onclick = () => { state.pinned = !state.pinned; state.until = performance.now() + 2800; };
  $('.ti-fold').onclick = () => { state.collapsed = !state.collapsed; state.pinned = true; };
  $('.ti-close').onclick = () => { state.close(); canvas.focus({ preventScroll: true }); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.id && !document.querySelector('dialog[open]')) { state.close(); canvas.focus({ preventScroll: true }); } });
  function select(id) { if (active && items.some(t => t.id === id)) { state.select(id, performance.now()); onSelect(id); } }
  return {
    select,
    get id() { return state.id; },
    reset() { state.close(); point = null; pressed = null; },
    update(nextItems, size, enabled = true) {
      active = enabled; items = nextItems; grid = size;
      const now = performance.now();
      if (!enabled) { state.close(); point = null; }
      else if (point && !hovering) state.hover(pick(point), now);
      state.tick(now, hovering || card.contains(document.activeElement));
      const item = items.find(t => t.id === state.id);
      const shown = enabled && !!item;
      card.dataset.open = String(shown); card.inert = !shown;
      canvas.style.cursor = enabled && point && pick(point) ? 'pointer' : '';
      if (!shown) { visibleId = null; return; }
      if (visibleId !== item.id) card.dataset.corner = `${item.y < size / 2 ? 'bottom' : 'top'}-${item.x < size / 2 ? 'right' : 'left'}`;
      if (visibleId && visibleId !== item.id && !reduced.matches) {
        pulse?.cancel(); pulse = $('.ti-identity').animate([{ opacity: .35, transform: 'translateX(6px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
      }
      visibleId = item.id; card.dataset.id = item.id;
      card.dataset.collapsed = String(state.collapsed);
      $('.ti-fold').setAttribute('aria-expanded', String(!state.collapsed));
      $('.ti-fold').setAttribute('aria-label', state.collapsed ? '展开坦克信息' : '收起坦克信息');
      $('.ti-pin').textContent = state.pinned ? '已固定' : '固定';
      $('.ti-pin').setAttribute('aria-pressed', String(state.pinned));
      const value = JSON.stringify([item.id, item.model, item.name, item.logo, item.effort, item.color, item.hp, item.lives, item.kills, item.damage, item.status]);
      if (value === signature) return;
      signature = value;
      card.style.setProperty('--seat-color', item.color || 'var(--accent)');
      $('.ti-seat').textContent = item.id;
      $('.ti-identity strong').textContent = item.model;
      $('.ti-work').textContent = [item.name, item.effort].filter(Boolean).join(' · ');
      $('.ti-identity').title = [item.name, item.effort].filter(Boolean).join(' · ');
      $('.ti-summary').textContent = `${item.lives ?? 0} 命 · ${item.hp ?? 0} 装甲 · ${item.kills ?? 0} 击杀`;
      const logo = $('.ti-identity img'); logo.hidden = !item.logo; if (item.logo) logo.src = item.logo;
      $('.ti-stats').replaceChildren(...[[item.lives,'命'],[item.hp,'装甲'],[item.kills,'击杀'],[item.damage,'伤害']].map(([n,label]) => {
        const cell = document.createElement('span'), number = document.createElement('b'), text = document.createElement('small');
        number.textContent = n ?? 0; text.textContent = label; cell.append(number,text); return cell;
      }));
      $('.ti-status').textContent = item.status;
    },
  };
}
