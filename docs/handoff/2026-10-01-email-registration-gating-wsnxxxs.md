# 2026-10-01 · 注册邮箱与未绑定账号计票 · wsnxxxs

- 负责人：wsnxxxs｜执行 AI：GPT-6.1 Sol medium 子代理。
- 范围：Show1 主 checkout 的账号弹窗、投票反馈、表态队列及对应文档；开始时工作区干净。本轮一条英文本地提交，未推送、未部署。

## 本轮目标与改动

- 用户明确要求同时完成 Show1 对共享后端注册必填验证邮箱的适配，以及旧未绑定账号的投票与表态反馈。
- `components/account.tsx` 增加注册邮箱与验证码，发码使用 register purpose 与现有 Turnstile；注册提交 username/password/email/code，不携带 Turnstile token。账号 context 提供直接打开绑定入口。
- `lib/votes.ts` 将 HTTP 200 的 counted=false/reason=unbound 视为未计票；`app/page.tsx` 显示未计入与绑定按钮，不刷新配对评分。真实票仍走后端，不写本地演示票。
- 未绑定账号点击表态先引导绑定，不增加计数或进入队列；`lib/reactions.ts` 对 403 email_required 提示绑定并清除已拒绝意图，界面重新读取计数。其他网络失败保留原重试行为，其他 403 不误认作邮箱拒绝。
- 隐私正文、PRODUCT 与 HANDOFF 同步，新增小型响应回归脚本，无新增依赖、迁移或后端修改。

## 决策

- 用户本轮明确变更此前自愿邮箱决定；按仓库约定在既有 DECISIONS 末尾记录。评论隐藏、主题与占位演示模式保持原约定。本轮只允许本地提交，没有推送/部署授权。

## 验证

- `npm run typecheck`、`npm run lint`、`npm run build`：通过。
- `node scripts/validate-email-gating.mjs`：未计票响应不会标记成功、邮箱拒绝会引导绑定并丢弃队列，全部通过。
- `node scripts/validate-reaction-queue.mjs`：既有并发取消、按题目隔离和换账号行为通过。
- 真实 Chromium（Edge headless），本地 Vite + API 桩，390×844：实际填写注册表单、匿名发码、验证码注册成功；请求 payload 校验通过，无 pageerror/横向溢出，截图已目检。证据位于忽略目录 `output/playwright/email-registration-smoke.mjs` 与 `email-registration-mobile.png`。
- 未跑旧 `validate:email`/`validate:votes`：它们启动本仓迁移前单体后端，不能验证当前共享后端契约。本轮新增脚本只校验前端响应行为；后端真实联调见共享后端轮次记录。
- 未验证真实 SMTP/Cloudflare、真机、生产或部署；没有使用生产凭据或发送生产请求。

## 遗留物与后续

- 本地构建 dist 与截图/烟测脚本为忽略生成物，不提交。当前数据包与原作未修改。
- 上线需要配套共享后端邮箱注册与资格门禁；发布授权及真实邮件服务验证仍待后续轮次。没有新增待拍板产品事项。
