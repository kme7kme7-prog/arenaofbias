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
  /document\.querySelector\('\.game-transition, \.page-wipe'\)/,
);
assert.match(pageSource, /state\.run === 0 && arrivalReady/);
assert.match(pageSource, /aob-arena-tour/);
assert.match(pageSource, /if \(!tour\) \{\s*dispatch\(\{ type: 'READY' \}\)/);
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
