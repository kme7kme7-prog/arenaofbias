import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ModelResult, Side } from '@/lib/arena';
import { channelGroups, type TextTheme } from '@/lib/text-presentations';
import { setThemeScene } from '@/lib/theme';

export type ReadingChannel = 'prose' | 'cinema' | 'voice' | 'all';
const channels: { id: ReadingChannel; label: string; number: string }[] = [
  { id: 'prose', label: '张爱玲', number: '01' },
  { id: 'cinema', label: '王家卫', number: '02' },
  { id: 'voice', label: '业主群大妈', number: '03' },
  { id: 'all', label: '看全篇', number: '' },
];

// Verified monochrome text imports. Only their preview paper is blended; arbitrary
// HTML (including future illustrated works) must keep its own colors and sandbox.
const legacyPaperWorks = new Set(['up-x91pmv9e', 'up-25za98l7', 'up-oerzlyfj', 'up-7luhmht9', 'up-7ajs0cbu', 'up-c1to3c7g']);

// Printed marginalia: no extra copy, requests, or independently running animation.
function TextMarginalia({ theme }: { theme: TextTheme }) {
  if (theme.id === 'blackout' || theme.id === 'channels') return null;
  return <div className={`text-marginalia marginalia-${theme.id}`} aria-hidden="true">
    <svg className="margin-sprig" viewBox="0 0 100 200" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M49 180C33 136 54 99 42 28M46 132C25 130 20 111 19 100C38 102 45 113 46 132ZM44 105C60 99 68 81 66 67C50 72 43 88 44 105ZM44 74C29 71 25 56 27 45C40 50 46 61 44 74ZM44 48C56 36 54 22 50 16C42 24 40 37 44 48" />
      <path d="M22 164l5 2m-10-16 4 2m48-18 6-2M70 147l4 1" />
    </svg>
    <svg className="margin-note" viewBox="0 0 130 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      {theme.id === 'letter' ? <><path d="m18 36 86-9 7 60-86 9ZM18 36l49 28 37-37M25 96l31-37m55 28L77 58" /><path d="M66 72c-10-7-4-14 1-9 4-7 12-2-1 9Z" /></> : theme.id === 'waiting' ? <><path d="M21 31h81v37H21ZM17 73h90M27 74v23m70-23v23M33 38v23m13-23v23m13-23v23m13-23v23m13-23v23" /><path d="M54 21c7 1 16-2 19-9M63 12l10 0-4 8" /></> : <><path d="M21 87c17-5 29-3 43 5 15-8 27-11 44-6M21 87l-3-61c20-4 33 1 45 10 14-10 28-14 45-11v61M63 36l1 56" /><path d="M32 40l19 5m-19 7 19 5m26-11 19-6m-19 18 19-6" /></>}
    </svg>
  </div>;
}

function LetterPostage() {
  return <div className="letter-postage" aria-hidden="true">
    <div className="letter-stamp"><svg viewBox="0 0 100 130" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round">
      <path d="M19 103c22-3 38 0 63 3M49 108c8-31 2-49 7-70M53 78c-18-1-24-13-26-22 15 0 25 9 26 22ZM54 63c14-1 24-15 23-26-14 4-21 12-23 26Z" />
      <path d="M56 38c-13 2-21-6-17-14 5-7 12-2 15 3-5-14 5-22 12-16 5 5 1 13-5 17 13-8 23-1 18 7-3 6-13 4-18 0 6 12-3 21-9 15-4-4-1-9 4-12Z" />
      <circle cx="58" cy="32" r="3" /><path d="m25 19 4-3m-6 13 4-1m52 48 5-3" />
    </svg></div>
    <svg className="letter-cancellation" viewBox="0 0 260 130" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="63" cy="65" r="49" /><circle cx="63" cy="65" r="44" strokeDasharray="1 3" />
      <path d="M111 40c24-13 34 13 59 0s34 13 59 0M111 52c24-13 34 13 59 0s34 13 59 0M111 64c24-13 34 13 59 0s34 13 59 0M111 76c24-13 34 13 59 0s34 13 59 0M111 88c24-13 34 13 59 0s34 13 59 0" />
      <path d="M44 39h38M44 91h38" /><text x="63" y="71" textAnchor="middle" fill="currentColor" stroke="none">未寄出</text>
    </svg>
  </div>;
}

export function useTextSceneTone(scene: TextTheme['id'] | null) {
  useLayoutEffect(() => {
    setThemeScene(scene);
    return () => {
      // Adjacent arena mounts share one commit. Do not flash paper between two dark rounds.
      queueMicrotask(() => {
        if (!document.querySelector('.text-arena[data-text-theme]')) setThemeScene(null);
      });
    };
  }, [scene]);
}

export function TextStageMasthead({ theme, channel, onChannelChange }: { theme: TextTheme; channel: ReadingChannel; onChannelChange: (channel: ReadingChannel) => void }) {
  useLayoutEffect(() => {
    // A same-topic round resets the lens under the curtain. Update its material
    // on the existing clock as well; never add a separate loading delay.
    if (theme.id === 'channels') window.dispatchEvent(new Event('aob:scene-tone'));
  }, [channel, theme.id]);
  return <><TextMarginalia theme={theme} /><header className="text-masthead">
    <div className="text-masthead-copy"><span className="text-edition">{theme.label}</span><h2>{theme.title.map((line, i) => <span className="poster-title-line" key={i}><span>{line}</span></span>)}</h2>{theme.note && <p>{theme.note}</p>}</div>
    {theme.id === 'forest' && <img className="text-scene forest-scene" src="/text-scenes/forest-line-v3.png" width="1792" height="896" alt="" decoding="async" />}
    {theme.id === 'letter' && <LetterPostage />}
    {theme.id === 'channels' && <div className="channel-floor" aria-hidden="true"><b>18</b><span>F</span></div>}
    {theme.id === 'blackout' && <div className="reading-night" aria-hidden="true"><span /><span /><span /></div>}
    {theme.id === 'waiting' && <img className="text-scene waiting-scene" src="/text-scenes/waiting-line-v2.png" width="1792" height="896" alt="" decoding="async" />}
    {theme.id === 'reading' && <div className="reading-monogram" aria-hidden="true"><span>A</span><i>&</i><span>B</span></div>}
  </header>{theme.id === 'channels' && <div className="text-channel-nav" role="group" aria-label="同时切换两份回答的文风">
    {channels.map(item => <button type="button" key={item.id} aria-pressed={channel === item.id} onClick={() => onChannelChange(item.id)}><span aria-hidden="true">{item.number}</span>{item.label}</button>)}
  </div>}</>;
}

export function TextStageReply({ result, theme, side, channel, children, isolateChannels = false }: { result: ModelResult; theme: TextTheme; side: Side; channel: ReadingChannel; children: ReactNode; isolateChannels?: boolean }) {
  const reading = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (theme.id === 'channels' && reading.current) reading.current.scrollTop = 0;
  }, [channel, theme.id]);
  const native = result.content.kind === 'text';
  const story = result.content.kind === 'text' ? result.content.story : null;
  const paragraphs = story ? [story.heading, ...story.paragraphs, story.ending].filter((p): p is string => p !== undefined) : [];
  const groups = theme.id === 'channels' ? channelGroups(paragraphs) : [{ channel: 'plain', paragraphs }];
  return <article ref={reading} className={`text-reading${native ? '' : ' text-reading-embedded'}`} data-paper-embed={!native && result.promptId === '013' && legacyPaperWorks.has(result.id) ? '' : undefined} data-channel={theme.id === 'channels' ? channel : undefined} data-work-id={result.id} data-side={side} data-tour-scroll tabIndex={0} aria-label={`阅读作品 ${side.toUpperCase()}`}>
    {native ? <div className="text-originals">
      {groups.map((group, index) => <section className={`text-passage text-channel-${group.channel}`} key={index} hidden={theme.id === 'channels' && channel !== 'all' && (group.channel !== 'plain' || (isolateChannels && groups.some(item => item.channel !== 'plain'))) && group.channel !== channel}>
        {group.paragraphs.map((paragraph, i) => {
          // The active lens already names the style. Keep source labels in the DOM and full view.
          const heading = theme.id === 'channels' ? paragraph.match(/^(\s*【(?:张爱玲|王家卫|业主群大妈)】\s*)/)?.[0] : undefined;
          const labelOnly = !!heading && paragraph.slice(heading.length).trim() === '';
          return <p className={`text-original${labelOnly ? ' text-source-heading' : ''}`} key={i}>
            {heading ? <><span className="text-source-label">{heading}</span>{paragraph.slice(heading.length)}</> : paragraph}
          </p>;
        })}
      </section>)}
      <span className="text-endmark" aria-hidden="true">{theme.id === 'forest' ? '◆' : '· · ·'}</span>
    </div> : children}
  </article>;
}
