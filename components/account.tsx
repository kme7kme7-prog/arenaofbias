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
type User = {
  id: string;
  username: string;
  role: 'admin' | null;
  email: string | null;
};
type Mode = 'login' | 'register' | 'forgot' | 'bind';
type Success = 'login' | 'register' | 'reset' | 'bind' | 'logout';
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
// a***@example.com：会员视图里只亮出打码邮箱，完整地址不进 UI
const maskEmail = (email: string) => {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};
// Cloudflare Turnstile 人机验证（只守发验证码这一步，2026-09-24 用户拍板）：
// 站点密钥由 /api/auth/turnstile 下发，null = 服务端未配密钥，不渲染、不发 token。
// 脚本官方 api.js 懒加载一次，widget 显式渲染；发码后 token 一次性作废，
// 靠换 key 重挂组件拿到新 token
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}
let turnstileLoader: Promise<void> | null = null;
const loadTurnstile = () => {
  if (!turnstileLoader)
    turnstileLoader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        turnstileLoader = null; // 失败可重试：下次重挂组件再走一遍加载
        reject(new Error('turnstile script failed'));
      };
      document.head.appendChild(script);
    });
  return turnstileLoader;
};
function TurnstileGate({
  siteKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onUnavailable: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onUnavailable });
  // 渲染期不碰 ref（react-compiler 红线）：每次渲染后同步最新回调
  useEffect(() => {
    handlers.current = { onToken, onUnavailable };
  });
  useEffect(() => {
    let widget = '';
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        // token 一次性：拿到就回调，过期/出错回空串让按钮重新要求验证
        widget = window.turnstile.render(host.current, {
          sitekey: siteKey,
          callback: (token) => handlers.current.onToken(token),
          'expired-callback': () => handlers.current.onToken(''),
          'error-callback': () => handlers.current.onToken(''),
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey]);
  return <div className="account-turnstile" ref={host} />;
}
export function AccountProvider({ children }: { children: ReactNode }) {
  const { t, localize } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // 发码成功时服务端回传的打码邮箱（reset 流程用户只输账号，邮箱靠它展示）
  const [sentTo, setSentTo] = useState('');
  const [success, setSuccess] = useState<Success | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const [error, setError] = useState('');
  // 人机验证：siteKey 空串=服务端未开启（发码不带 token）；token 发码时随
  // 请求交出、之后作废；epoch 换一换就重挂 widget 拿新 token
  const [gateSiteKey, setGateSiteKey] = useState('');
  const [gateToken, setGateToken] = useState('');
  const [gateEpoch, setGateEpoch] = useState(0);
  // 翻页计数：驱动底纸堆每次切换换一个略不同的静止姿态（走 CSS transform 过渡），
  // 关弹窗时清零，下次打开回到默认姿态、不抢开场动画
  const turns = useRef(0);
  const turn = () => {
    turns.current += 1;
  };
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
  // 发码 60 秒倒计时（服务端同样有冷却，这里只是按钮上的引导）
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  // 开弹窗时问一次服务端要不要人机验证；没配密钥就一直空串，后面零打扰
  useEffect(() => {
    if (!opened || gateSiteKey) return;
    let cancelled = false;
    fetch('/api/auth/turnstile')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && typeof data.siteKey === 'string') setGateSiteKey(data.siteKey);
      })
      .catch(() => {
        /* 拿不到配置就当未开启，别拦着发码 */
      });
    return () => {
      cancelled = true;
    };
  }, [opened, gateSiteKey]);
  const close = (next: boolean) => {
    if (submitting.current) return;
    setOpened(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirm('');
    setEmail('');
    setCode('');
    setSentTo('');
    setStep(1);
    setSuccess(null);
    setCountdown(0);
    setVisible(false);
    setGateToken('');
    turns.current = 0;
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }
  };
  const switchMode = (next: Mode) => {
    turn();
    setMode(next);
    setStep(1);
    setError('');
    setNotice('');
    setPassword('');
    setConfirm('');
    setEmail('');
    setCode('');
    setSentTo('');
    setSuccess(null);
  };
  // 成功反馈页：亮出结果约 1.4 秒再走后续动作（关弹窗/回登录/回会员视图）
  const flashSuccess = (kind: Success, after: () => void) => {
    turn();
    setSuccess(kind);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => {
      successTimer.current = null;
      turn();
      after();
    }, 1400);
  };
  const sendCode = async () => {
    if (busy || sending || countdown > 0) return;
    if (gateSiteKey && !gateToken) {
      setError('请先完成人机验证。');
      return;
    }
    setError('');
    setNotice('');
    setSending(true);
    try {
      const purpose = user ? 'bind' : mode === 'forgot' ? 'reset' : 'register';
      const body =
        purpose === 'reset'
          ? { purpose, username: username.trim(), turnstileToken: gateToken }
          : { purpose, email: email.trim(), turnstileToken: gateToken };
      const response = await fetch('/api/auth/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '验证码发送失败，请重试。');
      setCountdown(60);
      setSentTo(data.email || '');
      setNotice(t('验证码已发送至 {email}。', { email: data.email || '' }));
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== 'Failed to fetch'
          ? cause.message
          : '暂时无法连接，请稍后重试。',
      );
    } finally {
      // token 一次性（无论成没成都交出去了）：重挂 widget 换新 token
      setGateToken('');
      setGateEpoch((epoch) => epoch + 1);
      setSending(false);
    }
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    setNotice('');
    if (
      !user &&
      (mode === 'register' || mode === 'forgot') &&
      step === 2 &&
      password !== confirm
    ) {
      setError('两次输入的密码不一致。');
      return;
    }
    submitting.current = true;
    setBusy(true);
    revision.current++;
    try {
      if (user && mode !== 'bind') {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
        revision.current++;
        setUser(null);
        flashSuccess('logout', () => setOpened(false));
        return;
      }
      if (user && mode === 'bind') {
        const response = await fetch('/api/auth/email/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), code }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
        revision.current++;
        setUser(data.user);
        setEmail('');
        setCode('');
        setSentTo('');
        flashSuccess('bind', () => {
          setMode('login');
          setSuccess(null);
        });
        return;
      }
      if (mode === 'login') {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
        revision.current++;
        setUser(data.user);
        setPassword('');
        setUsername('');
        flashSuccess('login', () => setOpened(false));
        return;
      }
      // register / forgot 第一步：预校验验证码（不消耗），过了才进第二步
      if (step === 1) {
        const body =
          mode === 'register'
            ? { purpose: 'register', email: email.trim(), code }
            : { purpose: 'reset', username: username.trim(), code };
        const response = await fetch('/api/auth/email/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || '验证码不正确或已过期，请重新获取。');
        turn();
        setStep(2);
        return;
      }
      const response = await fetch(
        `/api/auth/${mode === 'register' ? 'register' : 'password/reset'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mode === 'register'
              ? { username, email: email.trim(), code, password }
              : { username: username.trim(), code, password },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
      revision.current++;
      if (mode === 'register') {
        setUser(data.user);
        setPassword('');
        setConfirm('');
        setUsername('');
        setEmail('');
        setCode('');
        setSentTo('');
        flashSuccess('register', () => setOpened(false));
      } else {
        setPassword('');
        setConfirm('');
        setCode('');
        setSentTo('');
        flashSuccess('reset', () => {
          setMode('login');
          setStep(1);
          setSuccess(null);
          setNotice('密码已重置，请用新密码登录。');
        });
      }
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
  const goBack = () => {
    turn();
    setStep(1);
    setError('');
    setNotice('');
  };
  // 人机验证块只出现在会发码的三处（注册/找回第一步、绑定）；key=epoch
  // 让发码后重挂换新 token
  const gate = gateSiteKey ? (
    <TurnstileGate
      key={gateEpoch}
      siteKey={gateSiteKey}
      onToken={setGateToken}
      onUnavailable={() => setError('人机验证加载失败，请刷新页面重试。')}
    />
  ) : null;
  const codeSendButton = (disabled: boolean) => (
    <button
      type="button"
      className="account-code-send"
      disabled={disabled || busy || sending || countdown > 0}
      onClick={sendCode}
    >
      {countdown > 0
        ? t('{seconds} 秒后可重发', { seconds: countdown })
        : localize(sending ? '发送中…' : '发送验证码')}
    </button>
  );
  const codeField = (
    <label htmlFor="account-code">
      <span className="account-label">{t('验证码')}</span>
      <input
        id="account-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) =>
          setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
        }
        disabled={busy}
        placeholder={t('6 位验证码')}
      />
    </label>
  );
  const passwordField = (kind: 'current' | 'new') => (
    <label htmlFor="account-password">
      <span className="account-label">{t('密码')}</span>
      <div className="password-field">
        <input
          id="account-password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={kind === 'current' ? 'current-password' : 'new-password'}
          required
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
  );
  const confirmField = (
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
  );
  const SUCCESS_COPY: Record<Success, { title: string; description: string }> = {
    login: { title: '登录成功。', description: '现在可以参与投票与讨论。' },
    register: {
      title: '注册成功。',
      description: '邮箱已绑定，忘记密码时可凭它找回。',
    },
    reset: {
      title: '密码已重置。',
      description: '所有设备已退出，请用新密码登录。',
    },
    bind: {
      title: '邮箱已绑定。',
      description: '忘记密码时可凭它找回。',
    },
    logout: { title: '已退出登录。', description: '随时回来。' },
  };
  const pageKey = success
    ? `success:${success}`
    : user
      ? mode === 'bind'
        ? 'bind'
        : 'member'
      : `${mode}:${step}`;
  // 底纸堆的静止姿态随翻页轮换（默认值与 CSS 类一致；翻过页才覆盖，
  // 不影响开场 data-starting-style 动画）
  const swaySign = turns.current % 2 === 0 ? 1 : -1;
  const swayLift = (turns.current % 3) - 1;
  const paperBackStyle =
    turns.current > 0
      ? {
          transform: `translate(${-13 - swaySign * 4}px, ${7 + swayLift}px) rotate(${-4 + swaySign * 1.8}deg)`,
        }
      : undefined;
  const paperMiddleStyle =
    turns.current > 0
      ? {
          transform: `translate(${12 + swaySign * 4}px, ${10 - swayLift}px) rotate(${2.7 - swaySign * 1.4}deg)`,
        }
      : undefined;
  return (
    <AccountContext.Provider
      value={{ user, loading, open: () => close(true), refresh }}
    >
      {localize(children)}
      <Dialog open={opened} onOpenChange={close}>
        <DialogContent
          className="account-dialog"
          overlayClassName="account-overlay"
          data-mode={user ? (mode === 'bind' ? 'bind' : 'member') : mode}
        >
          <div
            className="account-paper account-paper-back"
            style={paperBackStyle}
            aria-hidden="true"
          >
            <span>{t('ARENA OF BIAS / FIELD NOTES')}</span>
          </div>
          <div
            className="account-paper account-paper-middle"
            style={paperMiddleStyle}
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
              {/* key 驱动换纸：切模式/切步/成功反馈整页重放入场动画 */}
              <div className="account-page" key={pageKey}>
                <div className="account-paper-meta" aria-hidden="true">
                  <span>{t('偏见试验场 / 评审手记')}</span>
                  <span>
                    {t('NO.')}
                    {localize(
                      !user && mode === 'register'
                        ? '02'
                        : user && mode === 'bind'
                          ? '03'
                          : '01',
                    )}
                  </span>
                </div>
                {success ? (
                  <div className="account-success" role="status">
                    <span className="account-success-mark" aria-hidden="true">
                      ✓
                    </span>
                    <DialogTitle>
                      {localize(SUCCESS_COPY[success].title)}
                    </DialogTitle>
                    <DialogDescription>
                      {localize(SUCCESS_COPY[success].description)}
                    </DialogDescription>
                  </div>
                ) : (
                  <>
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
                              : mode === 'register'
                                ? '给你的直觉，一个席位。'
                                : '忘了暗号，也能回来。',
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        {localize(
                          user
                            ? user.role === 'admin'
                              ? t('当前登录：{user} · 管理员，可直接从玩法菜单进入正式测评。', { user: user.username })
                              : t('当前登录：{user}', { user: user.username })
                            : mode === 'forgot'
                              ? step === 1
                                ? '输入账号，验证码将发到绑定的邮箱。'
                                : '验证通过，设置新密码（重置后所有设备需重新登录）。'
                              : mode === 'register' && step === 2
                                ? '邮箱已验证，设置账号和密码。'
                                : mode === 'register'
                                  ? '注册需要一个常用邮箱：先收个验证码。'
                                  : '登录后，用你的账号参与作品讨论。',
                        )}
                      </DialogDescription>
                      <div className="account-stamp" aria-hidden="true">
                        <span>{t('独立判断')}</span>

                        <span>{t('不必标准答案')}</span>
                      </div>
                    </div>
                    <form onSubmit={submit} className="account-form">
                      {!user && mode !== 'forgot' && (
                        <div className="account-modes">
                          <button
                            type="button"
                            aria-pressed={mode === 'login'}
                            disabled={busy}
                            onClick={() => switchMode('login')}
                          >
                            <span>01</span> {t('登录')}
                          </button>
                          <button
                            type="button"
                            aria-pressed={mode === 'register'}
                            disabled={busy}
                            onClick={() => switchMode('register')}
                          >
                            <span>02</span> {t('注册')}
                          </button>
                        </div>
                      )}
                      {!user && (
                        <div className="account-fields">
                          {mode === 'forgot' && step === 1 && (
                            <>
                              <button
                                type="button"
                                className="account-link"
                                disabled={busy}
                                onClick={() => switchMode('login')}
                              >
                                ← {t('返回登录')}
                              </button>
                              <label htmlFor="account-reset-name">
                                <span className="account-label">
                                  {t('账号')}
                                </span>
                                <div className="code-field">
                                  <input
                                    id="account-reset-name"
                                    name="username"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    required
                                    minLength={3}
                                    maxLength={24}
                                    pattern="[A-Za-z0-9_]{3,24}"
                                    value={username}
                                    onChange={(event) =>
                                      setUsername(event.target.value)
                                    }
                                    disabled={busy}
                                    placeholder={t('在这里签下你的名字')}
                                  />
                                  {codeSendButton(
                                    !/^[A-Za-z0-9_]{3,24}$/.test(
                                      username.trim(),
                                    ),
                                  )}
                                </div>
                              </label>
                              {codeField}
                              {gate}
                            </>
                          )}
                          {mode === 'forgot' && step === 2 && (
                            <>
                              <p className="account-verified">
                                {t('验证码已通过验证')}
                                {sentTo && ` · ${sentTo}`}
                              </p>
                              {passwordField('new')}
                              <small id="account-password-help">
                                {t('12–128 个字符，可使用较长的词组。')}
                              </small>
                              {confirmField}
                              <button
                                type="button"
                                className="account-link"
                                disabled={busy}
                                onClick={goBack}
                              >
                                ← {t('上一步')}
                              </button>
                            </>
                          )}
                          {mode === 'register' && step === 1 && (
                            <>
                              <label htmlFor="account-email">
                                <span className="account-label">
                                  {t('邮箱')}
                                </span>
                                <div className="code-field">
                                  <input
                                    id="account-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    required
                                    maxLength={254}
                                    value={email}
                                    onChange={(event) =>
                                      setEmail(event.target.value.trim())
                                    }
                                    disabled={busy}
                                    placeholder={t('请输入常用邮箱')}
                                  />
                                  {codeSendButton(!email.trim())}
                                </div>
                              </label>
                              {codeField}
                              {gate}
                            </>
                          )}
                          {mode === 'register' && step === 2 && (
                            <>
                              <p className="account-verified">
                                {t('邮箱已验证')}
                                {sentTo && ` · ${sentTo}`}
                              </p>
                              <label htmlFor="account-name">
                                <span className="account-label">
                                  {t('账号')}
                                </span>
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
                                  onChange={(event) =>
                                    setUsername(event.target.value)
                                  }
                                  disabled={busy}
                                  aria-describedby="account-name-help"
                                  placeholder={t('在这里签下你的名字')}
                                />
                              </label>
                              <small id="account-name-help">
                                {t('3–24 位英文字母、数字或下划线，不区分大小写。')}
                              </small>
                              {passwordField('new')}
                              <small id="account-password-help">
                                {t('12–128 个字符，可使用较长的词组。')}
                              </small>
                              {confirmField}
                              <button
                                type="button"
                                className="account-link"
                                disabled={busy}
                                onClick={goBack}
                              >
                                ← {t('上一步')}
                              </button>
                            </>
                          )}
                          {mode === 'login' && (
                            <>
                              <label htmlFor="account-name">
                                <span className="account-label">
                                  {t('账号')}
                                </span>
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
                                  onChange={(event) =>
                                    setUsername(event.target.value)
                                  }
                                  disabled={busy}
                                  aria-describedby="account-name-help"
                                  placeholder={t('在这里签下你的名字')}
                                />
                              </label>
                              <small id="account-name-help">
                                {t('3–24 位英文字母、数字或下划线，不区分大小写。')}
                              </small>
                              {passwordField('current')}
                              <small id="account-password-help">
                                {t('12–128 个字符，可使用较长的词组。')}
                              </small>
                              <button
                                type="button"
                                className="account-link"
                                disabled={busy}
                                onClick={() => switchMode('forgot')}
                              >
                                {t('忘记密码？')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {user && mode === 'bind' && (
                        <div className="account-fields">
                          <label htmlFor="account-email">
                            <span className="account-label">{t('邮箱')}</span>
                            <div className="code-field">
                              <input
                                id="account-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                required
                                maxLength={254}
                                value={email}
                                onChange={(event) =>
                                  setEmail(event.target.value.trim())
                                }
                                disabled={busy}
                                placeholder={t('请输入常用邮箱')}
                              />
                              {codeSendButton(!email.trim())}
                            </div>
                          </label>
                          {codeField}
                          {gate}
                          <small>
                            {t('验证码将发到新邮箱，10 分钟内有效。')}
                          </small>
                          <button
                            type="button"
                            className="account-link"
                            disabled={busy}
                            onClick={() => switchMode('login')}
                          >
                            ← {t('返回')}
                          </button>
                        </div>
                      )}
                      {user && mode !== 'bind' && (
                        <div className="account-email-row">
                          <span className="account-label">{t('绑定邮箱')}</span>
                          <span className="account-email-value">
                            {user.email ? maskEmail(user.email) : t('未绑定')}
                          </span>
                          <button
                            type="button"
                            className="account-email-action"
                            disabled={busy}
                            onClick={() => switchMode('bind')}
                          >
                            {user.email ? t('换绑') : t('绑定')}
                          </button>
                        </div>
                      )}
                      <output className="account-error" aria-live="polite">
                        {localize(error)}
                      </output>
                      <output className="account-notice" aria-live="polite">
                        {localize(notice)}
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
                              ? mode === 'bind'
                                ? '绑定并验证 ↗'
                                : '退出登录'
                              : mode === 'login'
                                ? '登录，回到现场 ↗'
                                : mode === 'register'
                                  ? step === 1
                                    ? '验证邮箱，继续 ↗'
                                    : '注册并登录 ↗'
                                  : step === 1
                                    ? '验证，继续 ↗'
                                    : '重置密码 ↗',
                        )}
                      </button>
                      {!user && (
                        <small>
                          {t('登录状态保留 7 天。公共设备使用后请退出。')}
                        </small>
                      )}
                    </form>
                  </>
                )}
                <div className="account-paper-footer" aria-hidden="true">
                  <span className="account-barcode" />
                  <span>{t('保留偏见 / 保持好奇')}</span>
                  <span>
                    {t('AOB —')}
                    {localize(
                      !user && mode === 'register'
                        ? '02'
                        : user && mode === 'bind'
                          ? '03'
                          : '01',
                    )}
                  </span>
                </div>
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
