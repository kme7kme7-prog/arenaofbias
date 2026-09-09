# HANDOFF.md · 当前状态

本文件是状态仪表盘：只放当前状态与阅读指引，每轮收工时更新。耐久事实（产品规则、架构、决策）归 `docs/` 各文档，本文不复述；冲突时以交接日志与 git 为准。

## 接手阅读顺序

1. `AGENTS.md`（协作约束，会被自动注入）
2. 本文
3. `docs/handoff/` 里日期最新的一份交接日志
4. 按需查阅：产品行为 `docs/PRODUCT.md` ｜ 架构与运行 `docs/ARCHITECTURE.md` ｜ 决策 `docs/DECISIONS.md` ｜ 想法库 `docs/IDEAS.md`
5. 首次接手先读 `README.md`（长期定位与原则）

## 当前状态（2026-09-09）

- 当前提交：见 git。Vite + React 前端、Express + SQLite 后端；提示词库 + 竞技场 + 账号评论体系；题库 7 题，其中仅 002/003 可配对（占位内容，虚构模型身份，见 `docs/PRODUCT.md` 内容真实性分级）。
- 2026-09-08 完成文档体系改造与全站改名 arenaofbias（字标 ARENA OF ＋ 酸底切角 BIAS 块）。
- 2026-09-09 Atmeplz 轮：换组防泄漏（决策 014）；作品 iframe 沙箱放行 `allow-same-origin` 修复 3D 黑屏（决策 015）；依赖瘦身 node_modules 365MB→230MB（决策 016）。
- 2026-09-09 本轮：四页左上角返回入口统一按钮化（竞技场 brand 由纯 div 变 `#home` 链接；边框+硬投影+悬停扫光/mark 动效/"⌂ 回到首页"提示标签），见 [左上角返回入口按钮化归档](docs/handoff/2026-09-09-左上角返回入口按钮化-kme7kme7-prog.md)。

## 最新交接

- 左上角入口按钮化已完成并验证：typecheck / lint（0 错误）/ validate:arena（11 项）/ build 通过；浏览器目视四页默认与悬停态、点击回首页、窄屏布局均正常。
- 接手核对：上轮所称本地遗留物（`public/works/004/` 4 份测试样例 + `lib/arena.ts` 4 条注册条目）**已不在工作区**（git 干净、目录缺失、`modelResults` 仅 5 条原始数据）；004 现为纯预览页形态，如需恢复要从桌面测试集重新接入。
- 更早一轮的改动、验证边界见 [真实样例接入与防泄漏换组归档](docs/handoff/2026-09-09-真实样例接入与防泄漏换组-Atmeplz.md)。
- 遗留观察：IAB 自动化点击本站部分按钮会因持续动画卡在稳定性检查（真实用户点击正常），属测试环境问题非产品问题。

## 待办（下一步候选，非约束）

- 004–007 接入模型结果（操作步骤见 `docs/ARCHITECTURE.md` 扩充一节；上轮已验证 `public/works/` + `kind:'html'` 路径可行，注意 dist 需相对路径或构建时 `--base=./`；本地样例现状见上"最新交接"）。
- 真实投票持久化与排行榜（当前投票不落库）。
- 已知不一致：竞技场页"本场收录 N 个模型"未过滤 isDemo，与提示词库页口径不同（用户当前不可见，见 `docs/ARCHITECTURE.md` 技术备注）。
- 待用户拍板：002/003 虚构模型身份的长期取向。
- `docs/IDEAS.md` 全部条目均为候选，未经确认不得开发。

## 历史验证备注（2026-09-08 改名阶段）

- 当时通过：`npm run typecheck`、`npm run lint`（0 错误）、`npm run validate:arena`（11 项）、`npm run validate:scroll`；字标形态已经浏览器目视确认。各轮完整验证见 `docs/handoff/` 对应归档。
