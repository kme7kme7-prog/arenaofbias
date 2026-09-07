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
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (request === revision.current) setUser(data.user);
    } catch {
      /* A transient network error does not prove the session expired. */
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
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
      {children}
      <Dialog open={opened} onOpenChange={close}>
        <DialogContent className="account-dialog">
          <div className="account-eyebrow">YOUR SEAT / BIAS ARENA</div>
          <DialogTitle>
            {user
              ? '你的账号'
              : mode === 'login'
                ? '欢迎回到评审席。'
                : '给你的直觉，一个席位。'}
          </DialogTitle>
          <DialogDescription>
            {user
              ? `当前登录：${user.username}`
              : '登录后，用你的账号参与作品讨论。'}
          </DialogDescription>
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
                    登录
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
                    注册
                  </button>
                </div>
                <label htmlFor="account-name">
                  账号
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
                  />
                </label>
                <small id="account-name-help">
                  3–24 位英文字母、数字或下划线，不区分大小写。
                </small>
                <label htmlFor="account-password">
                  密码
                  <div className="password-field">
                    <input
                      id="account-password"
                      name="password"
                      type={visible ? 'text' : 'password'}
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
                      required
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                      aria-describedby="account-password-help"
                    />
                    <button
                      type="button"
                      aria-label={visible ? '隐藏密码' : '显示密码'}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <small id="account-password-help">
                  12–128 个字符，可使用较长的词组。
                </small>
                {mode === 'register' && (
                  <label htmlFor="account-confirm">
                    确认密码
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
              </>
            )}
            <output className="account-error" aria-live="polite">
              {error}
            </output>
            <button
              className="account-submit"
              disabled={busy || loading}
              type="submit"
            >
              {busy
                ? '请稍候…'
                : user
                  ? '退出登录'
                  : mode === 'login'
                    ? '登录，回到现场 ↗'
                    : '注册并登录 ↗'}
            </button>
            {!user && <small>登录状态保留 7 天。公共设备使用后请退出。</small>}
          </form>
        </DialogContent>
      </Dialog>
    </AccountContext.Provider>
  );
}
export function AccountButton() {
  const { user, loading, open } = useAccount();
  return (
    <button className="account-entry" onClick={open} disabled={loading}>
      <UserRound size={16} />
      <span>{loading ? '连接中…' : user?.username || '登录 / 注册'}</span>
    </button>
  );
}
