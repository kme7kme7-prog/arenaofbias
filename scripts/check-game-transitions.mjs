import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/game-transitions.ts', import.meta.url),
  'utf8',
);
const arenaSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(arenaSource, /setWorksSettled\(true\);[\s\S]*?releaseWorksGate\(\);\s*await waitRouteLayer\(signal\)/,
  'route curtain must release after the reveal, before waiting for its exit');
const workPoll = arenaSource.slice(arenaSource.indexOf('const waitWorksLoaded'), arenaSource.indexOf('const waitWorksLoaded') + 3000);
assert.doesNotMatch(workPoll, /releaseWorksGate/, 'readiness polling must not release the route curtain ahead of the reveal');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { createGameTransition, guessNavigate, convoyNavigate, homeNavigate } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
// 帧时不变量（2026-09-19 卡顿轮）：单帧推进封顶、门释放帧步长归零——
// 掉帧原地冻、恢复续播，时间轴不许按墙钟一把追到终态吃掉扫出
assert.match(source, /const FRAME_STEP_CAP = 100;/);
assert.match(source, /const SMOOTH_FRAMES = 3;/);
assert.match(source, /const SMOOTH_DELTA_MS = 250;/);
assert.match(
  source,
  /smoothPinned\s*\?\s*0\s*:\s*Math\.min\(delta, FRAME_STEP_CAP\)/,
  'pinned frames must step zero',
);
assert.match(
  source,
  /smooth < SMOOTH_FRAMES/,
  'sweep start waits for the frame rate to recover',
);
assert.doesNotMatch(
  source,
  /nativeExit/,
  'exit must stay frame-time scrubbed, never wall-clock native playback',
);
let tracks = [],
  id = 0;
const raf = new Map();
function element() {
  return {
    children: [],
    dataset: {},
    style: { setProperty() {} },
    setAttribute(k, v) {
      this[k] = v;
    },
    append(node) {
      this.children.push(node);
      node.parent = this;
    },
    remove() {
      this.parent.children = this.parent.children.filter((n) => n !== this);
    },
    animate(frames, options) {
      const animation = {
        owner: this.className,
        frames,
        options,
        currentTime: 0,
        playbackRate: 1,
        playing: false,
        play() { this.playing = true; },
        pause() { this.playing = false; },
        cancel() {
          this.playing = false;
          this.cancelled = true;
        },
      };
      tracks.push(animation);
      return animation;
    },
  };
}
const fakeDocument = { body: element(), createElement: element, documentElement: { dataset: { theme: 'paper' } } };
globalThis.document = fakeDocument;
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.requestAnimationFrame = (fn) => {
  raf.set(++id, fn);
  return id;
};
globalThis.cancelAnimationFrame = (token) => raf.delete(token);
let browserStamp = 0;
const step = (stamp) => {
  for (const track of tracks) if (track.playing)
    track.currentTime = Math.min(track.options.delay + track.options.duration,
      track.currentTime + Math.max(0, stamp - browserStamp) * track.playbackRate);
  browserStamp = stamp;
  const callbacks = [...raf.values()];
  raf.clear();
  callbacks.forEach((fn) => fn(stamp));
};
for (const theme of ['paper', 'ink']) for (const kind of ['push', 'frame', 'bands', 'convoy', 'deal', 'folio', 'match']) {
  document.documentElement.dataset.theme = theme;
  tracks = [];
  let covered = 0,
    finished = 0;
  const run = createGameTransition(kind, {
    onCovered: () => covered++,
    onFinish: () => finished++,
  });
  assert.equal(run.layer.parent, document.body);
  assert.equal(run.layer['aria-hidden'], 'true');
  const copy = run.layer.children.find(n => n.className === 'gt-static-copy');
  assert.ok(copy, 'copy must be a sibling of moving material');
  assert.equal(copy.hidden, true);
  const material = run.layer.children.find(n => n.className.includes('gt-material-plate'));
  if (kind === 'push') {
    assert.equal(copy.children.length, 0, 'classic push carries no copy or ornaments');
    assert.match(tracks[0].frames[0].transform, /translateX\(-102%\)/);
    assert.match(tracks[0].frames.at(-1).transform, /translateX\(102%\)/);
    assert.equal(tracks.length, 1, 'classic push uses a single continuous material track');
  }
  if (kind === 'frame') {
    assert.ok(material.children.some(n => n.className === 'gt-material-corners'),
      'frame border must travel inside its sheet, never float over the page');
  }
  if (kind === 'bands') {
    assert.ok(material.children.some(n => n.className === 'gt-material-bands'),
      'bands must stay clipped inside the moving sheet');
  }
  const copyDescendants = [];
  const walkCopy = node => { copyDescendants.push(node.className); node.children.forEach(walkCopy); };
  walkCopy(copy);
  for (const track of tracks) {
    if (copyDescendants.includes(track.owner)) assert.ok(['gt-static-rule', 'gt-deal-clue'].includes(track.owner), 'only a small line / numeral can move');
  }
  const plates = tracks.filter(t => /gt-material-(plate|leaf)/.test(t.owner));
  assert.equal(plates.length, kind === 'deal' ? 0 : kind === 'match' ? 2 : 1);
  if (kind === 'deal') {
    const shell = run.layer.children.find(n => n.className === 'gt-deal-shell');
    assert.ok(shell, 'historical entry must fly in as a complete mystery card');
    assert.equal(copy.children.length, 0, 'deal must not duplicate the generic title');
    assert.equal(run.layer.children.filter(n => n.className.startsWith('gt-deal-back')).length, 2);
    const cardCopy = shell.children.find(n => n.className === 'gt-deal-copy');
    const info = cardCopy.children.find(n => n.className === 'gt-deal-info');
    assert.equal(info.children.find(n => n.className === 'gt-deal-clues').children.length, 7);
    assert.ok(cardCopy.children.some(n => n.className === 'gt-deal-symbol'));
    const shellTrack = tracks.find(t => t.owner === 'gt-deal-shell');
    assert.equal(shellTrack.options.duration, run.timing.covered);
    assert.equal(shellTrack.frames.at(-1).transform, 'translateY(0) rotate(0deg) scale(1)');
    for (const half of tracks.filter(t => t.owner.startsWith('gt-deal-half'))) {
      assert.equal(half.options.delay, run.timing.exitStart, 'card stays closed through route swap');
      assert.equal(half.options.duration, 650);
    }
  }
  for (const plate of plates) {
    assert.equal(plate.frames[1].transform, 'translate(0, 0)');
    assert.equal(plate.frames[2].transform, 'translate(0, 0)');
    assert.equal(plate.frames[1].offset, run.timing.covered / run.timing.duration);
    assert.equal(plate.frames[2].offset, run.timing.exitStart / run.timing.duration);
  }
  run.seek(run.timing.covered);
  assert.equal(copy.hidden, false);
  run.seek(run.timing.exitStart);
  assert.equal(copy.hidden, true, 'copy hides before sheets separate');
  for (const track of tracks)
    for (const frame of track.frames)
      for (const key of Object.keys(frame))
        assert.ok(
          ['transform', 'opacity', 'offset', 'easing'].includes(key),
          key,
        );
  run.seek(run.timing.duration);
  assert.equal(covered, 0, 'scrub must not navigate');
  run.seek(0);
  run.play();
  run.play();
  assert.equal(raf.size, 1, 'play is idempotent');
  step(0);
  // 帧时推进：盖满前按正常帧间隔走一段，再注入掉帧（注入点离盖满留足
  // 一个封顶步以上，folio 这类短过场也适用）
  const stallTarget = Math.min(200, Math.max(0, run.timing.covered - 150));
  let limit = browserStamp + 20000;
  while (tracks[0].currentTime < stallTarget && browserStamp < limit)
    step(browserStamp + 16);
  // 掉帧不变量：单帧阻塞数秒只前进一个封顶步——不跳盖满、不跳入场段
  const stalledAt = tracks[0].currentTime;
  step(browserStamp + 5000);
  assert.equal(covered, 0, 'a stalled frame must not jump to coverage');
  assert.ok(
    tracks[0].currentTime - stalledAt <= 100,
    'a stalled frame advances at most one capped step',
  );
  limit = browserStamp + 20000;
  while (covered === 0 && browserStamp < limit) step(browserStamp + 16);
  assert.equal(covered, 1, 'the crossing frame still commits coverage');
  assert.ok(tracks.every((a) => a.currentTime === run.timing.covered));
  run.pause();
  assert.equal(raf.size, 0);
  run.play();
  if (kind === 'match') {
    limit = browserStamp + 20000;
    while (tracks[0].currentTime < run.timing.exitStart && browserStamp < limit)
      step(browserStamp + 16);
    assert.equal(tracks[0].currentTime, run.timing.exitStart);
    assert.equal(finished, 0, 'loading stall must not consume the opening');
    // 扫出段帧时 scrub（2026-09-19）：不交墙钟原生播放——饱和期合成器产不出
    // 帧时墙钟时间轴会独自跑完，产帧恢复瞬间半开纸幕凭空消失
    assert.ok(
      tracks.filter((a) => a.owner.startsWith('gt-match-leaf')).every((a) => !a.playing),
      'exit stays frame-time scrubbed, never wall-clock playback',
    );
    step(browserStamp + 500); // 真阻塞：扫出还没起，继续钉在盖满位
    assert.equal(finished, 0, 'half-open leaves must remain mounted');
    assert.equal(
      tracks[0].currentTime,
      run.timing.exitStart,
      'a stall at sweep start keeps the curtain at full cover',
    );
    assert.equal(run.layer.dataset.gtHold, '1');
    for (let i = 0; i < 6; i++) step(browserStamp + 16); // 帧率恢复：起扫并离开盖满位
    assert.ok(tracks[0].currentTime > run.timing.exitStart + 1);
    assert.ok(!run.layer.dataset.gtHold);
    // 扫出中途再掉帧：原地冻，不许回弹到盖满位、不许跳终态
    const midSweep = tracks[0].currentTime;
    step(browserStamp + 5000);
    assert.equal(
      tracks[0].currentTime,
      midSweep,
      'a stalled mid-sweep frame freezes in place',
    );
    assert.equal(
      run.layer.dataset.gtPhase,
      'exit',
      'mid-sweep freeze keeps the exit phase',
    );
    assert.ok(!run.layer.dataset.gtHold, 'mid-sweep freeze is not a re-pin');
    run.pause();
    const paused = tracks[0].currentTime;
    step(browserStamp + 2000);
    assert.equal(tracks[0].currentTime, paused);
    run.play();
    limit = browserStamp + 5000;
    while (finished === 0 && browserStamp < limit) step(browserStamp + 16);
  } else {
    // 退场段同帧时：掉帧后从冻点续扫，不许直接移除整层
    limit = browserStamp + 30000;
    while (finished === 0 && browserStamp < limit) step(browserStamp + 16);
  }
  assert.equal(covered, 1);
  assert.equal(finished, 1);
  assert.equal(document.body.children.length, 0);
  assert.ok(tracks.every((a) => a.cancelled));
  const cancelled = createGameTransition(kind, { onCovered: () => covered++ });
  cancelled.play();
  cancelled.dispose();
  step(30000);
  assert.equal(covered, 1);
  const reduced = createGameTransition(kind, {
    reduced: true,
    onCovered: () => covered++,
    onFinish: () => finished++,
  });
  reduced.play();
  assert.equal(covered, 2);
  assert.equal(finished, 2);
  assert.equal(raf.size, 0);
  assert.equal(document.body.children.length, 0);
  console.log(
    `PASS ${kind}: body ownership, safe properties, scrub isolation, idempotent play, cover gate, late frames, pause/resume, cleanup, cancellation, reduced motion`,
  );
}
document.documentElement.dataset.theme = 'paper';
// 层选择器隔离（2026-09-13 回归）：过场层本身 class 就带 gt-<kind>，
// CSS 里任何不带 .game-transition 前缀的裸 .gt-<kind> 规则都会命中层自身——
// 曾把层从 fixed 变成 absolute 并被撑到 2800px 宽，导致标题巨大、切页后页面从底部漏出。
{
  const css = await readFile(
    new URL('../app/game-transitions.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.game-transition \.gt-material-plate\s*\{[^}]*overflow:\s*hidden/,
    'moving sheets must clip their attached borders and bands');
  assert.match(css, /\.game-transition\.gt-bands \.gt-static-copy\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/,
    'bands copy must not pop an opaque bordered card over the moving curtain');
  for (const kind of ['push', 'frame', 'bands', 'convoy', 'deal', 'folio', 'match']) {
    const bare = new RegExp(`(^|})\\s*\\.gt-${kind}\\s*[,{]`, 'm');
    assert.ok(
      !bare.test(css),
      `.gt-${kind} 规则必须加 .game-transition 前缀，否则会命中过场层自身`,
    );
  }
  console.log('PASS kind styles never match the transition layer itself');
  // 窄屏锁定构图回归：frame 全靠 cqw 定尺寸，竖屏会缩成邮票——
  // 必须有 @container 窄屏规则覆盖 .gt-mark 方框与 .gt-wordmark 字标。
  const narrow = /@container\s*\(max-width:\s*720px\)\s*\{([\s\S]*?)\n\}/.exec(
    css,
  );
  assert.ok(narrow, 'frame transition needs a narrow-container override');
  for (const sel of ['.gt-mark', '.gt-wordmark', '.gt-corner'])
    assert.ok(
      narrow[1].includes(sel),
      `narrow-container override must restyle ${sel}`,
    );
  console.log('PASS frame: narrow container overrides the locked composition');
}
console.log(
  'Game transition invariant checks passed (push, frame, bands, convoy, deal, folio, match).',
);

// 钉幕门控（096）：holdGate 关闭时 match 纸幕盖满后钉在 exitStart 不扫出、
// phase 保持 entry、层打 data-gt-hold；开门后才进 exit 并接原生扫出——
// 「下一题」纸幕等的是新竞技场双侧作品就绪，牌面本身就是加载屏
{
  tracks = [];
  let coveredCount = 0,
    finishedCount = 0;
  let gateOpen = false;
  const run = createGameTransition('match', {
    holdGate: () => gateOpen,
    onCovered: () => coveredCount++,
    onFinish: () => finishedCount++,
  });
  run.play();
  step(0);
  let limit = browserStamp + 20000;
  while (coveredCount === 0 && browserStamp < limit) step(browserStamp + 16);
  assert.equal(coveredCount, 1, 'cover still commits the route swap');
  limit = browserStamp + 20000;
  while (tracks[0].currentTime < run.timing.exitStart && browserStamp < limit)
    step(browserStamp + 16);
  step(browserStamp + 16);
  assert.equal(
    tracks[0].currentTime,
    run.timing.exitStart,
    'closed gate pins the curtain at full cover',
  );
  assert.equal(
    run.layer.dataset.gtPhase,
    'entry',
    'held curtain is still in entry phase, not exiting',
  );
  assert.equal(run.layer.dataset.gtHold, '1');
  assert.equal(finishedCount, 0);
  gateOpen = true;
  // 释放时刻撞上 5s 主线程掉帧（2026-09-19 卡顿轮复现）：旧语义这一帧会把
  // 时间轴一把追到终态——扫出整段被吃、层瞬移除；帧时要求释放帧步长归零，
  // 且帧率没恢复前继续钉幕，连续正常帧才把扫出交原生
  step(browserStamp + 5000);
  assert.equal(
    finishedCount,
    0,
    'a stalled release frame must not consume the sweep',
  );
  assert.equal(
    tracks[0].currentTime,
    run.timing.exitStart,
    'the release frame steps zero from the pinned position',
  );
  assert.equal(
    run.layer.dataset.gtPhase,
    'entry',
    'stalled release keeps the curtain pinned until frames smooth out',
  );
  assert.equal(run.layer.dataset.gtHold, '1');
  assert.ok(
    tracks
      .filter((a) => a.owner.startsWith('gt-match-leaf'))
      .every((a) => !a.playing),
    'no sweep starts while the frame rate is starved',
  );
  step(browserStamp + 500);
  step(browserStamp + 500);
  assert.equal(run.layer.dataset.gtHold, '1', 'starved frames keep the pin');
  assert.equal(
    tracks[0].currentTime,
    run.timing.exitStart,
    'starved frames must not advance the sweep',
  );
  step(browserStamp + 16);
  step(browserStamp + 32);
  step(browserStamp + 48);
  assert.equal(
    run.layer.dataset.gtPhase,
    'exit',
    'smooth frames let the exit phase begin',
  );
  assert.ok(!run.layer.dataset.gtHold, 'hold mark clears once released');
  assert.ok(
    tracks
      .filter((a) => a.owner.startsWith('gt-match-leaf'))
      .every((a) => !a.playing),
    'the sweep is frame-time scrubbed from the pinned position',
  );
  assert.ok(
    tracks[0].currentTime < run.timing.exitStart + 50,
    'the sweep starts from the pinned position, not mid-way',
  );
  step(browserStamp + 250);
  assert.equal(finishedCount, 0, 'half-open leaves must remain mounted');
  limit = browserStamp + 5000;
  while (finishedCount === 0 && browserStamp < limit) step(browserStamp + 16);
  assert.equal(finishedCount, 1);
  console.log(
    'PASS match: holdGate pins the curtain at full cover until works are ready; a stalled release keeps the pin until frames recover, then sweeps whole in frame time',
  );
}

// Both menu transitions share a navigation lock; reduced motion releases it too.
window.location = { hash: '#play' };
guessNavigate();
guessNavigate();
convoyNavigate('#event');
assert.equal(document.body.children.length, 1);
step(0);
let limit = browserStamp + 20000;
while (window.location.hash === '#play' && browserStamp < limit)
  step(browserStamp + 16);
assert.equal(window.location.hash, '#guess');
limit = browserStamp + 20000;
while (document.body.children.length && browserStamp < limit)
  step(browserStamp + 16);
assert.equal(document.body.children.length, 0);
window.matchMedia = () => ({ matches: true });
window.location.hash = '#play';
guessNavigate();
assert.equal(window.location.hash, '#guess');
assert.equal(document.body.children.length, 0);
convoyNavigate('#event');
assert.equal(window.location.hash, '#event');
assert.equal(document.body.children.length, 0);
// 窄屏菜单进测评改走双页过场：matchMedia 命中 max-width 时
// convoyNavigate 不得再创建 convoy 斜幕轨道。
assert.ok(
  tracks.some((t) => t.owner?.startsWith('gt-match-leaf')),
  'narrow screens must route convoy navigation through the match leaves',
);
console.log(
  'PASS menu navigation: duplicate/cross-entry lock, covered routing, normal and reduced cleanup',
);

window.matchMedia = () => ({ matches: false });
window.location.hash = '#play';
tracks = [];
homeNavigate();
homeNavigate();
assert.equal(document.body.children.length, 1, 'home return must prevent duplicate curtains');
assert.equal(window.location.hash, '#play', 'return must wait until full coverage');
assert.equal(tracks[0].frames[0].transform, 'translateX(102%)', 'home return reverses the classic horizontal push');
assert.equal(tracks[0].frames.at(-1).transform, 'translateX(-102%)');
assert.equal(tracks.length, 1, 'home return carries only the simple color block');
const homeLimit = browserStamp + 20000;
while (window.location.hash !== '#home' && browserStamp < homeLimit) step(browserStamp + 16);
assert.equal(window.location.hash, '#home');
while (document.body.children.length && browserStamp < homeLimit) step(browserStamp + 16);
assert.equal(document.body.children.length, 0);
window.matchMedia = () => ({ matches: true });
window.location.hash = '#arena/005';
homeNavigate();
assert.equal(window.location.hash, '#home');
assert.equal(document.body.children.length, 0);
window.matchMedia = () => ({ matches: false });
console.log('PASS home return: reverse push, duplicate lock, covered routing, reduced cleanup');

for (const theme of ['paper', 'ink']) {
  const run = createGameTransition('folio', { direction: 'back', theme });
  const leaf = tracks.filter((t) => t.owner.startsWith('gt-folio-leaf ')).at(-1);
  assert.equal(leaf.frames[0].transform, theme === 'ink' ? 'translateY(-101%)' : 'translateX(102%)');
  assert.equal(leaf.frames.at(-1).transform, theme === 'ink' ? 'translateY(101%)' : 'translateX(-102%)');
  run.dispose();
  console.log(`PASS ${theme} folio: return direction reverses both entry and exit`);
}
