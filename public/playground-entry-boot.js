// A shared cover survives the document boundary; only the mounted destination opens it.
(() => {
  const key = 'aob-playground-entry';
  const html = document.documentElement;
  const path = location.pathname + location.hash;
  let arrival;
  try {
    arrival = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
  } catch {}
  if (!arrival || arrival.destination !== path || Date.now() - arrival.at > 15000) arrival = null;
  if (arrival) html.dataset.playEntry = 'covered';
  const style = document.createElement('style');
  style.textContent = `
    html[data-play-entry]::after {content:'';position:fixed;inset:0;z-index:2147483646;background:#eee9dc;}
    .play-entry-wipe {position:fixed;inset:0;z-index:2147483647;overflow:hidden;pointer-events:auto;}
    .play-entry-wipe i {position:absolute;inset:0;display:block;background:#bf876e;will-change:transform;}
    .play-entry-wipe i:nth-child(2) {background:#9aa88b;}
    .play-entry-wipe i:nth-child(3) {background:#eee9dc;}
    .play-entry-wipe a {position:absolute;inset:auto 24px 24px auto;color:#35453b;font:16px/1.5 sans-serif;}
  `;
  document.head.append(style);
  let layer;
  let running = false;
  let tracks = [];
  let deadline;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clear = () => {
    clearTimeout(deadline);
    for (const track of tracks) track.cancel();
    tracks = [];
    layer?.remove(); layer = null;
    delete html.dataset.playEntry;
    running = false;
  };
  const mount = phase => {
    layer?.remove();
    layer = document.createElement('div');
    layer.className = 'play-entry-wipe';
    layer.dataset.phase = phase;
    layer.setAttribute('aria-hidden', 'true');
    layer.append(...Array.from({ length: 3 }, () => document.createElement('i')));
    document.body.append(layer);
    return [...layer.children];
  };
  const animate = (parts, opening, back) => {
    const sign = back ? -1 : 1;
    tracks = parts.map((part, index) => part.animate([
      { transform: `translateX(${opening ? 0 : -100 * sign}%)` },
      { transform: `translateX(${opening ? 100 * sign : 0}%)` },
    ], { duration: reduced() ? 1 : 260, delay: reduced() ? 0 : (opening ? 2 - index : index) * 40,
      easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' }));
    return Promise.all(tracks.map(track => track.finished));
  };
  window.PlaygroundEntry = {
    navigate(destination, back = false) {
      if (running || document.querySelector('.game-transition,.pg-passage,.theme-curtain')) return;
      const url = new URL(destination, location.href);
      if (url.origin !== location.origin) return;
      running = true;
      const parts = mount('closing');
      void animate(parts, false, back).then(() => {
        try { sessionStorage.setItem(key, JSON.stringify({ destination: url.pathname + url.hash, at: Date.now(), back })); } catch {}
        location.assign(url.href);
      }, clear);
    },
    ready() {
      if (!arrival || running) return;
      running = true;
      clearTimeout(deadline);
      const parts = mount('opening');
      delete html.dataset.playEntry;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void animate(parts, true, arrival.back).then(clear, clear);
        arrival = null;
      }));
    },
    get active() { return running || !!arrival; },
  };
  if (arrival) deadline = setTimeout(() => {
    const parts = mount('failed');
    for (const part of parts) part.style.transform = 'none';
    layer.removeAttribute('aria-hidden');
    const exit = document.createElement('a');
    exit.href = '/#play'; exit.textContent = '返回玩法菜单';
    layer.append(exit);
  }, 15000);
  addEventListener('pageshow', event => { if (event.persisted) { arrival = null; clear(); } });
})();
