// 有效热区探针（第二版）：以元素中心为原点铺一个 44×44 的采样网格，
// 统计有多少采样点真的落在这个元素（或它的子节点）上。
// getBoundingClientRect 量不出 ::after 扩出来的热区，elementFromPoint 才作数。
const selectors = [
  '.language-switch',
  '.account-entry',
  '.arena-home-link',
  '.expand-control',
  '.dev-entry',
  '.vote-draw',
  '.vote-button',
  '.text-button',
  '.reaction-chip',
  '.post-comment',
  '.result-board-link',
  '.next-gallery-bottom button',
  '.lobby-small-entry',
  '.rank-tab',
  '.rank-scope',
  '.next-header nav a',
  '.dev-row',
  '.dev-panel select',
  '.dev-panel header button',
];
const label = (el) =>
  el.tagName.toLowerCase() +
  (el.id ? '#' + el.id : '') +
  (typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/)[0]
    : '');
const rows = [];
for (const sel of selectors) {
  const el = document.querySelector(sel);
  if (!el) continue;
  const r0 = el.getBoundingClientRect();
  if (!r0.height || r0.width < 2 || label(el).includes('sr-only')) continue;
  // 先滚进视口：elementFromPoint 对视口外的点一律返回 null，会把热区量成 0%
  el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const r = el.getBoundingClientRect();
  if (!r.height || r.width < 2 || label(el).includes('sr-only')) continue;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  let hit = 0;
  let total = 0;
  let blocker = null;
  for (let dy = -20; dy <= 20; dy += 4) {
    for (let dx = -20; dx <= 20; dx += 4) {
      const p = document.elementFromPoint(cx + dx, cy + dy);
      total++;
      if (p && (p === el || el.contains(p))) hit++;
      else if (!blocker && p) blocker = label(p);
    }
  }
  rows.push({
    t: label(el),
    box: Math.round(r.width) + 'x' + Math.round(r.height),
    cover: Math.round((hit / total) * 100) + '%',
    blocker,
  });
}
return rows;
