import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/game-transitions.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { createGameTransition, guessNavigate, convoyNavigate } = await import(
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
const fakeDocument = { body: element(), createElement: element };
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
for (const kind of ['frame', 'bands', 'convoy', 'deal', 'folio', 'match']) {
  tracks = [];
  let covered = 0,
    finished = 0;
  const run = createGameTransition(kind, {
    onCovered: () => covered++,
    onFinish: () => finished++,
  });
  assert.equal(run.layer.parent, document.body);
  assert.equal(run.layer['aria-hidden'], 'true');
  if (kind === 'match') {
    const leaves = tracks.filter((t) => t.owner?.startsWith('gt-match-leaf '));
    assert.equal(leaves.length, 2);
    for (const leaf of leaves) {
      assert.equal(leaf.frames[1].transform, 'translate(0, 0)');
      assert.equal(leaf.frames[2].transform, 'translate(0, 0)');
      assert.equal(leaf.frames[1].offset, run.timing.covered / run.timing.duration);
      assert.equal(leaf.frames[2].offset, run.timing.exitStart / run.timing.duration);
    }
    assert.ok(leaves[0].frames.at(-1).transform.includes('-101%'));
    assert.ok(leaves[1].frames.at(-1).transform.includes('101%'));
    assert.equal(run.timing.duration, 1260);
    // 阶段标记（089）：exitStart 前 entry、之后 exit，开场牌门控据此提前接入
    run.seek(run.timing.exitStart - 1);
    assert.equal(run.layer.dataset.gtPhase, 'entry');
    run.seek(run.timing.exitStart);
    assert.equal(
      run.layer.dataset.gtPhase,
      'exit',
      'layer must mark the exit phase for gate consumers',
    );
    console.log('PASS match: two opaque leaves hold coverage until coordinated opening');
  } else if (kind === 'bands') {
    const field = tracks.find((t) => t.owner === 'gt-ink-field');
    const bands = tracks.filter((t) => t.owner?.startsWith('gt-band gt-band-'));
    assert.ok(field, 'the ink field must own route coverage');
    assert.equal(
      bands.length,
      3,
      'three independent diagonal ribbons are required',
    );
    assert.ok(bands.every((band) => band.frames.length === 4));
    assert.ok(
      bands.every((band) => band.frames[1].transform === 'translateX(0)'),
      'ribbons must align briefly in the center before separating',
    );
    assert.equal(
      field.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    console.log(
      'PASS ink field covers the route while three diagonal ribbons cross',
    );
  } else if (kind === 'folio') {
    const leaf = tracks.find((t) => t.owner === 'gt-folio-leaf');
    assert.equal(leaf.frames[1].transform, 'translateX(0)');
    assert.equal(
      leaf.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    assert.equal(
      leaf.frames[2].offset,
      run.timing.exitStart / run.timing.duration,
    );
    assert.ok(run.timing.duration < 650);
  } else if (kind === 'deal') {
    const shell = tracks.find((t) => t.owner === 'gt-deal-shell');
    const seal = tracks.find((t) => t.owner === 'gt-deal-seal');
    assert.equal(seal.frames.at(-1).opacity, 0);
    assert.equal(
      seal.options.delay + seal.options.duration,
      run.timing.covered,
      'opening frame decoration must disappear before the later scene',
    );
    const sheen = tracks.find((t) => t.owner === 'gt-deal-sheen');
    assert.equal(sheen.frames[0].opacity, 0);
    assert.equal(sheen.frames.at(-1).opacity, 0);
    assert.ok(
      sheen.options.delay + sheen.options.duration <=
        run.timing.exitStart + 150,
      'material highlight must finish with the card content',
    );
    assert.equal(
      shell.frames.at(-1).transform,
      'translateY(0) rotate(0deg) scale(1)',
    );
    assert.equal(shell.options.duration, run.timing.covered);
    const halves = tracks.filter((t) => t.owner?.startsWith('gt-deal-half '));
    assert.equal(halves.length, 2);
    assert.ok(halves.every((t) => t.options.delay === run.timing.exitStart));
    assert.equal(tracks.filter((t) => t.owner === 'gt-deal-clue').length, 7);
    console.log(
      'PASS deal: opaque card covers before routing, two halves hold until exit, seven clues',
    );
  } else if (kind === 'convoy') {
    const convoy = tracks.filter((t) => t.owner === 'gt-convoy');
    assert.equal(convoy.length, 1, 'colored sheets share one motion clock');
    const motion = convoy[0];
    assert.equal(motion.options.duration, run.timing.duration);
    assert.deepEqual(
      motion.frames.map((frame) => frame.transform),
      [
        'translateX(-110%)',
        'translateX(0%)',
        'translateX(3%)',
        'translateX(110%)',
      ],
      'assembly always advances, including the covered interval',
    );
    assert.equal(
      motion.frames[1].offset,
      run.timing.covered / run.timing.duration,
    );
    console.log('PASS integrated diagonal curtain owns full coverage');
  } else {
    const veil = tracks.find((t) => t.owner === 'gt-veil');
    assert.ok(veil.frames.every((f) => 'transform' in f && !('opacity' in f)));
    assert.equal(
      veil.options.delay + veil.options.duration,
      run.timing.covered,
    );
    console.log('PASS opaque paper finishes covering at the navigation gate');
  }
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
// 层选择器隔离（2026-09-13 回归）：过场层本身 class 就带 gt-<kind>，
// CSS 里任何不带 .game-transition 前缀的裸 .gt-<kind> 规则都会命中层自身——
// 曾把层从 fixed 变成 absolute 并被撑到 2800px 宽，导致标题巨大、切页后页面从底部漏出。
{
  const css = await readFile(
    new URL('../app/game-transitions.css', import.meta.url),
    'utf8',
  );
  for (const kind of ['frame', 'bands', 'convoy', 'deal', 'folio', 'match']) {
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
  'Game transition invariant checks passed (frame, bands, convoy, deal, folio, match).',
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

{
  const run = createGameTransition('folio', { direction: 'back' });
  const leaf = tracks.filter((t) => t.owner === 'gt-folio-leaf').at(-1);
  assert.equal(leaf.frames[0].transform, 'translateX(-102%)');
  assert.equal(leaf.frames.at(-1).transform, 'translateX(102%)');
  run.dispose();
  console.log('PASS folio: return direction reverses both entry and exit');
}
