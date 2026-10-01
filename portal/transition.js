(() => {
  let leaving = false;
  let cover;
  const reset = () => {
    leaving = false;
    cover?.remove();
    document.documentElement.classList.remove('portal-leaving');
    document.querySelector('main').inert = false;
    document.body.inert = false;
    document.querySelectorAll('.portal-selected').forEach(half => half.classList.remove('portal-selected'));
  };
  // A browser-back restoration must not keep the old outgoing sheet or click lock.
  addEventListener('pageshow', reset);
  document.querySelectorAll('.half .go').forEach(link => {
    link.addEventListener('click', async event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
      event.preventDefault();
      if (leaving) return;
      leaving = true;
      const half = link.closest('.half');
      const gallery = half.classList.contains('gallery');
      const url = new URL(link.href);
      url.searchParams.set('entry', 'portal');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      half.classList.add('portal-selected');
      document.documentElement.classList.add('portal-leaving');
      document.querySelector('main').inert = true;
      document.body.inert = true;
      if (!reduced) await new Promise(resolve => setTimeout(resolve, 160));
      const rect = half.getBoundingClientRect();
      cover = document.createElement('div');
      cover.className = `portal-cover ${gallery ? 'gallery' : 'arena'}`;
      Object.assign(cover.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
      document.body.append(cover);
      const animation = cover.animate([
        { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` },
        { left:'0px', top:'0px', width:`${innerWidth}px`, height:`${innerHeight}px` },
      ], { duration:reduced ? 0 : 650, easing:'cubic-bezier(.65,0,.25,1)', fill:'forwards' });
      try { await animation.finished; location.assign(url); }
      catch { reset(); }
    });
  });
})();
