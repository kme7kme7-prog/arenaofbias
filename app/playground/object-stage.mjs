import { loadObjectCatalog } from './object-catalog';
import { SceneTimeline, acceptChoice, unpackBeats, packBeats, arrivalBeats, parcelLabelBeats } from './object-stage-motion.mjs';
import { RoundDeck } from './object-stage-rounds.mjs';
import { playgroundNavigate } from '../../lib/playground-entry';

document.querySelector('.brand').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault(); playgroundNavigate('/#play', true);
});

const $ = selector => document.querySelector(selector);
const timeline = new SceneTimeline();
const rounds = new RoundDeck();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let data;
let topic;
let entries = [];
let phase = 'arriving';
let focused = null;
let slowTimer;
let touched = false;
let choiceCount = 0;
let guideSeen = false;
let pendingScene = null;
let packing = false;
const detailTracks = new Set();
const reviewMode = new URLSearchParams(location.search).get('motion-review');
const motionReview = ['1', 'rounds', 'entry'].includes(reviewMode);
const presentationOverride = new URLSearchParams(location.search).get('presentation');
function presentationFor() {
  if (['window', 'case'].includes(presentationOverride)) return presentationOverride;
  return 'window';
}
function animateDetail(element, frames, duration = 260) {
  if (!element || reduced.matches) return;
  const track = element.animate(frames, { duration, easing: 'cubic-bezier(.22,.72,.2,1)' });
  detailTracks.add(track);
  void track.finished.catch(() => {}).then(() => { track.cancel(); detailTracks.delete(track); });
}
function clearDetails() { for (const track of detailTracks) track.cancel(); detailTracks.clear(); }
function hideDragCue() { for (const entry of entries) entry.node.querySelector('.drag-cue').hidden = true; }
function showHelp(show) {
  $('#help-card').hidden = !show;
  $('#help').setAttribute('aria-expanded', String(show));
  if (show) animateDetail($('#help-card'), [{ opacity: 0, transform: 'translateY(-6px) rotate(-2deg)' }, { opacity: 1, transform: 'translateY(0) rotate(1deg)' }]);
}
try { guideSeen = localStorage.getItem('aob-object-stage-guided') === 'yes'; } catch { /* Storage is optional in this review. */ }
function setPhase(value) {
  phase = value;
  document.body.dataset.phase = value;
  const exploring = value === 'exploring';
  for (const entry of entries) {
    entry.node.querySelector('.choose-button').disabled = !exploring;
    entry.node.querySelector('.focus-view').disabled = !entry.ready || !['exploring', 'revealed'].includes(value);
    entry.node.querySelector('.reset-view').disabled = !entry.cameraReady || !['exploring', 'revealed'].includes(value);
  }
  $('#tie').disabled = !exploring;
  $('#next').disabled = !['exploring', 'revealed'].includes(value);
  $('#continue').disabled = !['exploring', 'revealed'].includes(value);
  $('#replay').disabled = !['exploring', 'revealed'].includes(value);
  $('#exhibits').setAttribute('aria-busy', String(['arriving', 'loading', 'leaving', 'entering'].includes(value)));
}
function tell(text) { $('#announcement').textContent = text; }
function guide(text, dismissible = false) {
  $('#guide').hidden = false;
  $('#guide-text').textContent = text;
  $('#dismiss-guide').hidden = !dismissible;
}
function rememberGuide() {
  guideSeen = true;
  try { localStorage.setItem('aob-object-stage-guided', 'yes'); } catch { /* Optional preference. */ }
}
function post(entry, stage, extra = {}) { entry.iframe?.contentWindow?.postMessage({ stage, ...extra }, entry.work.origin); }
function refreshActivity() {
  for (const entry of entries) post(entry, 'active', { value: !document.hidden && (!focused || focused === entry) });
}
function closeFocus() {
  if (!focused) return;
  clearDetails();
  const previous = focused;
  previous.node.classList.remove('is-focused');
  previous.node.querySelector('.focus-view').setAttribute('aria-label', '拿近看看');
  focused = null;
  $('#focus-backdrop').hidden = true;
  for (const entry of entries) entry.node.inert = false;
  document.querySelector('.site-header').inert = false;
  for (const selector of ['.scene-heading', '.scene-footer', '.result', '.round-actions', '.page-footer']) $(selector).inert = false;
  refreshActivity();
  previous.node.querySelector('.focus-view').focus({ preventScroll: true });
}
function focus(entry) {
  if (!['exploring', 'revealed'].includes(phase)) return;
  if (focused === entry) { closeFocus(); return; }
  closeFocus();
  focused = entry;
  entry.node.classList.add('is-focused');
  entry.node.querySelector('.focus-view').setAttribute('aria-label', '放回展台');
  $('#focus-backdrop').hidden = false;
  for (const other of entries) other.node.inert = other !== entry;
  document.querySelector('.site-header').inert = true;
  for (const selector of ['.scene-heading', '.scene-footer', '.result', '.round-actions', '.page-footer']) $(selector).inert = true;
  refreshActivity();
  // Cover the rearranged grid immediately: a translucent crossfade exposes the
  // other iframe jumping columns when this article becomes fixed.
  animateDetail(entry.node, [{ transform: 'translateY(12px) scale(.98)' }, { transform: 'translateY(0) scale(1)' }], 250);
}
function makeExhibit(work, index, revision) {
  const side = index === 0 ? 'a' : 'b';
  const node = $('#exhibit-template').content.firstElementChild.cloneNode(true);
  node.dataset.side = side;
  node.dataset.presentation = presentationFor();
  node.setAttribute('aria-label', `${side.toUpperCase()} 作品`);
  node.querySelector('.side-label').textContent = side.toUpperCase();
  node.querySelector('.case-number').textContent = `0${index + 1}`;
  node.querySelector('.parcel-letter').textContent = side.toUpperCase();
  node.querySelector('.parcel-topic').textContent = topic.name;
  const entry = { node, work, iframe: null, side, ready: false, loaded: false, rendered: false, cameraReady: false, cameraSettled: false, revision };
  node.querySelector('.choose-button').setAttribute('aria-label', `选择 ${side.toUpperCase()} 作品`);
  node.querySelector('.choose-button').addEventListener('click', () => choose(side));
  node.querySelector('.reset-view').addEventListener('click', () => {
    post(entry, 'reset');
    animateDetail(node.querySelector('.reset-view svg'), [{ transform: 'rotate(-180deg)' }, { transform: 'rotate(0)' }], 300);
  });
  node.querySelector('.focus-view').addEventListener('click', () => focus(entry));
  node.querySelector('.retry-button').addEventListener('click', () => loadTopic(topic.id, 'retry'));
  return entry;
}
function resetLabel(entry, revision) {
  entry.revision = revision;
  delete entry.node.dataset.picked; delete entry.node.dataset.revealed;
  entry.node.querySelector('.model-name').textContent = '匿名作品';
  entry.node.querySelector('.identity-note').textContent = '选择后揭晓作者';
  entry.node.querySelector('.side-label').hidden = false;
  entry.node.querySelector('.model-icon').hidden = true;
  entry.node.querySelector('.model-monogram').hidden = true;
  entry.node.querySelector('.choose-button').firstElementChild.textContent = '这件合我心意';
  entry.node.querySelector('.retry-button').hidden = true;
}
function printParcelTopic(name) {
  for (const entry of entries) entry.node.querySelector('.parcel-topic').textContent = name;
}
async function retagParcels(name, revision) {
  document.body.dataset.labeling = 'true';
  // The CSS underlay also hides the cards at the exact text mutation, between
  // the two finite tracks; cancelling a WAAPI fill cannot expose the old label.
  try {
    if (!await timeline.play(parcelLabelBeats(entries, false), revision, reduced.matches)) return false;
    printParcelTopic(name);
    return await timeline.play(parcelLabelBeats(entries, true), revision, reduced.matches);
  } finally { delete document.body.dataset.labeling; }
}
function mountWork(entry, work, revision) {
  Object.assign(entry, { work, revision, ready: false, loaded: false, rendered: false, cameraReady: false, cameraSettled: false });
  entry.node.dataset.ready = 'false';
  entry.node.querySelector('.load-text').textContent = '正在装箱';
  const iframe = document.createElement('iframe');
  iframe.title = `${entry.side.toUpperCase()} 可拖动的${topic.name}`;
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.addEventListener('load', refreshActivity);
  entry.iframe = iframe;
  iframe.src = work.src;
  entry.node.querySelector('.frame-mount').append(iframe);
}
async function enter(revision) {
  if (phase !== 'loading' || revision !== timeline.revision || !entries.every(entry => entry.ready)) return;
  clearTimeout(slowTimer);
  setPhase('entering');
  $('#delivery-status').textContent = '拆封中';
  $('#guide').hidden = true;
  $('#skip-load').hidden = true;
  const arrival = timeline.play(unpackBeats(entries), revision, reduced.matches);
  if (motionReview && !reduced.matches) timeline.pause();
  if (!await arrival) return;
  if (pendingScene) { setPhase('exploring'); void replaceScene(); return; }
  setPhase('exploring');
  $('#delivery-status').textContent = '已拆封 · 随意看看';
  const movable = entries.find(entry => entry.cameraReady);
  guide(movable ? '拖动旋转 · 滚轮缩放 · 拿近看看' : '拿近看看，选一件合眼缘的。', !guideSeen);
  if (!guideSeen && movable) {
    const cue = movable.node.querySelector('.drag-cue'); cue.hidden = false;
    animateDetail(cue, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: .9, transform: 'translateY(0)' }]);
    animateDetail(cue.querySelector('.cue-hand'), [{ transform: 'translateX(-9px)' }, { transform: 'translateX(9px)', offset: .65 }, { transform: 'translateX(0)' }], 900);
  }
  tell('两件作品准备好了，可以查看并选择喜欢的一件。');
}
function loadTopic(id, mode = 'next') {
  if (!data) return;
  const nextTopic = data.topics.find(item => item.id === id || item.promptId === id);
  if (!nextTopic) {
    if (!entries.length) { $('.stage-entry-cover')?.remove(); setPhase('error'); $('#topic-title').textContent = '选择一道题'; }
    guide('这道题暂未加入这里，打开「全部题目」选一题吧。');
    return;
  }
  if (nextTopic.eligible === false) {
    if (!entries.length) { $('.stage-entry-cover')?.remove(); setPhase('error'); }
    guide(`${nextTopic.name}还在收集作品（${nextTopic.works.length} / 10），先选另一题。`);
    return;
  }
  pendingScene = { topic: nextTopic, mode };
  for (const button of document.querySelectorAll('[data-topic],[data-picker-topic]')) {
    button.setAttribute('aria-pressed', String((button.dataset.topic || button.dataset.pickerTopic) === nextTopic.id));
  }
  $('#delivery-status').textContent = mode === 'replay' ? '重新拆开这两件' : `正在换上${nextTopic.name}`;
  tell(mode === 'replay' ? '重新拆开这两件作品。' : `正在准备下一对${nextTopic.name}。`);
  if (packing || ['entering', 'choosing'].includes(phase)) return;
  return replaceScene();
}
async function replaceScene() {
  if (!pendingScene || packing) return;
  packing = true;
  const covered = phase === 'loading';
  const arriving = entries.length === 0;
  closeFocus();
  clearDetails(); hideDragCue(); showHelp(false);
  const revision = timeline.cancel();
  clearTimeout(slowTimer);
  $('#guide').hidden = true;
  $('#skip-load').hidden = true;
  if (arriving) {
    topic = pendingScene.topic;
    entries = topic.works.slice(0, 2).map((work, index) => makeExhibit(work, index, revision));
    $('#exhibits').append(...entries.map(entry => entry.node));
    $('#topic-title').textContent = topic.name;
  }
  // Print while the reused cartons are still out of sight. A sealed loading
  // carton needs a real card replacement instead of an on-screen text mutation.
  if (!covered) printParcelTopic(pendingScene.topic.name);
  setPhase(arriving ? 'arriving' : 'leaving');
  if (!covered) {
    const cover = timeline.play(arriving ? arrivalBeats(entries, [$('.scene-heading'), $('.showroom'), $('.stage-dock')], $('.stage-entry-cover'), $('.stage-entry-title')) : packBeats(entries), revision, reduced.matches);
    if ((reviewMode === 'entry' || (reviewMode === 'rounds' && !arriving)) && !reduced.matches) timeline.pause();
    if (!await cover) { packing = false; return; }
  }
  if (arriving) { $('.stage-entry-cover')?.remove(); setPhase('leaving'); }
  while (entries.some(entry => entry.node.querySelector('.parcel-topic').textContent !== pendingScene.topic.name)) {
    if (!await retagParcels(pendingScene.topic.name, revision)) { packing = false; return; }
  }
  // Read the latest request only after both covers have landed. Never rewind
  // a halfway-closed box or let a late iframe message reveal an abandoned pair.
  const request = pendingScene;
  pendingScene = null;
  const replay = request.mode === 'replay' && topic?.id === request.topic.id && entries.every(entry => entry.ready);
  const reusePair = ['retry', 'replay'].includes(request.mode) && topic?.id === request.topic.id && entries.length === 2;
  topic = request.topic;
  let pair = reusePair ? entries.map(entry => entry.work) : rounds.next(topic);
  // Explicit review link can inspect any catalog item without cycling hundreds
  // of pairs. It still uses the same real render gate and cross-model pairing.
  const reviewWork = new URLSearchParams(location.search).get('review-work');
  const inspected = topic.works.find(work => work.id === reviewWork);
  if (!reusePair && inspected) {
    const other = topic.works.find(work => (work.modelId || work.model) !== (inspected.modelId || inspected.model));
    if (other) pair = [inspected, other];
  }
  if (!replay) {
    // Dispose the two old browsing contexts before mounting any replacement.
    for (const entry of entries) { post(entry, 'active', { value: false }); entry.iframe?.remove(); }
  }
  touched = false;
  choiceCount = 0;
  $('#result').hidden = true;
  $('#tie').hidden = false;
  $('#topic-title').textContent = topic.name;
  $('#delivery-status').textContent = replay ? '已装好' : '两件作品，正在装箱';
  const url = new URL(location.href); url.searchParams.set('topic', topic.id); history.replaceState(null, '', url);
  entries.forEach((entry, index) => {
    // Change the carrier only once the existing carton completely covers it.
    entry.node.dataset.presentation = presentationFor();
    resetLabel(entry, revision);
    if (replay) post(entry, 'reset');
    else mountWork(entry, pair[index], revision);
  });
  setPhase('loading');
  packing = false;
  if (replay) { await enter(revision); return; }
  slowTimer = setTimeout(() => {
    if (revision !== timeline.revision || phase !== 'loading') return;
    guide('有一件作品准备得慢一些，可以重新加载或切换另一组。');
    $('#skip-load').hidden = false;
    for (const entry of entries.filter(item => !item.ready)) {
      entry.node.querySelector('.load-text').textContent = '还在准备，稍等一下';
      entry.node.querySelector('.retry-button').hidden = false;
    }
  }, 12000);
}
async function choose(side) {
  if (!acceptChoice(phase, side)) return;
  closeFocus();
  setPhase('choosing');
  choiceCount++;
  rememberGuide();
  clearDetails(); hideDragCue(); showHelp(false);
  const revision = timeline.revision;
  for (const entry of entries) {
    const picked = entry.side === side || side === 'tie';
    entry.node.dataset.picked = String(picked);
    entry.node.querySelector('.choose-button').firstElementChild.textContent = picked ? '你的选择 ✓' : '另一种眼缘';
  }
  const beats = entries.flatMap(entry => {
    const picked = entry.node.dataset.picked === 'true';
    return picked ? [
      { element: entry.node.querySelector('.case-wrap'), at: 0, duration: 520, frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)', offset: .45 }, { transform: 'translateY(0)' }] },
      { element: entry.node.querySelector('.picked-sticker'), at: 140, duration: 400, frames: [{ opacity: 0, transform: 'translateY(-20px) rotate(21deg) scale(1.15)' }, { opacity: 1, transform: 'translateY(1px) rotate(10deg) scale(.97)', offset: .72 }, { opacity: 1, transform: 'translateY(0) rotate(10deg) scale(1)' }] },
    ] : [{ element: entry.node.querySelector('.case-wrap'), at: 0, duration: 450, frames: [{ opacity: 1 }, { opacity: .72 }, { opacity: 1 }] }];
  });
  if (!await timeline.play(beats, revision, reduced.matches)) return;
  for (const entry of entries) {
    entry.node.dataset.revealed = 'true';
    entry.node.querySelector('.model-name').textContent = entry.work.model;
    entry.node.querySelector('.identity-note').textContent = entry.node.dataset.picked === 'true' ? '你选中的这一件' : '另一种眼缘';
    entry.node.querySelector('.side-label').hidden = true;
    if (entry.work.model.startsWith('GPT')) {
      const icon = entry.node.querySelector('.model-icon'); icon.src = '/forum-brands/openai.svg'; icon.hidden = false;
      icon.onerror = () => { icon.hidden = true; entry.node.querySelector('.side-label').hidden = false; };
    } else {
      const monogram = entry.node.querySelector('.model-monogram'); monogram.textContent = entry.work.model.slice(0, 2); monogram.hidden = false;
    }
    animateDetail(entry.node.querySelector('.identity-mark'), [{ opacity: 0, transform: 'rotateY(-80deg)' }, { opacity: 1, transform: 'rotateY(0)' }], 330);
  }
  $('#delivery-status').textContent = '已签收 · 作者揭晓';
  $('#result-title').textContent = side === 'tie' ? '不用为难，两个都很合眼缘。' : `原来，你喜欢 ${entries.find(entry => entry.side === side).work.model} 的这一件。`;
  $('#result').hidden = false;
  $('#tie').hidden = true;
  $('#guide').hidden = true;
  await timeline.play([{ element: $('#result'), at: 0, duration: 360, frames: [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }] }], revision, reduced.matches);
  if (revision !== timeline.revision) return;
  setPhase('revealed');
  tell($('#result-title').textContent);
  if (pendingScene) void replaceScene();
}
addEventListener('message', event => {
  const entry = entries.find(item => event.source === item.iframe?.contentWindow && event.origin === item.work.origin);
  if (!entry || entry.revision !== timeline.revision) return;
  if (event.data === 'aob:work-ready') {
    entry.loaded = true;
  }
  if (event.data?.stage === 'rendered') entry.rendered = true;
  if (event.data?.stage === 'camera-ready') {
    entry.cameraSettled = true;
    entry.cameraReady = event.data.available !== false;
    if (entry.ready) entry.node.querySelector('.reset-view').disabled = !entry.cameraReady || !['exploring', 'revealed'].includes(phase);
  }
  if (!entry.ready && entry.loaded && entry.rendered && entry.cameraSettled) {
    entry.ready = true;
    entry.node.dataset.ready = 'true';
    entry.node.querySelector('.load-text').textContent = '已装好';
    if (!entry.cameraReady) entry.node.querySelector('.reset-view').title = '此作品暂不支持一键复位';
    const count = entries.filter(item => item.ready).length;
    $('#delivery-status').textContent = `${count} / 2 件已装好`;
    void enter(entry.revision);
  }
  if (event.data?.stage === 'interacted' && !touched && phase === 'exploring') {
    touched = true; rememberGuide(); hideDragCue(); guide('就是这样。喜欢哪一件，由你说了算。', true);
  }
  if (event.data?.stage === 'escape') closeFocus();
});
document.addEventListener('visibilitychange', refreshActivity);
$('#focus-backdrop').addEventListener('click', closeFocus);
addEventListener('keydown', event => { if (event.key === 'Escape') { closeFocus(); showHelp(false); } });
$('#tie').addEventListener('click', () => choose('tie'));
function continueRound(same) {
  if (!['exploring', 'revealed'].includes(phase)) return;
  const available = data.topics.filter(item => item.eligible !== false);
  const next = same ? topic : available[(available.indexOf(topic) + 1) % available.length];
  const stage = $('.showroom');
  if (stage.getBoundingClientRect().top < -60) stage.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  void loadTopic(next.id);
}
$('#next').addEventListener('click', () => continueRound(false));
$('#continue').addEventListener('click', () => continueRound(true));
$('#replay').addEventListener('click', () => {
  if (['exploring', 'revealed'].includes(phase)) void loadTopic(topic.id, 'replay');
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-topic],[data-picker-topic]');
  if (!button || button.disabled) return;
  $('#topic-picker').close();
  const id = button.dataset.topic || button.dataset.pickerTopic;
  if (id !== topic?.id || pendingScene) void loadTopic(id);
});
$('#topics-toggle').addEventListener('click', () => $('#topic-picker').showModal());
$('#close-picker').addEventListener('click', () => $('#topic-picker').close());
$('#topic-search').addEventListener('input', event => {
  let count = 0;
  for (const button of $('#topic-list').children) {
    button.hidden = !button.dataset.name.includes(event.target.value.trim().toLowerCase());
    if (!button.hidden) count++;
  }
  $('#topic-empty').hidden = count > 0;
});
$('#help').addEventListener('click', () => showHelp($('#help-card').hidden));
$('#close-help').addEventListener('click', () => { showHelp(false); $('#help').focus(); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.header-right')) showHelp(false); });
$('#dismiss-guide').addEventListener('click', () => { $('#guide').hidden = true; hideDragCue(); rememberGuide(); });
$('#skip-load').addEventListener('click', () => { if (phase === 'loading') void loadTopic(topic.id); });
addEventListener('pagehide', () => { timeline.cancel(); clearDetails(); clearTimeout(slowTimer); });
Object.defineProperty(window, '__objectStageReview', { value: { snapshot: () => ({ phase, topic: topic?.id,
  presentation: topic ? presentationFor() : null,
  revision: timeline.revision, activeTracks: timeline.tracks.size, choiceCount, pending: pendingScene?.topic.id || null,
  labeling: document.body.dataset.labeling === 'true',
  frames: entries.map(entry => ({ id: entry.work.id, ready: entry.ready, loaded: entry.loaded, rendered: entry.rendered, cameraReady: entry.cameraReady, cameraSettled: entry.cameraSettled })), focused: focused?.side || null }),
  seek: time => { if (motionReview && ['arriving', 'entering', 'leaving'].includes(phase) && !document.body.dataset.labeling) timeline.seek(time); },
  play: () => { if (motionReview) timeline.resume(); },
} });
try {
  data = await loadObjectCatalog();
  for (const [index, item] of data.topics.entries()) {
    const button = document.createElement('button');
    button.dataset.pickerTopic = item.id; button.dataset.name = item.name.toLowerCase();
    button.disabled = item.eligible === false;
    button.setAttribute('aria-pressed', 'false');
    const number = document.createElement('span'); number.className = 'picker-number'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('b'); name.textContent = item.name;
    const count = document.createElement('small'); count.textContent = item.eligible === false ? `${item.works.length} / 10` : `${item.works.length} 件`;
    button.append(number, name, count); $('#topic-list').append(button);
  }
  await loadTopic(new URLSearchParams(location.search).get('topic') || 'keyboards');
} catch {
  $('.stage-entry-cover')?.remove();
  setPhase('error');
  guide('作品暂时没有准备好，请刷新重试。');
}
