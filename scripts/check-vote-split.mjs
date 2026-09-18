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
assert.match(globalCssSource, /animation: round-intro 0\.9s/);
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
assert.match(pageSource, /state\.phase === 'intro' && state\.run === 0/);
assert.match(pageSource, /state\.run === 0 \? ARENA_TIMING\.introLead/);
// 开场牌等路由过场层离场后才挂载；逐个巡览可开关，关闭即跳过 A/B 聚焦
assert.match(
  pageSource,
  /document\.querySelector(<HTMLElement>)?\(\s*'\.game-transition, \.page-wipe'/,
);
assert.match(pageSource, /state\.run === 0 && arrivalReady/);
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
// 双方作品就绪门控：大体量作品加载完才解锁投票（上限兜底，失败不锁死入口）
const worksLoadCap = Number(
  /worksLoadCap: (\d+),/.exec(pageSource)?.[1] ?? 0,
);
assert.ok(worksLoadCap >= 4000 && worksLoadCap <= 15000, 'worksLoadCap 须在 4–15 秒');
assert.match(pageSource, /const workReady = \(card: HTMLElement \| null\): boolean =>/);
assert.match(
  pageSource,
  /workReady\(cardA\.current\) && workReady\(cardB\.current\)/,
);
assert.match(pageSource, /doc\.location\.href === 'about:blank'/);
// 就绪线是「DOM 解析完、脚本已执行」（非 loading），不是等全部资源 complete
assert.match(pageSource, /doc\.readyState === 'loading'\) return false/);
assert.doesNotMatch(pageSource, /readyState === 'complete'/);
// 探针握手：注入 data-aob-probe 的作品要等渲染循环首帧 postMessage 才放行
assert.match(pageSource, /event\.data === 'aob:work-ready'/);
assert.match(pageSource, /readyWindows\.current\.add\(event\.source as Window\)/);
assert.match(pageSource, /doc\.querySelector\('script\[data-aob-probe\]'\)/);
assert.match(pageSource, /readyWindows\.current\.has\(frame\.contentWindow\)/);
// 等待期藏作品区（works-hold），就绪后统一揭幕（works-reveal），入场编排在作品可见后才开演
assert.match(pageSource, /const \[worksSettled, setWorksSettled\] = useState\(false\)/);
assert.match(
  pageSource,
  /works-hold'| : worksSettled\s*\?\s*' works-reveal'/,
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
// 门控与开场牌等待并行（不多花时间）；reduced-motion 路径同样门控
assert.match(
  pageSource,
  /await Promise\.all\(\[\s*delay\(\s*state\.run === 0 \? ARENA_TIMING\.introLead : ARENA_TIMING\.introReplayLead,\s*signal,\s*\),\s*waitWorksLoaded\(signal\),\s*\]\)/,
);
assert.match(
  pageSource,
  /if \(reducedMotion\) \{[\s\S]{0,120}?waitWorksLoaded\(signal\)[\s\S]{0,60}?dispatch\(\{ type: 'READY' \}\)/,
);
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
  'PASS current pair only; side reversal; draws separate; duplicate IDs; empty and unanimous votes; ordered 6.0s first intro, 5.2s replay, tour toggle and result handoff',
);
