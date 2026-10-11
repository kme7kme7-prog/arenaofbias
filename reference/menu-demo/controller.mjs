import { MODES, renderMode } from './modes.mjs';

/**
 * Mount the reviewed menu in its own DOM island. The site supplies navigation,
 * asset URLs and localization; the standalone page uses the same controller.
 * @param {HTMLElement} root
 * @param {{ assetURL?: (name: string) => string, navigate?: (id: string, href: string) => void, history?: boolean, initialMode?: string, onMode?: (id: string) => void, localize?: (root: HTMLElement) => void }} options
 */
export function mountMenu(root, options = {}) {
  const abort = new AbortController();
  const listen = (target, name, callback) =>
    target.addEventListener(name, callback, { signal: abort.signal });
  const assetURL = options.assetURL || ((name) => `./assets/${name}`);
  const resolveImages = (element) =>
    element.querySelectorAll('img').forEach((img) => {
      const source = img.getAttribute('src');
      if (source?.startsWith('./assets/')) img.src = assetURL(source.slice(9));
    });

  const $ = (selector) => root.querySelector(selector);
  const tabs = [...root.querySelectorAll('.slot')];
  const scene = $('.menu-forum-scene');
  const feature = $('#feature');
  const modeFeature = $('#mode-feature');
  const preview = $('#preview');
  const status = $('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const directory = $('.slots');
  const animations = new Set();
  let page = 0;
  let choice = '';
  let leaving = false;
  const pageCount = Math.ceil(MODES.length / tabs.length);
  const remembered = Array.from(
    { length: pageCount },
    (_, index) => index * tabs.length + 1,
  );
  let currentMode = '';
  let pickedCard = '';

  function animate(element, frames, options = {}) {
    if (reduced.matches) return;
    const motion = element.animate(frames, {
      duration: 340,
      easing: 'cubic-bezier(.22,.75,.18,1)',
      ...options,
    });
    animations.add(motion);
    motion.finished.catch(() => {}).finally(() => animations.delete(motion));
  }

  function cancelMotion() {
    for (const motion of animations) motion.cancel();
    animations.clear();
  }

  function announce(message) {
    status.textContent = message;
    options.localize?.(root);
  }

  function selectSlot(number, moveFocus = false) {
    cancelMotion();
    remembered[page] = number;
    for (const tab of tabs) {
      const active = Number(tab.dataset.slot) === number;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus({ preventScroll: true });
    }
    preview.setAttribute('aria-labelledby', `slot-${number}`);
    const mode = MODES[number - 1];
    const isParty = mode.id === 'party';
    feature.hidden = !isParty;
    modeFeature.hidden = isParty;
    preview.dataset.mode = mode.id;
    preview.style.setProperty('--mode-color', mode.color);
    preview.style.setProperty('--mode-soft', mode.soft);
    if (currentMode !== mode.id) {
      if (!isParty) {
        modeFeature.innerHTML = renderMode(mode);
        resolveImages(modeFeature);
      }
      currentMode = mode.id;
      pickedCard = '';
      // The paper stays opaque; only the newly selected scene moves into place.
      animate(isParty ? $('.forum-posts') : $('.mode-scene'), [
        { transform: 'translateY(12px)' },
        { transform: 'translateY(0)' },
      ]);
    }
    if (options.history !== false) {
      const url = new URL(location.href);
      url.searchParams.set('mode', mode.id);
      history.replaceState(null, '', url);
      document.title = `${mode.name} · Arena of Bias`;
    }
    options.onMode?.(mode.id);
    announce(
      `${mode.name}，${mode.short}。${mode.locked ? '暂未完成，可查看玩法预览。' : '可以进入。'}`,
    );
  }

  function renderPage(next, focus = true) {
    if (next < 0 || next >= pageCount) return;
    page = next;
    directory.dataset.singleRow = String(
      MODES.length - page * tabs.length <= 3,
    );
    tabs.forEach((tab, index) => {
      const number = page * 6 + index + 1;
      tab.dataset.slot = String(number);
      tab.id = `slot-${number}`;
      const mode = MODES[number - 1];
      tab.hidden = !mode;
      if (!mode) {
        tab.replaceChildren();
        tab.removeAttribute('data-mode');
        tab.setAttribute('aria-selected', 'false');
        tab.tabIndex = -1;
        return;
      }
      tab.className = 'slot slot-mode';
      tab.dataset.mode = mode.id;
      tab.style.setProperty('--tile-color', mode.color);
      tab.style.setProperty('--tile-soft', mode.soft);
      tab.innerHTML = `<span class="slot-top"><span>${String(number).padStart(2, '0')}</span>${mode.locked ? '<svg class="tile-lock" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>' : '<span class="live-dot" aria-hidden="true"></span>'}</span>
      <span class="slot-picture"><img src="${assetURL(mode.cover)}" width="240" height="200" alt=""></span>
      <span class="slot-title"><strong>${mode.name}</strong><span class="slot-arrow" aria-hidden="true">↗</span></span>
      <span class="slot-description">${mode.short}</span>`;
      tab.setAttribute(
        'aria-label',
        `${mode.name}，${mode.short}，${mode.locked ? '暂未完成' : '可以玩'}`,
      );
    });
    $('#page-number').textContent = String(page + 1).padStart(2, '0');
    $('#page-total').textContent = String(pageCount).padStart(2, '0');
    $('.page-track i').style.width = `${100 / pageCount}%`;
    $('.page-track i').style.transform = `translateX(${page * 100}%)`;
    $('#previous-page').disabled = page === 0;
    $('#next-page').disabled = page === pageCount - 1;
    selectSlot(remembered[page], focus);
  }

  listen(directory, 'click', (event) => {
    const tab = event.target.closest('[role=tab]');
    if (tab) selectSlot(Number(tab.dataset.slot));
  });
  listen(directory, 'keydown', (event) => {
    const tab = event.target.closest('[role=tab]');
    if (!tab) return;
    const index = tabs.indexOf(tab);
    const count = Math.min(tabs.length, MODES.length - page * tabs.length);
    const columns =
      getComputedStyle(directory).gridTemplateColumns.split(' ').length;
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % count;
    if (event.key === 'ArrowLeft') next = (index + count - 1) % count;
    if (event.key === 'ArrowDown') next = (index + columns) % count;
    if (event.key === 'ArrowUp')
      next = (index + count - (columns % count)) % count;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = count - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectSlot(page * 6 + next + 1, true);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      renderPage(page + (event.key === 'PageDown' ? 1 : -1));
    }
  });
  listen($('#previous-page'), 'click', () => renderPage(page - 1));
  listen($('#next-page'), 'click', () => renderPage(page + 1));

  function resetChoice() {
    choice = '';
    scene.dataset.chosen = '';
    $('.reset-preview').hidden = true;
    for (const button of root.querySelectorAll('[data-choice]')) {
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute(
        'aria-label',
        '选回复 ' + button.dataset.choice.toUpperCase() + '，这句更绝',
      );
    }
    root
      .querySelectorAll('.identity-anonymous')
      .forEach((e) => e.removeAttribute('aria-hidden'));
    root
      .querySelectorAll('.identity-revealed')
      .forEach((e) => e.setAttribute('aria-hidden', 'true'));
  }
  for (const button of root.querySelectorAll('[data-choice]'))
    listen(button, 'click', () => {
      choice = button.dataset.choice;
      scene.dataset.chosen = choice;
      const post = button.closest('.reply-post');
      root.querySelectorAll('[data-choice]').forEach((option) => {
        const selected = option === button;
        option.setAttribute('aria-pressed', String(selected));
        option.setAttribute(
          'aria-label',
          '回复 ' +
            option.dataset.choice.toUpperCase() +
            '，' +
            option.closest('.reply-post').dataset.model +
            (selected ? '，已选择' : '，这句更绝'),
        );
      });
      root
        .querySelectorAll('.identity-anonymous')
        .forEach((e) => e.setAttribute('aria-hidden', 'true'));
      root
        .querySelectorAll('.identity-revealed')
        .forEach((e) => e.removeAttribute('aria-hidden'));
      $('.reset-preview').hidden = false;
      announce(
        '你选择了回复 ' +
          choice.toUpperCase() +
          '，作者是 ' +
          post.dataset.model +
          '。预览不计票。',
      );
    });
  listen($('.reset-preview'), 'click', () => {
    resetChoice();
    announce('已恢复匿名，可以重新选择。');
  });

  const dialog = $('.help-dialog');
  listen($('.help-trigger'), 'click', () => dialog.showModal());
  listen($('.help-close'), 'click', () => dialog.close());
  listen($('.help-done'), 'click', () => dialog.close());
  listen(dialog, 'click', (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close();
    }
  });

  const wipe = $('.arrival-wipe');
  listen(preview, 'click', async (event) => {
    const link = event.target.closest('.enter-play');
    if (!link) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (leaving) return;
    if (options.navigate) {
      options.navigate(currentMode, link.href);
      return;
    }
    leaving = true;
    link.setAttribute('aria-busy', 'true');
    wipe.dataset.active = 'true';
    if (!reduced.matches) {
      const motion = wipe.animate(
        [{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }],
        { duration: 300, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' },
      );
      try {
        await motion.finished;
      } catch {
        return;
      }
    }
    if (!leaving) return;
    location.assign(link.href);
  });
  function restorePage() {
    leaving = false;
    wipe?.getAnimations().forEach((motion) => motion.cancel());
    if (wipe) wipe.dataset.active = 'false';
    root
      .querySelectorAll('.enter-play')
      .forEach((link) => link.removeAttribute('aria-busy'));
  }
  listen(window, 'pageshow', restorePage);
  listen(window, 'pagehide', cancelMotion);
  listen(reduced, 'change', () => {
    if (reduced.matches) cancelMotion();
  });

  function moveCard(target) {
    const card = modeFeature.querySelector(`[data-card="${pickedCard}"]`);
    const row = modeFeature.querySelector(`[data-tier="${target}"]`);
    if (!card || !row) return;
    row.querySelector('.tier-cards').append(card);
    card.setAttribute('aria-pressed', 'false');
    const message = `作品 ${pickedCard} 已移到${row.querySelector('.tier-label').textContent}。`;
    $('.tier-feedback').textContent = message;
    announce(message);
    pickedCard = '';
  }
  listen(modeFeature, 'dragstart', (event) => {
    const card = event.target.closest('[data-card]');
    if (!card) return;
    pickedCard = card.dataset.card;
    event.dataTransfer.setData('text/plain', pickedCard);
    event.dataTransfer.effectAllowed = 'move';
  });
  listen(modeFeature, 'dragover', (event) => {
    if (event.target.closest('[data-tier]') && pickedCard)
      event.preventDefault();
  });
  listen(modeFeature, 'drop', (event) => {
    const row = event.target.closest('[data-tier]');
    if (!row || !pickedCard) return;
    event.preventDefault();
    moveCard(row.dataset.tier);
  });
  listen(modeFeature, 'click', (event) => {
    const card = event.target.closest('[data-card]');
    if (card) {
      pickedCard = card.dataset.card;
      modeFeature
        .querySelectorAll('[data-card]')
        .forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
      $('.tier-feedback').textContent =
        `已选作品 ${pickedCard}，点档位右侧的 + 移动。`;
      announce($('.tier-feedback').textContent);
      return;
    }
    const tier = event.target.closest('[data-tier-target]');
    if (tier) {
      moveCard(tier.dataset.tierTarget);
      return;
    }
    const patch = event.target.closest('[data-patch]');
    if (patch && !patch.disabled) {
      patch.textContent = '✓';
      patch.disabled = true;
      patch.setAttribute(
        'aria-label',
        `第 ${patch.dataset.patch} 处示意漏洞已修补`,
      );
      const remaining = modeFeature.querySelectorAll(
        '.patch:not(:disabled)',
      ).length;
      $('.site-health').textContent = remaining
        ? `还有 ${remaining} 处破绽`
        : '这一轮，防线补好了';
      $('.own-site').classList.toggle('patched', remaining === 0);
      announce($('.site-health').textContent);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const stage = button.closest('.mode-scene');
    const active = stage.classList.toggle('is-demonstrating');
    button.setAttribute('aria-pressed', String(active));
    switch (button.dataset.action) {
      case 'guess':
        button.firstChild.textContent = active ? '再看一次' : '再猜一步';
        break;
      case 'tanks':
        button.firstChild.textContent = active ? '回到开局' : '推进一拍';
        break;
      case 'werewolf':
        $('.wolf-center strong').textContent = active ? '身份揭晓' : '天黑了';
        $('.wolf-center p').textContent = active
          ? '这一桌，谁在说谎？'
          : '请藏好你的身份。';
        button.firstChild.textContent = active ? '藏好身份' : '看看身份';
        modeFeature
          .querySelectorAll('.role-front')
          .forEach((e) => e.setAttribute('aria-hidden', String(!active)));
        break;
      case 'geoguess':
        modeFeature
          .querySelectorAll('[data-answer]')
          .forEach((e) => (e.textContent = active ? e.dataset.answer : '?'));
        button.firstChild.textContent = active ? '再猜一次' : '看看坐标';
        break;
      case 'generals':
        button.firstChild.textContent = active ? '收起路线' : '看看进攻路线';
        break;
      case 'league':
        $('.league-games > span').textContent = active ? '02' : '01';
        $('.league-games h3').textContent = active ? '信任市场' : '囚徒困境';
        $('.league-games > p').textContent = active
          ? '承诺，值多少信任？'
          : '合作，还是背叛？';
        $('.league-options').innerHTML = active
          ? '<span>信任</span><span>怀疑</span>'
          : '<span>合作</span><span>背叛</span>';
        $('.league-next b').textContent = active ? '概率定价' : '信任市场';
        button.firstChild.textContent = active ? '回到上一场' : '翻到下一场';
        break;
      case 'debate':
        $('.debater-a blockquote').innerHTML = active
          ? '过程当然重要，<br>但它总该通向一个结果。'
          : '没有结果的努力，<br>怎么证明有价值？';
        $('.debater-b blockquote').innerHTML = active
          ? '可成长也是结果，<br>只是不能立刻量出来。'
          : '如果只看结果，<br>一次失败就能否定一切？';
        modeFeature
          .querySelectorAll('.debate-round')
          .forEach(
            (e, i) =>
              (e.textContent = `${active ? '第二' : '第一'}轮 · ${i ? '回应' : '立论'}`),
          );
        button.firstChild.textContent = active ? '回到开场' : '再听一轮';
        break;
    }
    announce(`${MODES.find((m) => m.id === currentMode).name}示意已更新。`);
  });

  resolveImages(root);
  resetChoice();
  const initial =
    MODES.find(
      (mode) =>
        mode.id ===
        (options.initialMode ||
          new URL(location.href).searchParams.get('mode')),
    ) || MODES[0];
  const initialPage = Math.floor((initial.number - 1) / 6);
  remembered[initialPage] = initial.number;
  renderPage(initialPage, false);

  return () => {
    abort.abort();
    cancelMotion();
    dialog.close();
    restorePage();
  };
}
