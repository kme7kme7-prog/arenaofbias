// 移动端兼容探针：在页面里跑，返回 JSON 摘要（临时工具）
const docW = document.documentElement.clientWidth;
const vw = innerWidth;
const vh = innerHeight;
const label = (el) => {
  const cls =
    typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
  return (
    el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (cls ? '.' + cls : '')
  );
};
const vis = (el) => {
  const s = getComputedStyle(el);
  return (
    s.display !== 'none' &&
    s.visibility !== 'hidden' &&
    Number(s.opacity) !== 0
  );
};
const inScroller = (el) => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return true;
  }
  return false;
};

// 1. 页面级横向溢出
const pageOverflow = document.documentElement.scrollWidth - docW;

// 2. 越过视口右缘/左缘的元素（未被滚动容器裁掉的才算问题）
const beyond = [];
for (const el of document.querySelectorAll('body *')) {
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height || !vis(el)) continue;
  if (b.right <= vw + 1 && b.left >= -1) continue;
  beyond.push({
    t: label(el),
    l: Math.round(b.left),
    r: Math.round(b.right),
    pos: getComputedStyle(el).position,
    clipped: inScroller(el),
  });
}

// 3. 点击热区过小（Material 48dp / WCAG 2.5.8 44px）
const small = [];
for (const el of document.querySelectorAll(
  'a,button,[role="button"],input,select,summary,[tabindex="0"],label',
)) {
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height || !vis(el)) continue;
  if (b.height >= 44 && b.width >= 44) continue;
  if (el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true')
    continue;
  small.push({
    t: label(el),
    w: Math.round(b.width),
    h: Math.round(b.height),
    txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 16),
  });
}

// 4. 文字被裁（非省略号意图）
const clipped = [];
for (const el of document.querySelectorAll('body *')) {
  if (el.children.length) continue;
  const s = getComputedStyle(el);
  if (!vis(el) || !el.textContent.trim()) continue;
  if (s.textOverflow === 'ellipsis') continue;
  if (el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'visible')
    clipped.push({ t: label(el), sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent.trim().slice(0, 18) });
  else if (el.scrollHeight > el.clientHeight + 2 && s.overflowY !== 'visible')
    clipped.push({ t: label(el), sh: el.scrollHeight, ch: el.clientHeight, txt: el.textContent.trim().slice(0, 18) });
}

// 5. 100vh / 固定定位高度与动态工具栏冲突
const vhMismatch = [];
for (const el of document.querySelectorAll('body *')) {
  const s = getComputedStyle(el);
  if (s.position !== 'fixed' && s.position !== 'sticky') continue;
  const b = el.getBoundingClientRect();
  if (!b.height || !vis(el)) continue;
  if (b.height > vh + 1 || b.bottom > vh + 2 && s.position === 'fixed')
    vhMismatch.push({ t: label(el), h: Math.round(b.height), bottom: Math.round(b.bottom), pos: s.position });
}

// 6. 安全区 env() 使用情况
const hasSafeArea = /env\(\s*safe-area-inset/.test(
  [...document.styleSheets]
    .flatMap((s) => {
      try {
        return [...s.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join('\n'),
);

// 7. 文本溢出视口（长单词/不换行）
const longWords = [];
for (const el of document.querySelectorAll('body *')) {
  if (el.children.length) continue;
  const s = getComputedStyle(el);
  if (!vis(el) || s.whiteSpace === 'nowrap') continue;
  if (el.scrollWidth > el.clientWidth + 2 && s.overflowX === 'visible')
    longWords.push({ t: label(el), sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent.trim().slice(0, 18) });
}

return {
  url: location.href.replace(/^http:\/\/[^/]+/, ''),
  vw,
  vh,
  dpr: devicePixelRatio,
  vvScale: visualViewport ? visualViewport.scale : null,
  vvH: visualViewport ? Math.round(visualViewport.height) : null,
  pageOverflow,
  beyond: beyond.slice(0, 12),
  beyondCount: beyond.length,
  small: small.slice(0, 18),
  smallCount: small.length,
  clipped: clipped.slice(0, 12),
  clippedCount: clipped.length,
  vhMismatch: vhMismatch.slice(0, 8),
  hasSafeArea,
  longWords: longWords.slice(0, 8),
  scrollable: { y: document.documentElement.scrollHeight, x: document.documentElement.scrollWidth },
};
