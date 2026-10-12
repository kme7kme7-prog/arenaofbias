// A guided spotlight over the real controls. The guide never edits a setup.
export function createTour({ setup, watching, isWatching, pause, rules }) {
  const root = document.createElement('dialog');
  root.id = 'tank-tour';
  root.className = 'tank-tour';
  root.setAttribute('aria-labelledby', 'tour-title');
  root.setAttribute('aria-describedby', 'tour-description');
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div><section class="tour-card">
    <div class="tour-top"><span id="tour-count" class="eyebrow"></span><button id="tour-skip" class="text-button">跳过引导 ×</button></div>
    <div class="tour-progress" aria-hidden="true"></div><h2 id="tour-title"></h2><p id="tour-description"></p>
    <div class="tour-bottom"><button id="tour-rules" class="text-button">查看规则</button><div><button id="tour-prev" aria-label="上一步">←</button><button id="tour-next" class="primary">下一步 →</button></div></div>
    </section>`;
  document.body.append(root);
  const find = (s) => root.querySelector(s),
    spot = find('.tour-spot'),
    card = find('.tour-card');
  let steps = [],
    index = 0,
    target = null,
    raf = 0,
    movement = null,
    restoreFocus,
    scroll;
  function place() {
    if (!root.open || !target) return;
    const r = target.getBoundingClientRect(),
      w = innerWidth,
      h = innerHeight,
      gap = 16;
    const x = Math.max(8, r.left - 7),
      y = Math.max(8, r.top - 7),
      right = Math.min(w - 8, r.right + 7),
      bottom = Math.min(h - 8, r.bottom + 7);
    Object.assign(spot.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${Math.max(1, right - x)}px`,
      height: `${Math.max(1, bottom - y)}px`,
    });
    card.style.maxHeight = `${h - 32}px`;
    const cw = card.offsetWidth,
      ch = card.offsetHeight;
    let left, top;
    if (w - right >= cw + gap + 16) {
      left = right + gap;
      top = (y + bottom - ch) / 2;
    } else if (x >= cw + gap + 16) {
      left = x - cw - gap;
      top = (y + bottom - ch) / 2;
    } else if (h - bottom >= ch + gap + 12) {
      left = (x + right - cw) / 2;
      top = bottom + gap;
    } else if (y >= ch + gap + 12) {
      left = (x + right - cw) / 2;
      top = y - ch - gap;
    } else {
      left = (w - cw) / 2;
      top = bottom < h / 2 ? bottom + gap : y - ch - gap;
    }
    Object.assign(card.style, {
      left: `${Math.max(12, Math.min(w - cw - 12, left))}px`,
      top: `${Math.max(12, Math.min(h - ch - 12, top))}px`,
    });
  }
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  }
  function show() {
    const previous = root.dataset.step ? card.getBoundingClientRect() : null;
    movement?.cancel();
    const step = steps[index];
    target = document.querySelector(
      typeof step.target === 'function' ? step.target() : step.target,
    );
    if (!target) {
      finish();
      return;
    }
    root.dataset.step = String(index + 1);
    find('#tour-count').textContent =
      `带你走一遍 / ${String(index + 1).padStart(2, '0')} — ${String(steps.length).padStart(2, '0')}`;
    find('#tour-title').textContent = step.title;
    find('#tour-description').textContent = step.text;
    find('#tour-prev').disabled = index === 0;
    find('#tour-next').textContent =
      index === steps.length - 1 ? '我来试试 ↗' : '下一步 →';
    find('.tour-progress').replaceChildren(
      ...steps.map((_, i) => {
        const bar = document.createElement('i');
        bar.className = i <= index ? 'done' : '';
        return bar;
      }),
    );
    target.scrollIntoView({
      block: innerWidth <= 650 ? 'start' : 'center',
      inline: 'nearest',
      behavior: 'instant',
    });
    if (innerWidth <= 650) window.scrollBy({ top: -24, behavior: 'instant' });
    place();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const next = card.getBoundingClientRect();
      movement = card.animate(
        [
          {
            transform: previous
              ? `translate(${previous.left - next.left}px, ${previous.top - next.top}px)`
              : 'translateY(10px)',
            opacity: previous ? 0.72 : 0,
          },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    schedule();
    find('#tour-next').focus({ preventScroll: true });
  }
  function finish() {
    if (!root.open) return;
    root.close();
    movement?.cancel();
    delete root.dataset.step;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    if (scroll)
      window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  }
  find('#tour-next').addEventListener('click', () => {
    if (index === steps.length - 1) finish();
    else {
      index++;
      show();
    }
  });
  find('#tour-prev').addEventListener('click', () => {
    if (index > 0) {
      index--;
      show();
    }
  });
  find('#tour-skip').addEventListener('click', finish);
  find('#tour-rules').addEventListener('click', () => {
    finish();
    rules();
  });
  root.addEventListener('cancel', (e) => {
    e.preventDefault();
    finish();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      find('#tour-next').click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      find('#tour-prev').click();
    }
  });
  return {
    start() {
      if (root.open) return;
      pause();
      steps = isWatching() ? watching : setup;
      index = 0;
      restoreFocus = document.activeElement;
      scroll = { x: scrollX, y: scrollY };
      root.showModal();
      window.addEventListener('resize', schedule);
      window.addEventListener('scroll', schedule, true);
      show();
    },
    close: finish,
  };
}
