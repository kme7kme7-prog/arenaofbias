import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/arena.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  arenaReducer: reduce,
  initialState,
  rounds,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let tests = 0;
function check(name, test) {
  test();
  tests++;
  console.log(`PASS ${name}`);
}
const intro = reduce(initialState, { type: 'LOADED' });
const voting = reduce(intro, { type: 'READY' });
const locked = reduce(voting, { type: 'VOTE', side: 'a' });

check(
  'Voting is blocked while loading and during the entrance sequence',
  () => {
    assert.equal(
      reduce(initialState, { type: 'VOTE', side: 'a' }),
      initialState,
    );
    assert.equal(reduce(intro, { type: 'VOTE', side: 'a' }), intro);
  },
);
check('Completing or skipping the entrance unlocks voting exactly once', () => {
  assert.equal(voting.phase, 'voting');
  assert.equal(reduce(voting, { type: 'READY' }), voting);
});
check('Rapid opposite-side clicks cannot change a locked vote', () => {
  assert.equal(locked.choice, 'a');
  assert.equal(reduce(locked, { type: 'VOTE', side: 'b' }), locked);
});
check('Reveal requires a locked choice and preserves it', () => {
  assert.equal(reduce(intro, { type: 'REVEAL' }), intro);
  const result = reduce(locked, { type: 'REVEAL' });
  assert.equal(result.phase, 'result');
  assert.equal(result.choice, 'a');
});
check(
  'Switching during a reveal cancels the stale reveal and starts a clean round',
  () => {
    const switching = reduce(locked, { type: 'SWITCH', round: 2 });
    assert.equal(reduce(switching, { type: 'REVEAL' }), switching);
    assert.equal(reduce(switching, { type: 'SWITCH', round: 1 }), switching);
    const next = reduce(switching, { type: 'ARRIVE' });
    assert.equal(next.round, 2);
    assert.equal(next.choice, null);
    assert.equal(next.phase, 'intro');
    assert.equal(next.run, 1);
  },
);
check(
  'Replaying clears the previous result and restarts the same encounter',
  () => {
    const result = reduce(locked, { type: 'REVEAL' });
    const replay = reduce(reduce(result, { type: 'REPLAY' }), {
      type: 'ARRIVE',
    });
    assert.equal(replay.round, 0);
    assert.equal(replay.choice, null);
    assert.equal(replay.phase, 'intro');
  },
);
check('Mode changes use the transition and clear a previous vote', () => {
  const changed = reduce(locked, { type: 'MODE', mode: 'party' });
  assert.equal(changed.phase, 'transition');
  assert.equal(changed.mode, 'party');
  const fresh = reduce(changed, { type: 'ARRIVE' });
  assert.equal(fresh.choice, null);
  assert.equal(fresh.mode, 'party');
});
check(
  'All three encounter choices are reachable; invalid indexes are ignored',
  () => {
    for (let index = 0; index < rounds.length; index++) {
      const next = reduce(reduce(voting, { type: 'SWITCH', round: index }), {
        type: 'ARRIVE',
      });
      assert.equal(next.round, index);
    }
    assert.equal(reduce(voting, { type: 'SWITCH', round: -1 }), voting);
    assert.equal(reduce(voting, { type: 'SWITCH', round: 3 }), voting);
  },
);
for (const name of ['signal-a.webp', 'signal-b.webp', 'lunar.webp']) {
  const file = new URL(`../public/art/${name}`, import.meta.url);
  const details = await stat(file);
  assert.ok(
    details.size > 10000 && details.size < 500000,
    `${name} must be a real, optimized asset`,
  );
}
console.log(
  `${tests} interaction-state checks passed; all 3 artwork assets present and under 500 KB each.`,
);
