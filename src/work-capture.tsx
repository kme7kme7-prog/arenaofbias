import { createRoot } from 'react-dom/client';
import { FixedHtmlWork } from '@/components/fixed-html-work';
import { workCanvas } from '@/lib/work-framing';
import type { ModelResult } from '@/lib/arena';
import './work-capture.css';

// A separate, read-only entry: identical framing math and iframe component to the arena.
const readyFrames = new WeakSet<MessageEventSource>();
window.addEventListener('message', (event) => {
  if (event.data === 'aob:work-ready' && event.source)
    readyFrames.add(event.source);
});
async function start() {
  const id = new URLSearchParams(location.search).get('id');
  const response = await fetch(
    `/api/share-work/${encodeURIComponent(id ?? '')}`,
  );
  if (!response.ok) throw new Error('作品不可用');
  const { work } = await response.json();
  const result = {
    id: work.id,
    promptId: work.prompt_id,
    title: work.title,
    content: JSON.parse(work.content),
  } as ModelResult;
  const content = result.content;
  if (content.kind !== 'html') {
    const [{ Work }] = await Promise.all([
      import('@/app/page'),
      import('@/app/globals.css'),
    ]);
    createRoot(document.getElementById('root')!).render(
      <main id="capture-stage">
        <Work result={result} side="a" />
      </main>,
    );
    const timer = window.setInterval(() => {
      if (
        !document.querySelector('#capture-stage') ||
        document.fonts.status !== 'loaded' ||
        [...document.images].some((image) => !image.complete)
      )
        return;
      clearInterval(timer);
      document.documentElement.dataset.captureReady = 'true';
    }, 100);
    return;
  }
  if (!('src' in content)) throw new Error('内联作品暂不生成快照');
  const canvas = workCanvas(result);
  createRoot(document.getElementById('root')!).render(
    <main id="capture-stage">
      {canvas ? (
        <FixedHtmlWork
          content={content}
          canvas={canvas}
          title={result.title}
          interactive={false}
        />
      ) : (
        <iframe
          title={result.title}
          src={`${content.src}${content.src.includes('?') ? '&' : '?'}aob=prev`}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
    </main>,
  );
  const timer = window.setInterval(() => {
    const frame = document.querySelector('iframe');
    const doc = frame?.contentDocument;
    if (
      !frame?.contentWindow ||
      !doc ||
      doc.URL === 'about:blank' ||
      doc.readyState !== 'complete'
    )
      return;
    if (
      doc.querySelector('[data-aob-probe]') &&
      !readyFrames.has(frame.contentWindow)
    )
      return;
    if ([...doc.images].some((image) => !image.complete)) return;
    if (doc.fonts.status !== 'loaded') return;
    // The server bridge applies the saved camera as controls register.
    const bridge = (
      frame.contentWindow as Window & { __AOB__?: { controls: unknown[] } }
    ).__AOB__;
    if (content.camera && !bridge?.controls.length) return;
    clearInterval(timer);
    document.documentElement.dataset.captureReady = 'true';
  }, 100);
}
void start().catch((error) => {
  document.body.textContent = error.message;
  document.documentElement.dataset.captureError = 'true';
});
