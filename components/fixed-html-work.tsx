import { useLayoutEffect, useRef, useState } from 'react';
import { framedCanvas, type WorkCanvas } from '@/lib/work-framing';
import type { ResultContent } from '@/lib/arena';
import './fixed-html-work.css';

export function FixedHtmlWork({
  content,
  title,
  canvas,
  interactive,
}: {
  content: Extract<ResultContent, { kind: 'html' }>;
  title: string;
  canvas: WorkCanvas;
  interactive: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    // Layout dimensions exclude the arena's animated spotlight transforms.
    const measure = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const fit = framedCanvas(canvas, size.width, size.height);
  const inline = 'html' in content;
  return (
    <div
      className="fixed-html-host"
      ref={host}
      data-canvas={`${canvas.width}x${canvas.height}`}
    >
      <div
        className="fixed-html-stage"
        style={{
          width: fit.viewWidth,
          height: fit.viewHeight,
          left: fit.viewLeft,
          top: fit.viewTop,
        }}
      >
        <iframe
          className="fixed-html-frame"
          title={title}
          width={canvas.width}
          height={canvas.height}
          src={inline ? undefined : content.src}
          srcDoc={inline ? content.html : undefined}
          sandbox={inline || content.sandboxed ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
          data-ready-probe={!inline && content.sandboxed ? 'required' : undefined}
          inert={!interactive}
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})`,
            visibility: fit.scale > 0 ? 'visible' : 'hidden',
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      </div>
    </div>
  );
}
