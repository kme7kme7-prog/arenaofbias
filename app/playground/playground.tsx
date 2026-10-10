import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountProvider } from '@/components/account';
import { currentPrompts, getPromptsState, loadPrompts, subscribePrompts } from '@/lib/prompts';
import { configureWorksCatalog, getWorksState, loadWorks, subscribeWorks } from '@/lib/works';
import { currentPairs } from '@/lib/placeholder';
import type { Prompt } from '@/lib/arena';
import { loadRatings } from '@/lib/ratings';
import { initTheme, setThemeScene } from '@/lib/theme';
import { bandsNavigate, navigationTransitionActive, setTransitionFactory } from '@/lib/game-transitions';
import { enterArena, releaseWorksGate } from '@/lib/works-gate';
import { cancelReaderPassage, readerPassage, createPlaygroundPassage } from './playground-passage';
import catalog from './playground-catalog.json';
import { playgroundNavigate, settlePlaygroundEntry } from '@/lib/playground-entry';
import '@/app/observatory.css';
import '@/app/globals.css';
import '@/app/account.css';
import '@/app/game-transitions.css';
import '@/app/arena-refinement.css';
import '@/app/theme.css';
import '@/app/site-scale.css';
import './fonts.css';
import './playground.css';
import './playground-editorial.css';
import './playground-magazine.css';
import './playground-reader.css';
import './playground-home.css';

// Reuse the approved works and scene materials; the local passage owns navigation.
const loadArena = () => import('@/app/page');
const Arena = lazy(loadArena);
const subscribeRoute = (notify: () => void) => {
  addEventListener('hashchange', notify);
  return () => removeEventListener('hashchange', notify);
};
const standardClick = (event: MouseEvent<HTMLAnchorElement>) => !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

let objectNavigation = false;
let objectDepartureCover: HTMLElement | null = null;
const objectDepartureTracks = new Set<Animation>();
const resetObjectDeparture = () => {
  for (const track of objectDepartureTracks) track.cancel();
  objectDepartureTracks.clear();
  objectDepartureCover?.remove(); objectDepartureCover = null;
  objectNavigation = false;
  for (const link of document.querySelectorAll<HTMLElement>('[data-object-opening]')) {
    delete link.dataset.objectOpening; link.removeAttribute('aria-busy');
  }
};
addEventListener('pageshow', resetObjectDeparture);
addEventListener('pagehide', resetObjectDeparture);
if (import.meta.hot) import.meta.hot.dispose(() => {
  removeEventListener('pageshow', resetObjectDeparture);
  removeEventListener('pagehide', resetObjectDeparture);
  resetObjectDeparture();
});
const openObjects = (event: MouseEvent<HTMLAnchorElement>) => {
  if (!standardClick(event) || event.button !== 0) return;
  event.preventDefault();
  if (objectNavigation || navigationTransitionActive()) return;
  objectNavigation = true;
  const link = event.currentTarget;
  const destination = link.href;
  link.dataset.objectOpening = 'true';
  link.setAttribute('aria-busy', 'true');
  const element = link.querySelector('.pg-object-drawing') ?? link;
  const track = element.animate([{ transform: getComputedStyle(element).transform }, { transform: 'translateY(-6px)' }], {
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 160,
    easing: 'cubic-bezier(.22,.72,.2,1)', fill: 'forwards',
  });
  objectDepartureTracks.add(track);
  objectDepartureCover = document.createElement('div');
  objectDepartureCover.className = 'pg-object-curtain';
  objectDepartureCover.setAttribute('aria-hidden', 'true');
  document.body.append(objectDepartureCover);
  const cover = objectDepartureCover.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220,
    easing: 'ease-in-out', fill: 'forwards',
  });
  objectDepartureTracks.add(cover);
  void cover.finished.then(() => location.assign(destination), resetObjectDeparture);
};
const openIndex = (hash: string) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (!standardClick(event)) return;
  event.preventDefault();
  if (objectNavigation) resetObjectDeparture();
  bandsNavigate(hash);
};
const disposeTheme = initTheme();
configureWorksCatalog('/api/playground/works');
addEventListener('pg:reader-cancel', releaseWorksGate);
if (import.meta.hot) import.meta.hot.dispose(() => removeEventListener('pg:reader-cancel', releaseWorksGate));
if (import.meta.hot) import.meta.hot.dispose(disposeTheme);
loadRatings();
setTransitionFactory(createPlaygroundPassage);

function Brand() {
  return <a className="pg-brand" href="/#play" onClick={event => {
    if (!standardClick(event) || event.button !== 0) return;
    event.preventDefault(); playgroundNavigate('/#play', true);
  }} aria-label="返回玩法菜单"><span className="pg-brand-mark" aria-hidden="true"><i /><i /><i /></span>ARENA <span>OF BIAS</span></a>;
}
function Header({ section }: { section: 'home' | 'text' | 'scene' }) {
  return <header className="pg-header"><Brand /><nav aria-label="体验导航">
    {section !== 'home' && <a href="#text" onClick={openIndex('#text')} aria-current={section === 'text' ? 'page' : undefined}>文字题目</a>}
    <a href="/objects.html?topic=keyboards" onClick={openObjects}>3D 作品 <span aria-hidden="true">↗</span></a>
    <a href="/#home">返回主站</a>
  </nav></header>;
}
function ReaderHeader({ prompt }: { prompt?: Prompt }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.close(); }, [prompt?.id]);
  const title = catalog.find(item => item.id === prompt?.id)?.name ?? '文字题目';
  return <><header className="pg-reader-header">
    <a className="pg-reader-back" href="#text" onClick={openIndex('#text')}><span aria-hidden="true">←</span> 文字目录</a>
    <h1>{title}</h1>
    <nav aria-label="阅读导航"><button className="pg-topic-toggle" onClick={() => dialog.current?.showModal()} disabled={!prompt}>查看题目</button><a href="/objects.html?topic=keyboards" onClick={openObjects}>3D 作品 ↗</a></nav>
  </header><dialog className="pg-topic-dialog" ref={dialog} aria-labelledby="pg-topic-title"><div><h2 id="pg-topic-title">{title}</h2><button onClick={() => dialog.current?.close()} aria-label="关闭题目">×</button></div><p>{prompt?.prompt}</p></dialog></>;
}
function ObjectDrawing() {
  return <svg className="pg-object-drawing" viewBox="0 0 520 300" aria-hidden="true" fill="none">
    <ellipse cx="260" cy="267" rx="167" ry="17" fill="#bec8b94d" />
    <path d="M91 69 152 31H435L374 69ZM374 69l61-38v173l-61 41" fill="#f7f9ed66" stroke="#9aaa95" />
    <path d="M91 69h283v176H91ZM91 245l61-41h283M152 31v173" stroke="#9aaa95" />
    <path d="m87 243 289 1 60-39v16l-60 39-289-1Z" fill="#cbd5c0" stroke="#a5b197" />
    <g transform="translate(168 112) rotate(12 105 55)"><rect width="191" height="95" rx="15" fill="#40564a" /><rect x="6" y="2" width="179" height="82" rx="10" fill="#b6c6ad" />
      {[0, 1, 2, 3].map(row => <g key={row}>{Array.from({ length: 9 }, (_, col) => <rect key={col} x={13 + col * 18} y={9 + row * 16} width="15" height="13" rx="2" fill={row === 0 && col === 0 ? '#c98962' : '#f5f3df'} />)}</g>)}
      <rect x="59" y="57" width="85" height="15" rx="3" fill="#c98962" /></g>
    <path d="m103 100 14-17m-14 31 27-31M363 82v137" stroke="#fffdf4" strokeWidth="3" />
  </svg>;
}
function PaperDrawing() {
  return <div className="pg-paper-drawing" aria-hidden="true"><div className="pg-envelope" /><div className="pg-paper-back"><span>02:30</span><i /><i /></div><div className="pg-paper-front"><span>致你</span><i /><i /><i /><b>。</b></div><div className="pg-paper-stamp">等<br />待</div></div>;
}
function Home() {
  return <main className="pg-home"><div className="pg-intro"><p className="pg-kicker">随心玩</p><h1>挑一个<span>喜欢的。</span></h1><p>转一转作品，或读一段故事。</p></div>
    <div className="pg-entrances">
      <a className="pg-entrance pg-objects" href="/objects.html?topic=keyboards" onClick={openObjects}><div className="pg-entrance-top"><span>01</span><span>换个角度看</span></div><ObjectDrawing /><div className="pg-entrance-bottom"><div><h2>3D 作品</h2><p>两件小作品，哪件更合眼缘？</p></div><b aria-hidden="true">↗</b></div></a>
      <a className="pg-entrance pg-texts" href="#text" onClick={openIndex('#text')}><div className="pg-entrance-top"><span>02</span><span>换种心情读</span></div><PaperDrawing /><div className="pg-entrance-bottom"><div><h2>文字题目</h2><p>一句话，一封信，一整个故事。</p></div><b aria-hidden="true">↗</b></div></a>
    </div><p className="pg-footnote">没有标准答案，喜欢就好。</p>
  </main>;
}
function SceneArt({ skin, mark }: { skin: string; mark: string }) {
  return <div className={`pg-scene-art pg-art-${skin}`} aria-hidden="true">
    {skin === 'forest' ? <img src="/text-scenes/forest-line-v3.png" alt="" /> : skin === 'waiting' ? <img src="/text-scenes/waiting-line-v2.png" alt="" /> : skin === 'orange' ? <img className="pg-orange-illustration" src="/text-scenes/orange-editorial-v1.webp" alt="" width="1254" height="1254" loading="lazy" decoding="async" /> : skin === 'chat' ? <><i>还没睡？</i><i>嗯，想说说话。</i></> : skin === 'letter' ? <><i className="pg-small-envelope" /><span>{mark}</span></> : <span>{mark}</span>}
  </div>;
}
function LetterCover() {
  return <div className="pg-letter-cover pg-story-cover" aria-hidden="true">
    <span className="pg-letter-corner">未寄出</span>
    <div className="pg-letter-sheet-b"><i /><i /><i /><span>。</span></div>
    <div className="pg-letter-sheet-a"><span className="pg-letter-to">致你</span><strong>有些话，<br />留在纸上。</strong><span className="pg-letter-dot">。</span></div>
    <svg className="pg-letter-flower" viewBox="0 0 90 150" fill="none" stroke="currentColor" strokeWidth="1.1"><path d="M44 135c4-34-6-63 4-91M45 99C21 92 20 75 24 66c18 4 22 17 21 33Zm1-30c20-3 28-18 25-29-21 9-22 16-25 29ZM48 44c-16 2-24-12-13-18 8-3 11 4 13 8-6-21 9-24 13-16 4 8-5 17-10 20 19-8 23 6 15 10-6 2-11-2-15-6 8 16-8 23-12 13-2-6 3-9 9-11Z" /></svg>
  </div>;
}
function EditorialCover({ item }: { item: typeof catalog[number] }) {
  if (item.skin === 'letter') return <LetterCover />;
  return <div className={`pg-story-cover pg-cover-${item.skin}`} aria-hidden="true">
    {item.skin === 'chat' ? <><div className="pg-chat-time">02<span>:</span>30</div><SceneArt skin="chat" mark="" /><span className="pg-chat-status">对方还在。</span></> :
      item.skin === 'forest' ? <><div className="pg-book-spine" /><span className="pg-forest-title">小红帽</span><img src="/text-scenes/forest-line-v3.png" alt="" /><span className="pg-book-rule" /></> :
      item.skin === 'forum' ? <><div className="pg-forum-bar"><b>贴</b><span>弱智吧</span></div><strong>认真一问。</strong><div className="pg-forum-reply"><span>2楼</span><i /><i /></div><div className="pg-forum-reply"><span>3楼</span><i /></div></> :
      item.skin === 'orange' ? <><span className="pg-orange-rule">三句话</span><SceneArt skin="orange" mark="" /><strong>卖我这颗橘子。</strong></> :
      item.skin === 'channels' ? <><b>18</b><div><span>散文</span><span>电影</span><span>群聊</span></div></> :
      item.skin === 'blackout' ? <><strong>停<br />电</strong><div className="pg-night-crack" /><span>故事还没。</span></> :
      <><div className="pg-waiting-stamp"><img src="/text-scenes/waiting-line-v2.png" alt="" /><span>等待</span></div><div className="pg-waiting-postmark" /></>}
  </div>;
}
const editorialOrder = ['letter', 'chat', 'forest', 'forum', 'orange', 'channels', 'blackout', 'waiting'];
function TextLibrary({ available }: { available: Set<string> }) {
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const live = useRef(true);
  const opening = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function openScene(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (!standardClick(event)) return;
    event.preventDefault();
    if (opening.current || navigationTransitionActive()) return;
    opening.current = true;
    setPending(id); setFailure(false);
    // Touch and keyboard activation start the module alongside the closing doors.
    void loadArena().catch(() => { if (live.current) setFailure(true); });
    try {
      enterArena(`#arena/${id}`, catalog.find(item => item.id === id)?.name);
    } catch { setFailure(true); }
    finally { opening.current = false; if (live.current) setPending(null); }
  }
  return <main className="pg-library pg-editorial">
    <header className="pg-editorial-heading">
      <div className="pg-masthead"><h1>字里<span>行间</span><svg viewBox="0 0 220 22" aria-hidden="true"><path d="M4 12Q110 0 215 9M30 19Q105 10 176 15" /></svg></h1><p>不必打分，<br /><em>喜欢就好。</em></p><span className="pg-masthead-mark" aria-hidden="true"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M28 16C21 10 13 10 6 12v30c8-2 16-1 22 4 6-5 14-6 22-4V12c-7-2-15-2-22 4Zm0 0v30M11 18c5-1 9 0 12 2m-12 5c5-1 9 0 12 2m10-7c3-2 7-3 12-2m-12 9c3-2 7-3 12-2" /><path d="M38 11v21l4-3 4 2V11" /></svg></span></div>
    </header>
    <div className="pg-editorial-stories">
      {editorialOrder.map((skin, index) => {const item = catalog.find(entry => entry.skin === skin)!;return <a key={item.id} className={`pg-story pg-story-${item.skin}`} href={`#arena/${item.id}`} onMouseEnter={() => { void loadArena().catch(() => {}); }} onFocus={() => { void loadArena().catch(() => {}); }} onClick={event => {
      if (!available.has(item.id)) { event.preventDefault(); return; }
      void openScene(event, item.id);
    }} aria-disabled={!available.has(item.id) || !!pending} aria-busy={pending === item.id}>
      <EditorialCover item={item} /><div className="pg-story-caption"><span>{String(index + 1).padStart(2, '0')}</span><div className="pg-story-title"><h2>{item.name}</h2><p>{item.note}</p></div><span className="pg-story-open" aria-hidden="true">{pending === item.id ? '正在打开…' : <><span>翻开</span><b>↗</b></>}</span></div>
    </a>;})}</div>
    <footer className="pg-editorial-colophon"><a href="/objects.html?topic=keyboards">3D 作品 <b aria-hidden="true">↗</b></a></footer>
    {pending && <output className="pg-opening-note">正在打开…<button onClick={cancelReaderPassage}>取消</button></output>}
    {failure && <p className="pg-notice" role="alert">这次没能打开，点击题目可以再试一次。</p>}
  </main>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { releaseWorksGate(); return { failed: true }; }
  render() { return this.state.failed ? <p className="pg-notice">这个场景暂时没能打开。<a href="#text">返回文字题目</a></p> : this.props.children; }
}
function Playground() {
  const route = useSyncExternalStore(subscribeRoute, () => location.hash, () => '');
  const works = useSyncExternalStore(subscribeWorks, getWorksState);
  const prompts = useSyncExternalStore(subscribePrompts, getPromptsState);
  const sceneId = route.startsWith('#arena/') ? route.slice(7) : null;
  const section = sceneId ? 'scene' : ['#text', '#prompts'].includes(route) ? 'text' : 'home';
  const ready = works.status === 'ready' && works.source === 'remote' && prompts.status === 'ready' && prompts.source === 'remote';
  const renderId = sceneId;
  const prompt = ready && renderId ? currentPrompts().find(item => item.id === renderId && catalog.some(entry => entry.id === renderId)) : undefined;
  useEffect(() => { void loadWorks(); void loadPrompts(); }, []);
  useLayoutEffect(settlePlaygroundEntry, []);
  const pageTitle = (section === 'scene' && prompt?.name) || (section === 'text' ? '文字题目' : '随心玩');
  useLayoutEffect(() => {
    document.documentElement.dataset.playgroundView = section;
    if (section !== 'scene') { setThemeScene(null); releaseWorksGate(); }
    window.scrollTo(0, 0);
    document.title = `${pageTitle} · Arena of Bias`;
  }, [section, sceneId, pageTitle]);
  useEffect(() => {
    if (sceneId && ready && (!prompt || !currentPairs(sceneId).length)) releaseWorksGate();
  }, [sceneId, ready, prompt]);
  const available = new Set(ready ? catalog.filter(item => currentPairs(item.id).length > 0).map(item => item.id) : []);
  return <>{section === 'scene' ? <ReaderHeader prompt={prompt} /> : <Header section={section} />}{section === 'home' ? <Home /> : section === 'text' ? <TextLibrary available={available} /> : null}
    {ready && prompt && currentPairs(prompt.id).length ? <div className="pg-scene-host" data-preparing={section !== 'scene' ? '' : undefined} inert={section !== 'scene'} aria-hidden={section !== 'scene' || undefined}><SceneBoundary key={prompt.id}><Suspense fallback={<output className="pg-notice">正在打开这段故事…</output>}><Arena key={prompt.id} prompt={prompt} playground /></Suspense></SceneBoundary></div> : section === 'scene' ? <output className="pg-notice">{works.status === 'loading' || prompts.status === 'loading' ? '正在取出故事…' : <>故事暂时没有准备好。<a href="#text">返回选题</a><button onClick={() => location.reload()}>重新加载</button></>}</output> : null}</>;
}
if (location.hash.startsWith('#arena/')) readerPassage(location.hash.slice(7));
const root = createRoot(document.getElementById('playground-root')!);
root.render(<AccountProvider><Playground /></AccountProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
