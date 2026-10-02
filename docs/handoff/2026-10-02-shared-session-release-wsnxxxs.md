# 2026-10-02 · 共用会话协调发布 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 / Codex desktop
- 发布源码：22bb6b333aada695bf7b7f5edde65828c13e10a1；本篇为发布后的记录，不改变已发布产物。

## 本轮目标

用户授权四仓整理、提交、推送、部署，并要求联调。保留前轮共用会话、API lint、测试维护以及他人提交，不移除 game /api 反代。

## 改动

- 提交 fecfa6c（共用 API 会话、独立前端 fetch 限制、测试维护和文档），合入上游 12a626a Hero 改动得到 22bb6b3；唯一冲突在 HANDOFF，保留双方记录。origin/main 与 fork/main 都已同步，不重写作者历史。
- 从 main 固定源码干净 LF 导出生产构建，保持 npm run build 加载 .env.production；资源中的 API 基址确为 https://api.arenaofbias.icu。2026-10-02T10:04:51Z 与新后端、Gallery、固定数据包协调上线。
- 全部 820 个发布文件逐个 SHA-256 核对；变化 7 个，过时 5 个仅从新目录移除。普通复制新目录，完整核对后切换，旧目录和已有 prev 的本轮备份保留。

## 决策

沿用用户已选定的 API 主机会话、独立 API lint 和 build:check 方案。未新增长期决策；game /api 反代继续保留，移除观察时长及执行授权仍待用户决定。

## 验证

- 合入前后 lint / typecheck、固定版本生产 build 均通过；本轮 placeholder 10/10、formal 6/6。此前测试维护连续 placeholder 35/35、formal 3/3 及七项浏览器检查的逐项结果仍见 HANDOFF，未重复扩大范围。
- Hero 验证先因缺少专用预览服务失败，启动已有 preview-hero-arrival 后通过六种主题 / 视口、reduced motion、直接访问、离开 / 返回及失败路径。像素字节比较 2/6 相同，不声明逐像素一致；没有修改其业务代码。
- 固定源码、真实后端和固定包的隔离 Edge 联调 8 项通过：game 登录 → 已打开 Gallery 的账号控件更新；API 主机独占 Secure / HttpOnly / Lax 会话；带凭据的评论和有效盲评票；同账号返回不额外拉 bootstrap；Gallery 登出 → game 焦点刷新退出；Gallery 登录 → game 更新；管理端登录。临时 SQLite、测试账号、本机一次性 Turnstile 校验桩，页面异常 0。焦点等使用派发事件，不声称真实 OS 焦点或生产挑战已验证。
- 生产 13 项只读检查通过，含两站跨域读取和预检、安全头 / CSP、私有路径、静态 404、game 旧反代仍为 200、三入口桌面 / 手机加载及 Show1 API 请求全部在 API 主机。最终截图已目检，页面异常 0；拦截自动 track 写入，没有生产投票 / 评论 / 密码登录。验收浏览器首次网络 reset，禁用其 QUIC 后通过，没有改服务器协议。
- 与本轮无关的 portal-entry（Gallery 夹具缺配置）、formal-ui（旧文案）、admin-access（已转 Gallery 的旧入口）保留失败记录，未顺手修复；未再次执行其过时全量流程，原因是用户已抽查并接受本轮结果。

## 明确没做

未改旧 server/ 或 admin.html、Cookie 属性、生产账号角色和其他独立基础设施。生产真实账号 / Cloudflare 挑战的两站登录互通仍待用户浏览器配合，已询问；隔离联调不替代此验收。game /api 未移除。

## 遗留物

部署及浏览器证据在后端仓忽略的 output/four-repo-release-20261002；服务器备份在 /root/aob-shared-session-release-20261002/backup，show1-dist.prev / gallery.prev 保留。旧临时 aob-formal-I0Zhsj 再次被自动审批拒绝删除（仅 blocked by policy），未绕过。其他工作树和分支未清理。

## 下一步建议

真实浏览器完成 game 登录 → Gallery 切回后已登录 → Gallery 登出 → game 切回后未登录，DevTools 新会话 Cookie 只在 api 主机。原 game 用户需重登一次，旧 Cookie 自然过期。三项旧测试另开一轮决定更新方式。后续归档提交不需要重新发布相同产物。
