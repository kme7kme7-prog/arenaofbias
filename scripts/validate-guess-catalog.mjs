import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { GUESS_MODELS: models, modelById, sameClues, judge, answerForDate, dailyPool, poolForDifficulty, searchGuessModels, resolveGuess, validateExtraModels, registerExtraModels, catalogRevision } = await jiti.import('../lib/guess-logic.ts');
const byId = id => models.find(m => m.id === id);
assert.equal(byId('dots3-note-preview').priceTier, 0, 'user pins dots3 to near-free');
assert.equal(byId('dots3-note-preview').priceOut, null, 'gameplay tier does not invent an API quote');
assert.equal(judge(byId('dots3-note-preview'), byId('gpt-oss-20b')).attributes.priceTier.state, 'hit');
assert.equal(poolForDifficulty(models, 3).filter(m => m.priceTier === null).length, 0, 'hard pool has no unknown price clues');
// The price follow-up is model-specific evidence, not an inferred price for every open model.
const { priceReview } = JSON.parse(readFileSync(new URL('../docs/games/guess-catalog-review-20261016.json', import.meta.url), 'utf8'));
assert.equal(priceReview.corrections.length, priceReview.filledCount);
assert.equal(new Set(priceReview.corrections.map(entry => entry.id)).size, priceReview.filledCount);
for (const entry of priceReview.corrections) {
  assert.equal(byId(entry.id)?.priceOut, entry.after, entry.id);
  assert.equal(byId(entry.id)?.priceTier, entry.priceTier, entry.id);
  assert.ok(entry.after > 0 && entry.source.startsWith('https://') && entry.provider && entry.basis, entry.id);
}
assert.deepEqual(models.filter(m => m.priceOut === null).map(m => m.id).sort(), priceReview.remainingUnknown.map(m => m.id).sort());
assert.equal(priceReview.remainingUnknown.length, priceReview.remainingUnknownCount);
assert.equal(priceReview.previousUnknownCount - priceReview.filledCount, priceReview.remainingUnknownCount);
assert.equal(dailyPool(models).filter(m => m.priceOut === null).length, 0, 'daily and common pools have usable price clues');
assert.equal(judge(byId('gpt-oss-20b'), byId('gpt-oss-120b')).attributes.priceTier.state, 'near');
assert.equal(judge(byId('gpt-oss-20b'), byId('gpt-oss-120b')).attributes.priceTier.arrow, 'up');
assert.equal(judge(byId('gpt-oss-120b'), byId('gpt-3')).attributes.priceTier.state, 'unknown');
assert.equal(byId('gpt-5-5').priceOut, 30);
assert.equal(byId('gpt-5-5-pro').priceOut, 180);
assert.equal(byId('gpt-5-5').priceTier, 4);
assert.equal(byId('gpt-5-5-pro').priceTier, 5);
assert.equal(judge(byId('gpt-5-5'), byId('gpt-5-5-pro')).won, false);
assert.equal(judge(byId('gpt-5-6-sol'), byId('gpt-5-6-terra')).won, true);
const { difficultyReview } = JSON.parse(readFileSync(new URL('../docs/games/guess-catalog-review-20261016.json', import.meta.url), 'utf8'));
assert.equal(models.length, 217, 'curation keeps every searchable ID');
assert.deepEqual([1,2,3,4].map(d => poolForDifficulty(models,d).length), [24,106,166,181]);
assert.deepEqual(dailyPool(models).map(m => m.id).sort(), difficultyReview.dailyIds);
for (const entry of difficultyReview.changes) {
  const actual = byId(entry.id);
  for (const [field, value] of Object.entries(entry.after)) assert.equal(actual[field], value, `${entry.id}.${field}`);
}
const automatic = poolForDifficulty(models,4);
assert.ok(automatic.every(m => m.contextK !== null && m.priceTier !== null), 'unknown clues are searchable, not answers');
assert.ok(dailyPool(models).length < poolForDifficulty(models,2).length, 'daily is separately curated');
for (const { representative, lookupOnly } of difficultyReview.identicalClueRepresentatives) {
  assert.equal(byId(representative).answerEligible, true);
  for (const id of lookupOnly) {
    assert.equal(byId(id).answerEligible, false);
    assert.equal(judge(byId(id), byId(representative)).won, true, `${id} remains a winning equivalent`);
    assert.ok(searchGuessModels(models,byId(id).name).some(m => m.id === id));
  }
}
for (let i=0;i<automatic.length;i++) for(let j=i+1;j<automatic.length;j++)
  assert.equal(sameClues(automatic[i],automatic[j]), false, `duplicate answers: ${automatic[i].id}/${automatic[j].id}`);
const model = byId('gpt-5-6-sol');
assert.equal(sameClues(model, { ...model, modalities: [...model.modalities].reverse() }), true);
assert.equal(sameClues(model, { ...model, contextK: null }), false);
assert.equal(sameClues({ ...model, contextK: null }, { ...model, contextK: null }), true);
for (const difficulty of [1,2,3,4]) assert.ok(!poolForDifficulty(models, difficulty).some(m => m.id === 'grok-4-20-multi-agent'));
assert.ok(searchGuessModels(models, 'Grok 4.20 Multi-Agent').length);
assert.equal(resolveGuess('千问3.8 Max').id, 'qwen3-8-max');
for (const query of ['千问', '通义', '智谱', '混元', '豆包', '阶跃', '小米', '文心']) assert.ok(searchGuessModels(models, query).length, query);
const pool = dailyPool(models).map(m => ({ ...m, sinceDay: undefined }));
const count = new Set(pool.map(m => m.groupId ?? m.id)).size;
const seen = new Set();
for (let day=0; day<count; day++) {
  const answer = answerForDate(new Date(Date.UTC(2026,8,13+day)), pool);
  seen.add(answer.groupId ?? answer.id);
}
assert.equal(seen.size, count, 'real daily pool covers every slot in one cycle');
const future = { ...pool[0], id:'future-variant', groupId: pool[0].groupId ?? pool[0].id, sinceDay: 1000 };
for(let day=0;day<1000;day+=13) {
  const date = new Date(Date.UTC(2026,8,13+day));
  assert.equal(answerForDate(date,pool).id,answerForDate(date,[future,...pool]).id, 'future variant cannot affect earlier answers');
}
assert.notEqual(catalogRevision(), catalogRevision(models.map(m => m === model ? { ...m, priceTier:5 } : m)));
const extra = {id:'test-new',name:'Test new',org:'OpenAI',year:2026,month:10,openWeights:false,contextK:1000,modality:'text',reasoning:true,priceOut:1,popularity:1,difficulty:2,sinceDay:100};
for(const bad of [{priceOut:-1},{priceTierOverride:0},{contextK:0},{year:NaN},{openWeights:'false'},{modality:'image'},{name:model.name},{id:model.id},{sinceDay:-1},{dailyEligible:'true'},{dailyEligible:true,difficulty:3},{dailyEligible:true,contextK:null},{dailyEligible:true,priceOut:null}]) assert.throws(()=>validateExtraModels({models:[{...extra,...bad}]}));
assert.throws(()=>validateExtraModels({models:[extra],vendorRegions:JSON.parse('{"__proto__":"CN"}')}));
validateExtraModels({models:[extra]});
const extras = [
  extra,
  {...extra,id:'test-incomplete',name:'Test incomplete',priceOut:null},
  {...extra,id:'test-daily',name:'Test daily',contextK:999,dailyEligible:true},
  {...extra,id:'test-equivalent',name:'Test equivalent'},
];
try {
  registerExtraModels({models:extras});
  assert.equal(modelById.get(extra.id).answerEligible,true);
  assert.equal(modelById.get(extra.id).dailyEligible,false,'new common models do not silently enter daily');
  assert.equal(modelById.get('test-incomplete').answerEligible,false);
  assert.equal(modelById.get('test-daily').dailyEligible,true);
  assert.equal(modelById.get('test-equivalent').answerEligible,false,'new equivalents do not take another answer slot');
  assert.equal(judge(modelById.get('test-equivalent'),modelById.get(extra.id)).won,true);
} finally {
  for(const {id} of extras) { const i=models.findIndex(m=>m.id===id);if(i>=0)models.splice(i,1);modelById.delete(id); }
}
console.log(`PASS catalogue rules, equivalent answers, six price bands, search, ${count}-slot daily coverage, future variants and extra-model validation`);
