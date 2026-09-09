// 开发者面板：右下角低对比入口，仅本地使用，后期上线时删除挂载即可整体隐藏。
// 功能与 lib/placeholder.ts 的存储一一对应：占位符模式开关、模型数量、占位投票。
import { useEffect, useState } from 'react';
import {
  clearPlaceholderVotes,
  generatePlaceholderVotes,
  readDevSettings,
  readPlaceholderVotes,
  writeDevSettings,
  writePlaceholderVotes,
  type DevSettings,
} from '@/lib/placeholder';

const MODEL_COUNT_OPTIONS = [2, 4, 6, 8, 10, 12, 14, 16];
const GENERATED_VOTE_COUNT = 200;

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<DevSettings>(readDevSettings);
  const [voteCount, setVoteCount] = useState(
    () => readPlaceholderVotes().length,
  );
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const persist = (next: DevSettings, reload: boolean) => {
    writeDevSettings(next);
    setSettings(next);
    if (reload) window.location.reload();
  };

  const toggleMode = () => {
    const next = { ...settings, placeholderMode: !settings.placeholderMode };
    // 占位数据决定路由、配对与计数，切换必须整页重载，避免两套数据混流
    persist(next, true);
  };

  const changeCount = (count: number) => {
    // 模型数量决定占位阵容：阵容一变，既有占位投票里引用的 ph-xx 可能已不存在，
    // 先清空再持久化，避免脏票混入榜单演示
    clearPlaceholderVotes();
    setVoteCount(0);
    setStatus('已切换占位模型数量，原有占位投票已清空');
    persist(
      { ...settings, placeholderModelCount: count },
      settings.placeholderMode,
    );
  };

  const generateVotes = () => {
    writePlaceholderVotes(generatePlaceholderVotes(GENERATED_VOTE_COUNT));
    setVoteCount(readPlaceholderVotes().length);
    setStatus(`已生成 ${GENERATED_VOTE_COUNT} 条占位投票（仅存本地）`);
  };

  const clearVotes = () => {
    clearPlaceholderVotes();
    setVoteCount(0);
    setStatus('已清空占位投票');
  };

  return (
    <>
      {settings.placeholderMode && (
        <div className="dev-mode-badge" aria-hidden="true">
          PLACEHOLDER · 占位符模式
        </div>
      )}
      <button
        type="button"
        className="dev-entry"
        aria-expanded={open}
        aria-label="开发者面板"
        title="开发者面板"
        onClick={() => setOpen((value) => !value)}
      >
        dev
      </button>
      {open && (
        <div className="dev-panel" role="dialog" aria-label="开发者面板">
          <header>
            <strong>开发者面板</strong>
            <span>DEV / LOCAL ONLY</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭开发者面板">
              ×
            </button>
          </header>
          <label className="dev-row">
            <span>
              占位符模式
              <small>开启后题库与竞技场全部使用生成的占位作品</small>
            </span>
            <input
              type="checkbox"
              checked={settings.placeholderMode}
              onChange={toggleMode}
            />
          </label>
          <label className="dev-row">
            <span>占位模型数量</span>
            <select
              value={settings.placeholderModelCount}
              onChange={(event) => changeCount(Number(event.target.value))}
            >
              {MODEL_COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count} 个
                </option>
              ))}
            </select>
          </label>
          <div className="dev-row">
            <span>
              占位投票
              <small>随机生成榜单数据，仅存本地，不入库</small>
            </span>
            <button type="button" onClick={generateVotes}>
              生成 {GENERATED_VOTE_COUNT} 条
            </button>
          </div>
          <div className="dev-row">
            <span>现有占位投票：{voteCount} 条</span>
            <button
              type="button"
              onClick={clearVotes}
              disabled={voteCount === 0}
            >
              清空
            </button>
          </div>
          {status && <p className="dev-status">{status}</p>}
          <p className="dev-note">
            占位数据与真实数据严格隔离；切换开关会刷新页面。占位投票驱动
            #rank 偏好榜演示，仅存本地不入库。
          </p>
        </div>
      )}
    </>
  );
}
