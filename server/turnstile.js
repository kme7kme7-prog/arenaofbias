// Cloudflare Turnstile 人机验证（2026-09-24 用户拍板选用，候选含极验/自搓图形码）。
// 只守「发邮箱验证码」这一道：它是唯一真花钱的口子（SMTP 每发一封都是真信），
// 注册/绑定/找回都先拿码，等于全链路被它罩住；登录与后续提交不打扰用户。
// 不配密钥则整体关闭：/api/auth/turnstile 回 siteKey=null，前端不渲染 widget，
// 服务端校验直通——本地开发与自动化测试因此不引外部依赖；生产把两把密钥配进
// PM2 环境即开启。校验走 Node 自带 fetch，零新增依赖（deploy:vps 只传 git HEAD，
// 加依赖要单独评审安装，能不加就不加）。
// 环境变量：
//   TURNSTILE_SITE_KEY     站点密钥（公开，前端 widget 用，经下方接口下发）
//   TURNSTILE_SECRET_KEY   服务器密钥（siteverify 校验用，绝不外发）
//   TURNSTILE_VERIFY_URL   校验地址，默认 Cloudflare 官方；回归测试指向本地桩

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null;
export const turnstileEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

// 三态结果：ok 放行 / fail 没过（脚本或 token 过期）/ down 校验服务够不着
export const verifyTurnstile = async (token, ip) => {
  if (!turnstileEnabled()) return 'ok';
  if (typeof token !== 'string' || !token) return 'fail';
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set('remoteip', ip);
  try {
    const response = await fetch(
      process.env.TURNSTILE_VERIFY_URL ||
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body, signal: AbortSignal.timeout(8000) },
    );
    const data = await response.json();
    return data.success ? 'ok' : 'fail';
  } catch {
    // 宁可暂时拒绝也不放行：Cloudflare 够不着时让真人稍后重试，
    // 好过给刷接口的脚本开天窗
    return 'down';
  }
};

export function installTurnstile(app) {
  // 前端开弹窗时拿站点密钥：null 表示未开启，不渲染 widget、发码不带 token
  app.get('/api/auth/turnstile', (req, res) => {
    res.json({ siteKey: turnstileEnabled() ? turnstileSiteKey() : null });
  });
}
