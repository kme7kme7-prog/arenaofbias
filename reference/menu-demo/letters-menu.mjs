const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll('.slot')];
const scene = $('.play-scene');
const feature = $('#feature');
const blank = $('#blank-feature');
const preview = $('#preview');
const status = $('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const directory = $('.slots');
const firstSlot = tabs[0].innerHTML;
const animations = new Set();
let page = 0;
let kind = 'words';
let choice = '';
let leaving = false;
const remembered = [1, 7];

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
  const isLive = number === 1;
  feature.hidden = !isLive;
  blank.hidden = isLive;
  $('#blank-number').textContent = String(number).padStart(2, '0');
  // The page surface remains opaque. Only the content settles into its new position.
  animate(isLive ? $('.cards') : $('.blank-center'), [
    { transform: 'translateY(12px)' },
    { transform: 'translateY(0)' },
  ]);
  announce(isLive ? '随心玩，匿名二选一。' : `第 ${number} 格，玩法准备中。`);
}

function renderPage(next, focus = true) {
  if (next < 0 || next > 1) return;
  page = next;
  tabs.forEach((tab, index) => {
    const number = page * 6 + index + 1;
    tab.dataset.slot = String(number);
    tab.id = `slot-${number}`;
    tab.className = `slot ${number === 1 ? 'slot-live' : 'slot-empty'}`;
    tab.innerHTML =
      number === 1
        ? firstSlot
        : `<span class="slot-top">${String(number).padStart(2, '0')}</span><span class="empty-cross" aria-hidden="true">+</span><span class="slot-empty-label">待入场</span>`;
    tab.setAttribute(
      'aria-label',
      number === 1 ? '随心玩，匿名二选一，可以玩' : `第 ${number} 格，待入场`,
    );
  });
  $('#page-number').textContent = String(page + 1).padStart(2, '0');
  $('.page-track i').style.transform = `translateX(${page * 100}%)`;
  $('#previous-page').disabled = page === 0;
  $('#next-page').disabled = page === 1;
  selectSlot(remembered[page], focus);
}

directory.addEventListener('click', (event) => {
  const tab = event.target.closest('[role=tab]');
  if (tab) selectSlot(Number(tab.dataset.slot));
});
directory.addEventListener('keydown', (event) => {
  const tab = event.target.closest('[role=tab]');
  if (!tab) return;
  const index = tabs.indexOf(tab);
  const columns =
    getComputedStyle(directory).gridTemplateColumns.split(' ').length;
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % 6;
  if (event.key === 'ArrowLeft') next = (index + 5) % 6;
  if (event.key === 'ArrowDown') next = (index + columns) % 6;
  if (event.key === 'ArrowUp') next = (index + 6 - columns) % 6;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = 5;
  if (next !== undefined) {
    event.preventDefault();
    selectSlot(page * 6 + next + 1, true);
  } else if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault();
    renderPage(page + (event.key === 'PageDown' ? 1 : -1));
  }
});
$('#previous-page').addEventListener('click', () => renderPage(page - 1));
$('#next-page').addEventListener('click', () => renderPage(page + 1));
$('#back-to-play').addEventListener('click', () => {
  remembered[0] = 1;
  renderPage(0);
});

function resetChoice() {
  choice = '';
  scene.dataset.chosen = '';
  $('.reset-preview').hidden = true;
  $('#scene-hint').textContent =
    kind === 'objects'
      ? '试着选一件，看看是谁做的。'
      : '哪封信，让你想回一句？';
  for (const button of document.querySelectorAll('[data-choice]')) {
    button.setAttribute(
      'aria-label',
      `试选${kind === 'objects' ? '作品' : '来信'} ${button.dataset.choice.toUpperCase()}`,
    );
    button.setAttribute('aria-pressed', 'false');
  }
  document.querySelectorAll('.identity-anonymous').forEach((element) => {
    element.textContent = kind === 'words' ? '—— 署名暂隐' : '匿名作品';
  });
}

for (const button of document.querySelectorAll('.scene-switch button'))
  button.addEventListener('click', () => {
    if (button.dataset.kind === kind) return;
    cancelMotion();
    kind = button.dataset.kind;
    scene.dataset.kind = kind;
    for (const option of document.querySelectorAll('.scene-switch button'))
      option.setAttribute('aria-pressed', String(option === button));
    for (const image of document.querySelectorAll('.work-image'))
      image.hidden = kind !== 'objects';
    for (const letter of document.querySelectorAll('.letter-sample'))
      letter.hidden = kind !== 'words';
    $('#scene-topic').textContent =
      kind === 'objects' ? '营造法式 · 作品截图' : '不说爱的告白 · 节选';
    $('#scene-question').textContent =
      kind === 'objects'
        ? '同一座古寺，你偏爱哪一座？'
        : '不说“爱”，写一段告白。';
    $('.preview-label').textContent = '试选一下';
    scene.setAttribute(
      'aria-label',
      kind === 'objects'
        ? '随心玩预览，试选一份作品'
        : '随心玩预览，试选一封信',
    );
    resetChoice();
    animate($('.cards'), [
      { transform: 'translateY(10px) scale(.99)' },
      { transform: 'translateY(0) scale(1)' },
    ]);
    announce(
      kind === 'objects' ? '已切换到 3D 作品预览。' : '已切换到文字预览。',
    );
  });

for (const button of document.querySelectorAll('[data-choice]'))
  button.addEventListener('click', () => {
    choice = button.dataset.choice;
    scene.dataset.chosen = choice;
    const names =
      kind === 'objects'
        ? ['GPT-6 Astra Pro', 'Claude Fable 5']
        : ['GPT-5.6 Luna', 'MiMo V2.6 Pro'];
    document
      .querySelectorAll('.identity-revealed')
      .forEach((element, index) => {
        element.textContent = names[index];
      });
    document.querySelectorAll('[data-choice]').forEach((card) => {
      card.setAttribute('aria-pressed', String(card === button));
      const index = card.dataset.choice === 'a' ? 0 : 1;
      card.setAttribute(
        'aria-label',
        `${card.dataset.choice.toUpperCase()}，${names[index]}${card === button ? '，合我心意' : ''}`,
      );
    });
    $('#scene-hint').textContent =
      kind === 'objects'
        ? `你选了 ${choice.toUpperCase()}。原来你喜欢的是它。`
        : `这封信，合你心意。`;
    $('.reset-preview').hidden = false;
    announce(
      kind === 'objects'
        ? `你选择了作品 ${choice.toUpperCase()}，作者是 ${names[choice === 'a' ? 0 : 1]}。预览不计票。`
        : `你选择了来信 ${choice.toUpperCase()}，作者是 ${names[choice === 'a' ? 0 : 1]}。这是文字节选预览，不计票。`,
    );
  });
$('.reset-preview').addEventListener('click', () => {
  resetChoice();
  announce('已恢复匿名，可以重新选择。');
});

const dialog = $('.help-dialog');
$('.help-trigger').addEventListener('click', () => dialog.showModal());
$('.help-close').addEventListener('click', () => dialog.close());
$('.help-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
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
$('.enter-play').addEventListener('click', async (event) => {
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
  leaving = true;
  const link = event.currentTarget;
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
  wipe.getAnimations().forEach((motion) => motion.cancel());
  wipe.dataset.active = 'false';
  $('.enter-play').removeAttribute('aria-busy');
}
addEventListener('pageshow', restorePage);
addEventListener('pagehide', cancelMotion);
reduced.addEventListener('change', () => {
  if (reduced.matches) cancelMotion();
});

// Only these two real, locally captured works are included in this review demo.
const images = [...document.querySelectorAll('.work-image')];
for (const image of images) {
  const unavailable = () => {
    image.closest('.work-visual').classList.add('image-unavailable');
    image.alt = '作品图片暂时无法加载';
  };
  image.addEventListener('error', unavailable);
  if (image.complete && !image.naturalWidth) unavailable();
}
resetChoice();
renderPage(0, false);
