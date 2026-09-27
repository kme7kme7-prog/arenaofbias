import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/vote-split.ts', import.meta.url),
  'utf8',
);
const componentSource = await readFile(
  new URL('../components/vote-split.tsx', import.meta.url),
  'utf8',
);
const pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(
  new URL('../app/arena-refinement.css', import.meta.url),
  'utf8',
);
const globalCssSource = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { summarizePairVotes } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const vote = (id, winnerRid, loserRid, outcome = 'win', promptId = '003') => ({
  id,
  winnerRid,
  loserRid,
  outcome,
  promptId,
});
const votes = [
  vote('1', 'luna', 'orbit'),
  vote('2', 'orbit', 'luna'),
  vote('3', 'luna', 'orbit'),
  vote('4', 'orbit', 'luna', 'draw'),
  vote('5', 'luna', 'orbit', 'draw'),
  vote('6', 'luna', 'third'),
  vote('7', 'luna', 'orbit', 'win', '004'),
  vote('1', 'luna', 'orbit'),
  { ...vote('formal', 'luna', 'orbit'), mode: 'formal' },
];
assert.deepEqual(summarizePairVotes(votes, '003', 'luna', 'orbit'), {
  left: 2,
  right: 1,
  draw: 2,
});
assert.deepEqual(summarizePairVotes(votes, '003', 'orbit', 'luna'), {
  left: 1,
  right: 2,
  draw: 2,
});
assert.deepEqual(summarizePairVotes([], '003', 'luna', 'orbit'), {
  left: 0,
  right: 0,
  draw: 0,
});
assert.deepEqual(
  summarizePairVotes(
    [vote('d', 'luna', 'orbit', 'draw')],
    '003',
    'luna',
    'orbit',
  ),
  { left: 0, right: 0, draw: 1 },
);
assert.deepEqual(
  summarizePairVotes([vote('w', 'luna', 'orbit')], '003', 'luna', 'orbit'),
  { left: 1, right: 0, draw: 0 },
);
assert.match(componentSource, /setLeaving\(true\), 1200/);
assert.match(componentSource, /setDismissed\(true\), 1450/);
assert.match(componentSource, /if \(dismissed\) return null/);
assert.match(componentSource, /is-pending/);
assert.match(componentSource, /is-leaving/);
assert.match(
  pageSource,
  /state\.phase === 'locking' \|\| state\.phase === 'result'[\s\S]{0,300}<AudienceVerdict/,
);
assert.match(pageSource, /reducedMotion \? 80 : ARENA_TIMING\.resultReveal/);
assert.match(pageSource, /scrollable\.scrollHeight - scrollable\.clientHeight > 1/);
assert.doesNotMatch(pageSource, /await animation\.finished/);
assert.match(globalCssSource, /@keyframes vote-pending/);
assert.match(globalCssSource, /@keyframes overlay-clear/);
const timing = Object.fromEntries(
  [...pageSource.matchAll(/^  (intro\w+|resultReveal): (\d+),$/gm)].map((match) => [
    match[1],
    Number(match[2]),
  ]),
);
const introPairDuration =
  2 *
  (timing.introFocus +
    timing.introStaticHold +
    timing.introReturn +
    timing.introGap);
assert.equal(
  timing.introLead + introPairDuration + timing.introSettle,
  6000,
);
assert.equal(
  timing.introReplayLead + introPairDuration + timing.introSettle,
  5220,
);
// 开场牌横幅按用户要求整块下线（决策 095）：不得再以任何形式挂回舞台
assert.doesNotMatch(pageSource, /intro-label/);
assert.doesNotMatch(globalCssSource, /\.intro-label|@keyframes round-intro/);
// 揭幕段从 introLead 余量里扣：快加载路径仍精确落在既有 6.0s / 5.2s 节拍
assert.ok(timing.introRevealHold <= timing.introLead);
// 揭幕等路由过场层离场后才开演；逐个巡览可开关，关闭即跳过 A/B 聚焦
assert.match(
  pageSource,
  /document\.querySelector(<HTMLElement>)?\(\s*'\.game-transition, \.page-wipe'/,
);
assert.match(pageSource, /aob-arena-tour/);
// 巡览开关桌面默认关（090）：只有显式 'on' 才开；移动端整体下线
assert.match(
  pageSource,
  /localStorage\.getItem\('aob-arena-tour'\) === 'on'/,
);
assert.match(
  pageSource,
  /if \(!tour \|\| window\.innerWidth < 700\) \{\s*dispatch\(\{ type: 'READY' \}\)/,
);
// 双方作品就绪门控：死等完全就绪才展开，超时不再强行揭幕、只给跳过出口（095）
const worksSkipAt = Number(/worksSkipAt: (\d+),/.exec(pageSource)?.[1] ?? 0);
assert.ok(worksSkipAt >= 4000 && worksSkipAt <= 15000, 'worksSkipAt 须在 4–15 秒');
assert.doesNotMatch(pageSource, /worksLoadCap/);
assert.match(pageSource, /const workReady = \(card: HTMLElement \| null\): boolean =>/);
assert.match(pageSource, /const a = workReady\(cardA\.current\);/);
assert.match(pageSource, /const b = workReady\(cardB\.current\);/);
assert.match(pageSource, /while \(!poll\(\)\) await delay\(60, abort\);/);
assert.match(pageSource, /doc\.location\.href === 'about:blank'/);
// 就绪线是「DOM 解析完、脚本已执行」（非 loading），不是等全部资源 complete
assert.match(pageSource, /doc\.readyState === 'loading'\) return false/);
assert.doesNotMatch(pageSource, /readyState === 'complete'/);
// 探针握手：注入 data-aob-probe 的作品要等渲染循环首帧 postMessage 才放行
assert.match(pageSource, /event\.data === 'aob:work-ready'/);
assert.match(pageSource, /readyWindows\.current\.add\(event\.source as Window\)/);
assert.match(pageSource, /doc\.querySelector\('script\[data-aob-probe\]'\)/);
assert.match(pageSource, /readyWindows\.current\.has\(frame\.contentWindow\)/);
// 等待期藏作品区（works-hold）并把投票条当逐侧进度条，就绪后统一揭幕（works-reveal）
assert.match(pageSource, /const \[worksSettled, setWorksSettled\] = useState\(false\)/);
assert.match(
  pageSource,
  /worksLoading \? 'works-hold' : worksSettled \? 'works-reveal'/,
);
assert.match(
  pageSource,
  /worksLoading && worksPendingBySide\[side\] \? 'is-pending'/,
);
assert.match(
  globalCssSource,
  /\.arena-shell\.works-hold \.work-panel \{\s*opacity: 0;/,
);
assert.match(globalCssSource, /@keyframes work-reveal/);
assert.match(
  globalCssSource,
  /\.arena-shell\.works-reveal \.work-panel \+\s*\.work-panel \{\s*animation-delay: 0\.08s;/,
);
assert.match(
  globalCssSource,
  /\.arena-shell\.works-hold \.vote-button\.is-pending::before \{/,
);
// works-hold 期间投票条禁过渡：基类 background .3s 会被 WebGL 压满的主线程拖住
assert.match(
  globalCssSource,
  /\.arena-shell\.works-hold \.vote-button \{[^}]*transition: none;/,
);
// 揭幕条件：过场层离场、作品完全就绪、既有节拍余量三者并行到齐，谁慢等谁
assert.match(
  pageSource,
  /await Promise\.all\(\[\s*waitRouteLayer\(signal\),\s*waitWorksLoaded\(signal\),\s*delay\(lead - revealHold, signal\),\s*\]\);/,
);
// 揭幕段一定播完才离开 intro；快加载仍补足 lead，慢加载只顺延不空等
assert.match(
  pageSource,
  /Math\.max\(revealHold, lead - \(performance\.now\(\) - leadStart\)\)/,
);
// 加载过场压到揭幕才收，收场时长由 CSS 承担，必须与 JS 常量成对
assert.match(
  pageSource,
  /loading-overlay \$\{worksSettled \? 'is-clearing' : ''\}/,
);
const clearCss =
  Number(
    /\.loading-overlay\.is-clearing \{\s*animation: overlay-clear ([\d.]+)s/.exec(
      globalCssSource,
    )?.[1],
  ) * 1000;
assert.equal(clearCss, timing.introRevealHold);
// 超时不替用户揭幕，只给出口
assert.match(
  pageSource,
  /worksStalled && \(\s*<button\s+type="button"\s+className="loading-skip"/,
);
assert.match(
  pageSource,
  /setTimeout\(\s*\(\) => \{\s*setWorksStalled\(true\);\s*\/\/ 卡死也放幕/,
);
// 「下一题」纸幕钉等作品就绪（096）：旧页布防 + holdGate 挂门 + 逐侧回写，
// 新页就绪/卡死/离开 intro 都放门——「正在接入试验场」整拍被纸幕吸收
assert.match(pageSource, /armWorksGate\(\);/);
assert.match(pageSource, /holdGate: worksGateOpen,/);
assert.match(pageSource, /if \(!worksGateOpen\(\)\) return;/);
assert.match(pageSource, /worksGateSides\(\)/);
assert.match(pageSource, /toggleAttribute\('data-gt-a', sides\.a\)/);
assert.match(pageSource, /toggleAttribute\('data-gt-b', sides\.b\)/);
assert.match(pageSource, /if \(a\) reportWorkReady\('a'\);/);
assert.match(pageSource, /if \(b\) reportWorkReady\('b'\);/);
assert.match(
  pageSource,
  /while \(!poll\(\)\) await delay\(60, abort\);\s*\/\/ 双侧就绪：放「下一题」纸幕扫出[\s\S]{0,80}?releaseWorksGate\(\);/,
);
const gateSource = await readFile(
  new URL('../lib/works-gate.ts', import.meta.url),
  'utf8',
);
// 门必须有兜底超时：新页没 mount 上也不许留死幕
assert.match(
  gateSource,
  /performance\.now\(\) - armedAt > FAILSAFE_MS/,
);
// 牌面 duel 连线当逐侧进度条：该侧就绪即填成队色（096）
const transitionCss = await readFile(
  new URL('../app/game-transitions.css', import.meta.url),
  'utf8',
);
assert.match(
  transitionCss,
  /\.game-transition\[data-gt-a\] \.gt-match-link-a::after/,
);
assert.match(
  transitionCss,
  /\.game-transition\[data-gt-hold\] \.gt-match-holdnote/,
);
assert.match(
  pageSource,
  /if \(reducedMotion\) \{[\s\S]{0,120}?waitWorksLoaded\(signal\)[\s\S]{0,60}?dispatch\(\{ type: 'READY' \}\)/,
);
// 入场统一钉幕（2026-09-19）：玩法菜单 / 首页随机入场 / 题库 / 事件页进竞技场
// 都走 enterArena（整屏纸幕钉住当加载中间态），不再斜幕 / 横扫 / 裸锚点直跳
assert.match(gateSource, /export function enterArena\(/);
const entrySources = await Promise.all(
  ['play-menu.tsx', 'home.tsx', 'prompt-library.tsx', 'event.tsx'].map((name) =>
    readFile(new URL(`../app/${name}`, import.meta.url), 'utf8'),
  ),
);
for (const source of entrySources) assert.match(source, /enterArena\(/);
const playMenuSource = entrySources[0];
const homeSource = entrySources[1];
// 菜单的 convoy 只留给事件页；测评入口不再斜幕直扫
assert.match(playMenuSource, /convoyNavigate\('#event', mode\.code\)/);
assert.doesNotMatch(playMenuSource, /convoyNavigate\(hash, mode\.code\)/);
// 首页随机入场不再走页面横扫
assert.doesNotMatch(homeSource, /wipeNavigate\(/);
// 掉帧冻结不跳段（2026-09-19）：换题纸条与过场引擎同一条帧时规矩——
// 推进按帧间隔封顶累计（饱和掉帧原地冻、恢复续播），不许按墙钟一把追到终态；
// 揭幕等纸幕真进扫出段才起，钉幕等作品那几秒不在幕布后面空播文字揭条
const maskSource = await readFile(
  new URL('../lib/text-swap-mask.ts', import.meta.url),
  'utf8',
);
assert.match(maskSource, /const FRAME_STEP_CAP = 100;/);
assert.match(maskSource, /elapsed \+= Math\.min\(nowMs - last, FRAME_STEP_CAP\)/);
assert.doesNotMatch(maskSource, /now - this\.started/);
assert.match(maskSource, /layer\.dataset\.gtPhase !== 'exit'/);
assert.ok(1200 < timing.resultReveal && timing.resultReveal < 1450);
const resultDelays = [
  /phase-result \.side-result \{ animation: text-enter \.4s ([\d.]+)s/.exec(cssSource),
  /phase-result \.reaction-bar \{ animation: text-enter \.45s ([\d.]+)s/.exec(cssSource),
  /\.prompt-recall \{ animation: text-enter \.45s ([\d.]+)s/.exec(cssSource),
  /\.round-console\.show-result \{ animation: text-enter \.48s ([\d.]+)s/.exec(cssSource),
  /\.afterparty-reveal \{ animation: channel-unfold \.65s ([\d.]+)s/.exec(cssSource),
].map((match) => Number(match?.[1]));
assert.ok(resultDelays.every(Number.isFinite));
assert.ok(resultDelays.every((delay, index) => !index || delay > resultDelays[index - 1]));
console.log(
  'PASS current pair only; side reversal; draws separate; duplicate IDs; empty and unanimous votes; ordered 6.0s first intro, 5.2s replay, tour toggle and result handoff; no banner — reveal waits for full load, stall only offers a skip',
);
