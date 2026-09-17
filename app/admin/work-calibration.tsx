import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { FixedHtmlWork } from '@/components/fixed-html-work';
import type { WorkFraming } from '@/lib/work-framing';
import { patchWork, type AdminWork } from './work-types';

const DEFAULT: WorkFraming = {
  width: 1280,
  height: 720,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function CanvasDimension({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.value = String(value);
  }, [value]);
  return (
    <label>
      {label}
      <input
        ref={input}
        type="number"
        min={min}
        max={3840}
        step={1}
        defaultValue={value}
        onChange={(e) => {
          const n = e.currentTarget.valueAsNumber;
          if (Number.isInteger(n) && n >= min && n <= 3840) onChange(n);
        }}
        onBlur={(e) => {
          const n = Math.round(
            clamp(e.currentTarget.valueAsNumber || value, min, 3840),
          );
          e.currentTarget.value = String(n);
          onChange(n);
        }}
      />
    </label>
  );
}

export function WorkCalibration({
  work,
  onClose,
  onSaved,
}: {
  work: AdminWork;
  onClose: () => void;
  onSaved: (work: AdminWork) => void;
}) {
  const content = work.content?.kind === 'html' ? work.content : null;
  const [draft, setDraft] = useState<WorkFraming>(() => ({
    ...DEFAULT,
    ...content?.framing,
  }));
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [mobile, setMobile] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    draft: WorkFraming;
    kind: 'move' | 'canvas';
  } | null>(null);
  const dirty = clear
    ? !!content?.framing
    : JSON.stringify(draft) !==
      JSON.stringify({ ...DEFAULT, ...content?.framing });
  useEffect(() => {
    const dialog = modal.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = (patch: Partial<WorkFraming>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setClear(false);
    setError('');
  };
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const start = (event: PointerEvent<HTMLElement>, kind: 'move' | 'canvas') => {
    if (busy || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      draft,
      kind,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    if (d.kind === 'move')
      update({
        offsetX: clamp(d.draft.offsetX + dx / d.width, -1, 1),
        offsetY: clamp(d.draft.offsetY + dy / d.height, -1, 1),
      });
    else
      update({
        width: Math.round(clamp(d.draft.width + dx * 4, 320, 3840)),
        height: Math.round(clamp(d.draft.height + dy * 4, 240, 3840)),
      });
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      onSaved(await patchWork(work.id, { framing: clear ? null : draft }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  if (!content) return null;
  return (
    <dialog
      className="work-calibration"
      ref={modal}
      aria-labelledby="calibration-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="calibration-header">
        <div>
          <span className="works-eyebrow">
            作品 / {work.promptId} · {work.modelName}
          </span>
          <h2 id="calibration-title">画布校准</h2>
          <p>{work.title}</p>
        </div>
        <button onClick={close} disabled={busy} aria-label="关闭画布校准">
          ✕
        </button>
      </header>
      <div className="calibration-body">
        <section className="calibration-preview">
          <div className="calibration-preview-heading">
            <b>竞技场预览</b>
            <div className="works-segments">
              <button aria-pressed={!mobile} onClick={() => setMobile(false)}>
                桌面
              </button>
              <button aria-pressed={mobile} onClick={() => setMobile(true)}>
                手机
              </button>
            </div>
          </div>
          <div className="calibration-preview-mat">
            <div className={`calibration-camera ${mobile ? 'mobile' : ''}`}>
              <FixedHtmlWork
                content={content}
                canvas={draft}
                title={`${work.title} · 校准预览`}
                interactive={false}
              />
              <div
                className="calibration-drag"
                onPointerDown={(e) => start(e, 'move')}
                onPointerMove={move}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                aria-hidden="true"
              >
                <i />
                <i />
              </div>
            </div>
          </div>
          <p className="calibration-hint">
            拖动画面移动取景。手机与桌面使用同一构图；虚线仅用于对齐。
          </p>
          <details className="calibration-source">
            <summary>查看完整内部画布 · 拖右下角改变尺寸</summary>
            <div className="calibration-source-scroll">
              <div
                className="calibration-source-sheet"
                style={{ width: draft.width / 4, height: draft.height / 4 }}
              >
                <iframe
                  title={`${work.title} · 完整画布`}
                  src={'src' in content ? content.src : undefined}
                  srcDoc={'html' in content ? content.html : undefined}
                  sandbox={
                    'src' in content
                      ? 'allow-scripts allow-same-origin'
                      : 'allow-scripts'
                  }
                  style={{
                    width: draft.width,
                    height: draft.height,
                    transform: 'scale(.25)',
                  }}
                />
                <button
                  className="calibration-resize"
                  disabled={busy}
                  aria-label="拖动调整内部画布尺寸"
                  onPointerDown={(e) => start(e, 'canvas')}
                  onPointerMove={move}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                >
                  ↘
                </button>
              </div>
            </div>
          </details>
        </section>
        <aside className="calibration-settings">
          <fieldset disabled={busy}>
            <legend>1 · 装下完整作品</legend>
            <p>轮子在页面下方？先增加内部高度。</p>
            <div className="calibration-dimensions">
              {(['width', 'height'] as const).map((key) => (
                <CanvasDimension
                  key={key}
                  label={key === 'width' ? '内部宽度' : '内部高度'}
                  min={key === 'width' ? 320 : 240}
                  value={draft[key]}
                  onChange={(value) => update({ [key]: value })}
                />
              ))}
            </div>
            <div className="calibration-presets">
              {[720, 960, 1200, 1600].map((height) => (
                <button key={height} onClick={() => update({ height })}>
                  {height}px 高
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>2 · 调整取景</legend>
            <label>
              缩放 <output>{Math.round(draft.zoom * 100)}%</output>
              <input
                aria-label="取景缩放"
                type="range"
                min=".25"
                max="4"
                step=".01"
                value={draft.zoom}
                onChange={(e) => update({ zoom: Number(e.target.value) })}
              />
            </label>
            {(['offsetX', 'offsetY'] as const).map((key) => (
              <label key={key}>
                {key === 'offsetX' ? '水平位置' : '垂直位置'}
                <output>{Math.round(draft[key] * 100)}%</output>
                <input
                  aria-label={key === 'offsetX' ? '水平位置' : '垂直位置'}
                  type="range"
                  min="-1"
                  max="1"
                  step=".005"
                  value={draft[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <button onClick={() => update({ zoom: 1, offsetX: 0, offsetY: 0 })}>
              完整显示并居中
            </button>
            <p>
              放大取景会裁掉外围内容。请观看一段动画，确认头部、车轮和运动范围没有出界。
            </p>
          </fieldset>
          <button
            className="calibration-reset"
            disabled={busy}
            onClick={() => {
              setDraft({ ...DEFAULT });
              setClear(true);
            }}
          >
            恢复默认配置
          </button>
          <small>只保存显示配置，原始 HTML 不会被改写。</small>
        </aside>
      </div>
      <footer className="calibration-footer">
        <div aria-live="polite">
          {error ? (
            <span className="works-error">{error}</span>
          ) : discard ? (
            <span>
              修改尚未保存。
              <button disabled={busy} onClick={onClose}>
                放弃修改并关闭
              </button>
              <button disabled={busy} onClick={() => setDiscard(false)}>
                继续调整
              </button>
            </span>
          ) : (
            <span>
              {dirty ? '有未保存的调整' : '拖动或调整参数后保存'} ·
              前台刷新后生效
            </span>
          )}
        </div>
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="works-primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? '保存中…' : '保存校准'}
        </button>
      </footer>
    </dialog>
  );
}
