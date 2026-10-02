# 2026-10-02 · 登录人机验证 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex主会话、GPT-6.1 Sol / high子代理

## 本轮目标

配套红队整改，在启用Turnstile的环境中给所有密码登录提供有效token。

## 改动

AccountProvider登录显示现有TurnstileGate，取配置时区分loading/ready/error，脚本失败保留明确提示；验证成功才发登录，每次请求后清空token并重挂widget。无siteKey保持本地兼容，注册/绑定/找回仍沿用原验证码流程。只修改components/account.tsx认证段落。

## 决策

所有账号密码校验前统一验证，由共享后端执行；三个入口配套上线，避免管理员用户名分流和旧前端缺token。没有新增独立决策日志或依赖。

## 验证

typecheck、lint、生产build通过。三个入口共12项生产编译隔离UI场景通过：siteKey有/无、配置down、脚本down、401/503后的token重置。采用候选前端CSP，无意外产品JS或CSP错误；日志中的401/503/脚本abort为预设故障。早期Vite开发harness的HMR CSP日志已由生产编译重验替代，不放行生产策略以适配HMR。

## 明确没做

未push/部署、更新数据包、写生产业务库、运行真实SMTP或Cloudflare用户挑战；未重验所有玩法、设备及作品交互。

## 遗留物

忽略产物output/redteam-login-20261002/game/，联合证据在共享后端output/playwright/redteam-login-results.json。所有本地服务及浏览器会话关闭；初始工作区干净。

## 下一步建议

用户明确授权push后按发布门禁从已合入上游main源码构建、配套上线后端/Gallery/game/Nginx，备份再执行后端v32迁移。
