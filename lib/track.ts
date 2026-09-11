// 页面浏览上报（后台访客统计，决策 040）：文档加载时 POST /api/track 一次。
// 服务端原来用中间件记 HTML 访问，但 dev 下页面由 vite 直发、Express 看不到
// 请求——改为前端上报后 dev 与生产行为一致。hash 路由切换不重复上报。
// 失败静默（统计不影响页面），无需登录（访客也要统计）。

export function trackPageView(path: string): void {
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path.slice(0, 64) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 上报失败不影响页面 */
  }
}
