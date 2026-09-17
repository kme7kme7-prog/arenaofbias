import { useI18n } from '@/lib/locale';
// 开发者面板：右下角低对比入口，仅本地使用，后期上线时删除挂载即可整体隐藏。
// 功能与 lib/placeholder.ts 的存储一一对应：占位符模式开关、模型数量、占位投票。
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/account';
import { SurfaceTransition } from '@/lib/ui-transitions';
import {
  clearPlaceholderVotes,
  generatePlaceholderVotes,
  readDevSettings,
  readPlaceholderVotes,
  writeDevSettings,
  writePlaceholderVotes,
  type DevSettings,
} from '@/lib/placeholder';
import {
  readHomeEdition,
  writeHomeEdition,
  type HomeEdition,
} from '@/lib/home-edition';

const MODEL_COUNT_OPTIONS = [2, 4, 6, 8, 10, 12, 14, 16];
const GENERATED_VOTE_COUNT = 200;

export function DevPanel() {
  const { t, localize } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<DevSettings>(readDevSettings);
  const [voteCount, setVoteCount] = useState(
    () => readPlaceholderVotes().length,
  );
  const [status, setStatus] = useState('');
  const [devBusy, setDevBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [homeEdition, setHomeEdition] = useState<HomeEdition>(readHomeEdition);
  const { user, refresh: refreshAccount } = useAccount();

  // 清空 dev 自己的真实投票（服务端 DELETE + 榜单刷新），本地反复测试用。
  // 只清 dev 账号的票，不碰任何真实用户数据。
  const clearMyVotes = async () => {
    setClearBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/dev/clear-my-votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await response.json().catch(() => ({}))) as {
        cleared?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '清空失败');
      setStatus(
        `已清空 dev 的 ${data.cleared ?? 0} 条真实投票，可以重新投票测试；后台流水与偏好榜随之更新`,
      );
      notifyVotesChanged();
    } catch (cause) {
      setStatus(
        cause instanceof Error && cause.message !== 'Failed to fetch'
          ? cause.message
          : '无法连接服务端，清空需要服务端在线。',
      );
    } finally {
      setClearBusy(false);
    }
  };

  const devSignIn = async () => {
    setDevBusy(true);
    setStatus('');
    try {
      // 无 body 的 POST 会被 auth 中间件的 req.is() 判为非 JSON，需带空对象
      const response = await fetch('/api/auth/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '开发者登录失败');
      await refreshAccount();
      setStatus('已以开发者身份（dev）登录，投票与评论都会计入。');
    } catch (cause) {
      setStatus(
        cause instanceof Error && cause.message !== 'Failed to fetch'
          ? cause.message
          : '无法连接服务端（npm run dev 的 api 部分）。开发者登录需要服务端在线。',
      );
    } finally {
      setDevBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 面板开合走 SurfaceTransition：进入中途关闭会从当前
  // 透明度/位移接续退出，不跳变。hidden 属性由它托管，JSX 里保持常量 true，
  // React 不会覆盖（prop 不变不写 DOM）。
  const panelRef = useRef<HTMLDivElement>(null);
  const transitionRef = useRef<SurfaceTransition | null>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!transitionRef.current)
      transitionRef.current = new SurfaceTransition(panel, panel);
    const transition = transitionRef.current;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (open) transition.show(reduced);
    else transition.hide(reduced);
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

  const toggleRandomStrength = () => {
    const next = { ...settings, randomStrength: !settings.randomStrength };
    // 只影响之后生成的投票，不需要重载；既有占位投票保持不变
    persist(next, false);
    setStatus(
      next.randomStrength
        ? '已开启随机强弱：之后每次「生成占位投票」都会重新随机名次格局'
        : '已关闭随机强弱：恢复固定的模型强弱设定（名次可复现）',
    );
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
    notifyVotesChanged();
  };

  const clearVotes = () => {
    clearPlaceholderVotes();
    setVoteCount(0);
    setStatus('已清空占位投票');
    notifyVotesChanged();
  };

  // 首页版本定稿新版后，三版对比入口收进面板（决策 086）：
  // 写入后派事件，首页即时换版；其他页面下次进首页重读
  const changeHomeEdition = (value: HomeEdition) => {
    writeHomeEdition(value);
    setHomeEdition(value);
    setStatus(
      t('已切换首页版本：{name}（在首页打开面板时立即生效）', {
        name: t(
          value === 'old' ? '经典版' : value === 'duel' ? '对决版' : '新版',
        ),
      }),
    );
  };

  // 同一页面内 localStorage 写入不会触发 storage 事件，
  // 榜单页靠这个自定义事件立即重读占位投票（否则要手动「重播入场」）
  const notifyVotesChanged = () => {
    window.dispatchEvent(new CustomEvent('aob:placeholder-votes-changed'));
  };

  return (
    <>
      {settings.placeholderMode && (
        <div className="dev-mode-badge" aria-hidden="true">
          {t('PLACEHOLDER · 占位符模式')}
        </div>
      )}
      <button
        type="button"
        className="dev-entry"
        aria-expanded={open}
        aria-label={t('开发者面板')}
        title={t('开发者面板')}
        onClick={() => setOpen((value) => !value)}
      >
        {t('dev')}
      </button>
      <div
        className="dev-panel"
        role="dialog"
        aria-label={t('开发者面板')}
        ref={panelRef}
        hidden
      >
        <header>
          <strong>{t('开发者面板')}</strong>
          <span>{t('DEV / LOCAL ONLY')}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('关闭开发者面板')}
          >
            ×
          </button>
        </header>
        <div className="dev-row">
          <span>
            {t('开发者身份')}
            <small>
              {localize(
                user
                  ? user.username === 'dev'
                    ? '当前已以 dev 身份登录'
                    : `已登录账号 ${user.username}，无需开发者登录`
                  : '一键以 dev 账号登录（投票计入），无需输密码',
              )}
            </small>
          </span>
          <button
            type="button"
            onClick={devSignIn}
            disabled={devBusy || !!user}
          >
            {localize(devBusy ? '登录中…' : '免登录进入')}
          </button>
        </div>
        <label className="dev-row">
          <span>
            {t('首页版本')}
            <small>{t('三版首页对比入口，默认新版')}</small>
          </span>
          <select
            value={homeEdition}
            onChange={(event) =>
              changeHomeEdition(event.target.value as HomeEdition)
            }
          >
            <option value="new">{t('新版')}</option>
            <option value="old">{t('经典版')}</option>
            <option value="duel">{t('对决版')}</option>
          </select>
        </label>
        <label className="dev-row">
          <span>
            {t('占位符模式')}
            <small>{t('开启后题库与竞技场全部使用生成的占位作品')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.placeholderMode}
            onChange={toggleMode}
          />
        </label>
        <label className="dev-row">
          <span>{t('占位模型数量')}</span>
          <select
            value={settings.placeholderModelCount}
            onChange={(event) => changeCount(Number(event.target.value))}
          >
            {MODEL_COUNT_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count} {t('个')}
              </option>
            ))}
          </select>
        </label>
        <div className="dev-row">
          <span>
            {t('随机强弱')}
            <small>
              {t('开启后每次生成的名次格局都不同，适合观察榜单换位动画')}
            </small>
          </span>
          <input
            type="checkbox"
            checked={settings.randomStrength}
            onChange={toggleRandomStrength}
          />
        </div>
        <div className="dev-row">
          <span>
            {t('占位投票')}
            <small>{t('随机生成榜单数据，仅存本地，不入库')}</small>
          </span>
          <button type="button" onClick={generateVotes}>
            {t('生成')}
            {GENERATED_VOTE_COUNT} {t('条')}
          </button>
        </div>
        <div className="dev-row">
          <span>
            {t('现有占位投票：')}
            {voteCount} {t('条')}
          </span>
          <button type="button" onClick={clearVotes} disabled={voteCount === 0}>
            {t('清空')}
          </button>
        </div>
        {user?.username === 'dev' && (
          <div className="dev-row">
            <span>
              {t('我的真实投票')}
              <small>
                {t(
                  '清空 dev 账号已落库的票（对局去重会让重复测试投不进，清掉即可重投）',
                )}
              </small>
            </span>
            <button type="button" onClick={clearMyVotes} disabled={clearBusy}>
              {localize(clearBusy ? '清空中…' : '清空重投')}
            </button>
          </div>
        )}
        {localize(status && <p className="dev-status">{localize(status)}</p>)}
        <p className="dev-note">
          {t(
            '占位数据与真实数据严格隔离；切换开关会刷新页面。占位投票驱动 #rank 偏好榜演示，仅存本地不入库。开发者身份走 /api/auth/dev，仅限本机回环（或服务端 ALLOW_DEV_LOGIN=1）。',
          )}
        </p>
      </div>
    </>
  );
}
