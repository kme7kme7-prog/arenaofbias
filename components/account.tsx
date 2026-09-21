import { useI18n } from '@/lib/locale';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react';
import { UserRound, Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
type User = { id: string; username: string };
type Auth = {
  user: User | null;
  loading: boolean;
  open: () => void;
  refresh: () => Promise<void>;
};
const AccountContext = createContext<Auth | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('Missing account provider');
  return value;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { t, localize } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const sheet = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState<number>();
  const measureSheet = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setSheetHeight(node.getBoundingClientRect().height + 2);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    // 超时兜底（2026-09-20 审查修复）：请求挂起时 finally 永不执行，
    // loading 恒真会让账号按钮永久 disabled
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/auth/me', { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request === revision.current) setUser(data.user);
    } catch {
      /* A transient network error does not prove the session expired. */
    } finally {
      clearTimeout(timeout);
      if (request === revision.current) setLoading(false);
    }
  }, []);
  // 挂载时拉一次会话状态；单独放一个 effect，只依赖稳定的 refresh，
  // 否则下面的焦点 effect 会因 user/username/password 变化反复重跑、
  // 每次按键与登出后重渲染都补打一次 /me，和登出竞态把已登出的 UI 拉回登录态。
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const focus = () => {
      // 正在登录/注册表单里输入时跳过焦点刷新：别的标签页刚登录成功的话，
      // 这里一刷新会把表单突变成会员视图，已输入的账号密码直接丢失
      //（2026-09-15 修复——想看最新状态，关掉表单或提交即可）
      if (!user && (username || password)) return;
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('focus', focus);
    };
  }, [refresh, user, username, password]);
  // 键盘弹起会压缩布局视口（index.html 的 interactive-widget=resizes-content），
  // 但 Chrome 只在拿到焦点的那一刻滚一次，键盘动画结束时输入框常常还压在键盘下面
  // （真机 2026-09-19：密码框与提交按钮都够不着）。跟着 visualViewport 再滚一次。
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!opened || !viewport) return;
    const reveal = () => {
      const node = document.activeElement;
      if (node instanceof HTMLElement && sheet.current?.contains(node))
        node.scrollIntoView({ block: 'center', behavior: 'instant' });
    };
    const settle = setTimeout(reveal, 350);
    viewport.addEventListener('resize', reveal);
    return () => {
      clearTimeout(settle);
      viewport.removeEventListener('resize', reveal);
    };
  }, [opened]);
  const close = (next: boolean) => {
    if (submitting.current) return;
    setOpened(next);
    setError('');
    setPassword('');
    setConfirm('');
    setVisible(false);
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (!user && mode === 'register' && password !== confirm) {
      setError('两次输入的密码不一致。');
      return;
    }
    submitting.current = true;
    setBusy(true);
    revision.current++;
    try {
      const response = await fetch(`/api/auth/${user ? 'logout' : mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user ? {} : { username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
      revision.current++;
      setUser(data.user);
      setPassword('');
      setConfirm('');
      setUsername('');
      setOpened(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== 'Failed to fetch'
          ? cause.message
          : '暂时无法连接，请稍后重试。',
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };
  return (
    <AccountContext.Provider
      value={{ user, loading, open: () => close(true), refresh }}
    >
      {localize(children)}
      <Dialog open={opened} onOpenChange={close}>
        <DialogContent
          className="account-dialog"
          overlayClassName="account-overlay"
          data-mode={user ? 'member' : mode}
        >
          <div className="account-paper account-paper-back" aria-hidden="true">
            <span>{t('ARENA OF BIAS / FIELD NOTES')}</span>
          </div>
          <div
            className="account-paper account-paper-middle"
            aria-hidden="true"
          >
            <span>{t('每一种直觉，都值得留下。')}</span>
          </div>
          <div
            className="account-sheet"
            ref={sheet}
            style={{ height: sheetHeight }}
          >
            <div className="account-sheet-content" ref={measureSheet}>
              <div className="account-paper-meta" aria-hidden="true">
                <span>{t('偏见试验场 / 评审手记')}</span>
                <span>
                  {t('NO.')}
                  {localize(mode === 'register' && !user ? '02' : '01')}
                </span>
              </div>
              <div className="account-heading">
                <div className="account-eyebrow">
                  {t('YOUR SEAT / ARENA OF BIAS')}
                </div>
                <DialogTitle>
                  {localize(
                    user
                      ? '你的账号'
                      : mode === 'login'
                        ? '欢迎回到评审席。'
                        : '给你的直觉，一个席位。',
                  )}
                </DialogTitle>
                <DialogDescription>
                  {localize(
                    user
                      ? t('当前登录：{user}', { user: user.username })
                      : '登录后，用你的账号参与作品讨论。',
                  )}
                </DialogDescription>
                <div className="account-stamp" aria-hidden="true">
                  <span>{t('独立判断')}</span>

                  <span>{t('不必标准答案')}</span>
                </div>
              </div>
              <form onSubmit={submit} className="account-form">
                {!user && (
                  <>
                    <div className="account-modes">
                      <button
                        type="button"
                        aria-pressed={mode === 'login'}
                        disabled={busy}
                        onClick={() => {
                          setMode('login');
                          setError('');
                          setPassword('');
                          setConfirm('');
                        }}
                      >
                        <span>01</span> {t('登录')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === 'register'}
                        disabled={busy}
                        onClick={() => {
                          setMode('register');
                          setError('');
                          setPassword('');
                          setConfirm('');
                        }}
                      >
                        <span>02</span> {t('注册')}
                      </button>
                    </div>
                    <div className="account-fields" key={mode}>
                      <label htmlFor="account-name">
                        <span className="account-label">{t('账号')}</span>
                        <input
                          id="account-name"
                          name="username"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          minLength={3}
                          maxLength={24}
                          pattern="[A-Za-z0-9_]{3,24}"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          disabled={busy}
                          aria-describedby="account-name-help"
                          placeholder={t('在这里签下你的名字')}
                        />
                      </label>
                      <small id="account-name-help">
                        {t('3–24 位英文字母、数字或下划线，不区分大小写。')}
                      </small>
                      <label htmlFor="account-password">
                        <span className="account-label">{t('密码')}</span>
                        <div className="password-field">
                          <input
                            id="account-password"
                            name="password"
                            type={visible ? 'text' : 'password'}
                            autoComplete={
                              mode === 'login'
                                ? 'current-password'
                                : 'new-password'
                            }
                            required
                            minLength={12}
                            maxLength={128}
                            value={password}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            disabled={busy}
                            aria-describedby="account-password-help"
                            placeholder={t('只属于你的通行暗号')}
                          />
                          <button
                            type="button"
                            aria-label={t(visible ? '隐藏密码' : '显示密码')}
                            onClick={() => setVisible(!visible)}
                          >
                            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                      <small id="account-password-help">
                        {t('12–128 个字符，可使用较长的词组。')}
                      </small>
                      {mode === 'register' && (
                        <label htmlFor="account-confirm">
                          {t('确认密码')}
                          <input
                            id="account-confirm"
                            name="confirm-password"
                            type={visible ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            minLength={12}
                            maxLength={128}
                            value={confirm}
                            onChange={(event) => setConfirm(event.target.value)}
                            disabled={busy}
                          />
                        </label>
                      )}
                    </div>
                  </>
                )}
                <output className="account-error" aria-live="polite">
                  {localize(error)}
                </output>
                <button
                  className="account-submit"
                  disabled={busy || loading}
                  type="submit"
                >
                  {localize(
                    busy
                      ? '请稍候…'
                      : user
                        ? '退出登录'
                        : mode === 'login'
                          ? '登录，回到现场 ↗'
                          : '注册并登录 ↗',
                  )}
                </button>
                {!user && (
                  <small>
                    {t('登录状态保留 7 天。公共设备使用后请退出。')}
                  </small>
                )}
              </form>
              <div className="account-paper-footer" aria-hidden="true">
                <span className="account-barcode" />
                <span>{t('保留偏见 / 保持好奇')}</span>
                <span>
                  {t('AOB —')}
                  {localize(mode === 'register' && !user ? '02' : '01')}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AccountContext.Provider>
  );
}
export function AccountButton() {
  const { localize } = useI18n();
  const { user, loading, open } = useAccount();
  return (
    <button className="account-entry" onClick={open} disabled={loading}>
      <UserRound size={16} />
      <span>
        {loading
          ? localize('连接中…')
          : user?.username || localize('登录 / 注册')}
      </span>
    </button>
  );
}
