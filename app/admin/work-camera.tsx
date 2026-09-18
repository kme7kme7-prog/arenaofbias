// 视角校准（决策 102）：预览 iframe 带 ?aob=bridge 加载，桥把作品的
// OrbitControls 登记到 contentWindow.__AOB__；管理员在画面里拖到好机位，
// 「抓取当前视角」读回 position/target 存进作品元数据（content.camera）。
// 前台竞技场加载同一作品时，服务端注入桥并套用保存的视角——源文件不动。
import { useEffect, useRef, useState } from 'react';
import type { WorkCamera } from '@/lib/arena';
import { patchWork, type AdminWork } from './work-types';

type BridgeApi = {
  controls: unknown[];
  getState?: () => WorkCamera | null;
  setState?: (state: WorkCamera) => void;
};

const fmt = (v: number) => v.toFixed(1);
const show = (c: WorkCamera | null) =>
  c ? `机位 ${c.position.map(fmt).join(', ')} · 目标 ${c.target.map(fmt).join(', ')}` : '';

export function WorkCameraCalibration({
  work,
  onClose,
  onSaved,
}: {
  work: AdminWork;
  onClose: () => void;
  onSaved: (work: AdminWork) => void;
}) {
  const content =
    work.content?.kind === 'html' && 'src' in work.content ? work.content : null;
  const saved = content?.camera ?? null;
  const modal = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [hook, setHook] = useState<'waiting' | 'ready' | 'none'>('waiting');
  const [draft, setDraft] = useState<WorkCamera | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = modal.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  // 轮询桥就绪：controls 登记即 ready；超时仍无 controls 判定不可钩（打包内联）
  useEffect(() => {
    const began = Date.now();
    const timer = setInterval(() => {
      const api = (
        frame.current?.contentWindow as unknown as
          | { __AOB__?: BridgeApi }
          | null
      )?.__AOB__;
      if (api?.controls?.length) {
        setHook('ready');
        return;
      }
      if (Date.now() - began > 10000) {
        setHook('none');
        clearInterval(timer);
      }
    }, 600);
    return () => clearInterval(timer);
  }, [work.id]);
  const bridge = () =>
    (
      frame.current?.contentWindow as unknown as
        | { __AOB__?: BridgeApi }
        | null
    )?.__AOB__;
  if (!content) return null;
  const dirty =
    !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async (camera: WorkCamera | null) => {
    setBusy(true);
    setError('');
    try {
      onSaved(await patchWork(work.id, { camera }));
      setDraft(null);
      if (camera === null) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      className="work-calibration work-camera"
      ref={modal}
      aria-labelledby="work-camera-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="calibration-header">
        <div>
          <span className="works-eyebrow">
            作品 / {work.promptId} · {work.modelName}
          </span>
          <h2 id="work-camera-title">视角校准</h2>
          <p>{work.title}</p>
        </div>
        <button onClick={onClose} disabled={busy} aria-label="关闭视角校准">
          ✕
        </button>
      </header>
      <div className="work-camera-body">
        <iframe
          ref={frame}
          title={`${work.title} · 视角校准预览`}
          src={`${content.src}?aob=bridge`}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
      <div className="work-camera-bar">
        <output
          className={`work-camera-hook ${hook}`}
          aria-live="polite"
        >
          {hook === 'waiting' && '等待作品上报相机…（首次加载需拉取 three）'}
          {hook === 'ready' && '相机已接管：在画面里拖拽旋转、滚轮缩放，调到满意后抓取'}
          {hook === 'none' && '未探测到可钩相机——该作品可能把 three 打包内联，视角校准不适用，请改用画布校准'}
        </output>
        <span className="work-camera-values">
          {show(draft) || (saved ? `已保存：${show(saved)}` : '未保存视角')}
        </span>
        <button
          disabled={hook !== 'ready' || busy}
          onClick={() => {
            const state = bridge()?.getState?.();
            if (state) setDraft(state);
            else setError('还没抓到相机——先在画面里拖动一下再试');
          }}
        >
          抓取当前视角
        </button>
        <button
          disabled={!draft || busy || hook !== 'ready'}
          onClick={() => draft && bridge()?.setState?.(draft)}
        >
          套回预览
        </button>
        <button
          disabled={busy}
          onClick={() => frame.current?.contentWindow?.location.reload()}
        >
          回作品原始视角
        </button>
        <button
          className="works-primary"
          disabled={!dirty || busy}
          onClick={() => void save(draft)}
        >
          {busy ? '保存中…' : '保存视角'}
        </button>
        {saved && (
          <button disabled={busy} onClick={() => void save(null)}>
            清除已存视角
          </button>
        )}
      </div>
      {(error || hook === 'none') && (
        <p className="works-error" role="alert">
          {error}
        </p>
      )}
      <small>
        只保存机位元数据并在前台注入桥套用，原始 HTML 不会被改写；不支持的作品保持原样。
      </small>
    </dialog>
  );
}
