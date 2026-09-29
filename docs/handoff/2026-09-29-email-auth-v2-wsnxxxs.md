# 2026-09-29 · email-auth-v2 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex
- 提交范围：`origin/main@d871c75` 至本分支单次提交

## 本轮目标

在共享后端上线前恢复 Show1 的可选邮箱绑定、忘记密码与注册 Turnstile；注册继续只需账号密码。

## 改动

- 以 `d871c75` 前账号弹窗为基础恢复相关表单、样式和双语文案，删除注册必填邮箱步骤，沿用当前用户名和密码规则。
- 忘记密码发码用不暴露账号/邮箱状态的统一提示；保留验证码预校验及新密码表单。
- 产品文档和决策日志记录新口径，架构文档注明旧 Express 邮箱接口只作历史参考。

## 决策

- 本轮用户明确覆盖旧「注册必填邮箱」与「Turnstile 只守发码」决定：邮箱选填；注册提交验证 Turnstile，绑定/找回发码也验证；缺密钥自动关闭。已记入 `docs/DECISIONS.md`。

## 验证

- `npm run typecheck`：通过。
- `npm run lint`：9 个既有脚本错误（`scripts/.tmp-mobile/*`、`grid-contrast-check`、`migrate-model-identity`、`.tmp-crosscheck`）；账号文件不在该命令范围。账号文件定向 oxlint 另有旧版 React Compiler / a11y 基线 6 错，未改动无关结构。
- `npm run validate:email`：旧 Express 后端 27/27 通过；此脚本仍按旧必填邮箱规则，不覆盖本轮共享后端契约。
- 本地 Chrome + Vite 代理 + server 分支 + 假 SMTP：无邮箱注册、绑定、找回重置、新密码登录通过。server 回归 89/89。

## 明确没做

- 未改分享卡，未部署、未合并。

## 遗留物

- 本轮 Playwright CLI 生成 `.playwright-cli/` 未跟踪，未提交；自动审查拒绝删除，需人工清理。

## 下一步建议

- server PR 先部署并配置 SMTP、按需开启 Turnstile；再部署 Show1 PR。
