import { sampleStorm, sampleRecoil } from './motion.mjs';
const colors = ['#bd674b', '#518ba2', '#b79639', '#8a78a5', '#66a17b', '#c48655', '#7395bd', '#ba748b'];
export const seatColor = (i) => colors[i % colors.length];
export function createRoyaleRenderer(canvas) {
  const c = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const resize = () => {
    const edge = Math.floor(Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight));
    canvas.style.width = `${edge}px`;
    canvas.style.height = `${edge}px`;
  };
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  return function draw({ map, frame, next = frame, fraction = 0, ids, selected = ids.length, focus = null, effects = [] }) {
    const size = map.length, ink = document.documentElement.dataset.theme === 'ink';
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    c.setTransform(width / size, 0, 0, height / size, 0, 0);
    c.clearRect(0, 0, size, size);
    c.fillStyle = ink ? '#26362f' : '#e4e5d6'; c.fillRect(0, 0, size, size);
    c.lineWidth = .025; c.strokeStyle = ink ? '#405046' : '#cfd3c1';
    for (let i = 0; i <= size; i++) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, size); c.moveTo(0, i); c.lineTo(size, i); c.stroke(); }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = map[y][x]; if (!t) continue;
      c.fillStyle = t === 1 ? '#a68b70' : t === 2 ? '#738078' : t === 4 ? '#95a883' : '#72999c';
      c.fillRect(x + .07, y + .07, .86, .86);
      if (t === 1) { c.strokeStyle = '#d6c7ac'; c.lineWidth = .05; c.beginPath(); c.moveTo(x, y + .5); c.lineTo(x + 1, y + .5); c.moveTo(x + .5, y); c.lineTo(x + .5, y + .5); c.stroke(); }
      if (t === 2) { c.fillStyle = '#a4ada1'; c.fillRect(x + .2, y + .2, .6, .09); }
      if (t === 4) { c.strokeStyle = '#69855e'; c.lineWidth = .07; c.beginPath(); c.moveTo(x + .25, y + .8); c.lineTo(x + .35, y + .3); c.moveTo(x + .6, y + .7); c.lineTo(x + .7, y + .2); c.stroke(); }
    }
    const z = frame.arena.safeZone;
    const storm = sampleStorm(z, frame.tick + fraction, frame.arena.zoneSchedule, reduced.matches), m = storm.margin;
    c.fillStyle = ink ? '#bd674b45' : '#a158443b';
    c.fillRect(0, 0, size, m); c.fillRect(0, size - m, size, m); c.fillRect(0, m, m, size - 2 * m); c.fillRect(size - m, m, m, size - 2 * m);
    if (size - 2 * m > .16) {
      c.strokeStyle = '#bc674b'; c.lineWidth = .15; c.strokeRect(m + .08, m + .08, size - 2 * m - .16, size - 2 * m - .16);
      if (storm.moving && size > 2 * z.min) { c.lineWidth = .045; c.strokeRect(z.min, z.min, size - 2 * z.min, size - 2 * z.min); }
      c.setLineDash([.35, .35]); c.lineWidth = .06; c.globalAlpha = .5; c.strokeRect(z.nextMin, z.nextMin, Math.max(0, size - 2 * z.nextMin), Math.max(0, size - 2 * z.nextMin)); c.setLineDash([]); c.globalAlpha = 1;
    }
    for (const b of frame.arena.supplies) {
      c.fillStyle = b.type === 'repair' ? '#638765' : b.type === 'rapid' ? '#b99145' : b.type === 'shield' ? '#558ea0' : '#9583a5';
      c.beginPath(); c.roundRect(b.x + .15, b.y + .15, 1.7, 1.7, .2); c.fill();
      c.fillStyle = '#fff6da'; c.font = 'bold 1.2px sans-serif'; c.textAlign = 'center'; c.fillText({ repair: '+', rapid: '»', shield: '◇', radar: '◎' }[b.type], b.x + 1, b.y + 1.45);
    }
    ids.slice(0, selected).forEach((id, i) => {
      const t = frame.tanks[id], upcoming = next.tanks[id], n = upcoming?.lives === t?.lives ? upcoming : t; if (!t?.onField) return;
      const x = t.x + ((n?.x ?? t.x) - t.x) * fraction, y = t.y + ((n?.y ?? t.y) - t.y) * fraction;
      c.save(); c.translate(x + 1, y + 1);
      if (focus === id) { c.strokeStyle = ink ? '#ece9cf' : '#35483e'; c.lineWidth = .1; c.setLineDash([.2, .2]); c.strokeRect(-1.5, -1.5, 3, 3); c.setLineDash([]); }
      if (t.shield) { c.strokeStyle = '#80c9da'; c.lineWidth = .15; c.beginPath(); c.arc(0, 0, 1.4, 0, Math.PI * 2); c.stroke(); }
      c.rotate(t.dir * Math.PI / 2);
      const box = (a, b, w, h, radius, fill) => { c.fillStyle = fill; c.beginPath(); c.roundRect(a, b, w, h, radius); c.fill(); };
      box(-.87, -.7, 1.9, 1.8, .2, '#18291e40');
      for (const tx of [-.96, .55]) {
        box(tx, -.91, .41, 1.82, .13, '#26352e');
        c.fillStyle = '#768077';
        const rolling = !reduced.matches && (t.x !== n?.x || t.y !== n?.y) ? fraction * .27 : 0;
        for (let ty = -.76; ty < .78; ty += .27) c.fillRect(tx + .06, ty + rolling, .29, .07);
      }
      box(-.6, -.78, 1.2, 1.53, .17, t.hurtTicks ? '#fff3cf' : seatColor(i));
      box(-.48, -.68, .13, 1.2, .04, '#ffffff55');
      box(.35, -.65, .15, 1.28, .04, '#172a2f30');
      for (let vent = 0; vent < 3; vent++) box(-.23, .43 + vent * .08, .46, .035, .01, '#23382e80');
      const recoil = sampleRecoil(effects, id, frame.tick + fraction, reduced.matches);
      box(-.15, -1.25 + recoil, .3, 1.1, .05, '#283c34');
      box(-.08, -1.2 + recoil, .08, .72, .02, '#a7ada0');
      box(-.21, -1.3 + recoil, .42, .19, .035, '#273a32');
      box(-.4, -.4 + recoil * .35, .8, .83, .19, '#23382e60');
      box(-.38, -.46 + recoil * .35, .76, .78, .19, t.hurtTicks ? '#fff3cf' : seatColor(i));
      c.strokeStyle = '#ffffff55'; c.lineWidth = .045; c.beginPath(); c.arc(0, -.03, .19, 0, Math.PI * 2); c.stroke();
      box(-.06, -.15, .12, .24, .025, '#24392e88');
      c.restore();
      c.fillStyle = ink ? '#ece9cf' : '#35483e'; c.font = 'bold .7px sans-serif'; c.textAlign = 'center'; c.fillText(id, x + 1, y - .4);
      for (let h = 0; h < t.maxHp; h++) { c.fillStyle = h < t.hp ? seatColor(i) : '#65736055'; c.fillRect(x + h * 1.05, y + 2.2, .8, .13); }
    });
    for (const trace of next.traces || []) {
      const cells = trace.cells; if (!cells.length) continue;
      const at = Math.min(cells.length - 1, fraction * (cells.length - 1)), a = cells[Math.floor(at)], b = cells[Math.min(Math.floor(at) + 1, cells.length - 1)];
      const f = at % 1, x = a.x + (b.x - a.x) * f + .5, y = a.y + (b.y - a.y) * f + .5;
      c.strokeStyle = '#f6c26b'; c.lineWidth = .12; c.beginPath(); c.moveTo(cells[0].x + .5, cells[0].y + .5); c.lineTo(x, y); c.stroke();
      c.fillStyle = '#fff0bb'; c.beginPath(); c.arc(x, y, .23, 0, Math.PI * 2); c.fill();
    }
    for (const e of effects) {
      const age = frame.tick + fraction - e.tick; if (age < 0 || age > 5 || e.x < 0) continue;
      if (e.kind === 'fire') continue;
      c.globalAlpha = 1 - age / 5; c.strokeStyle = e.kind === 'eliminated' ? '#bc674b' : '#e3ba6d'; c.lineWidth = .2;
      c.beginPath(); c.arc(e.x + .5, e.y + .5, .5 + age * .48, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
  };
}
