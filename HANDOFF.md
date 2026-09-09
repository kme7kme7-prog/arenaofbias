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
- 2026-09-09 本轮：左上角返回入口动效——竞技场 brand 由纯 div 变 `#home` 链接；字标本体保持朴素，动效只做在 mark 图标上（主界面按钮语言：硬投影、悬停微抬、按压回平），定稿形态见 [左上角返回入口归档](docs/handoff/2026-09-09-左上角返回入口按钮化-kme7kme7-prog.md)。
- 2026-09-09 本轮：开发者占位符系统——右下角隐藏 "dev" 面板开启占位符模式后，题库与竞技场全量替换为生成的占位作品（与真实数据严格隔离、设置与占位投票仅存 localStorage），并可随机生成占位投票为榜单 UI 备料，见 [占位符模式与开发者面板归档](docs/handoff/2026-09-09-占位符模式与开发者面板-kme7kme7-prog.md)。
- 2026-09-09 本轮修复（代码审查发现）：占位投票与模型数量可能失配——切换占位模型数量时自动清空占位投票，`readPlaceholderVotes` 按当前阵容过滤兜底（防手工改 localStorage 的残留脏票）；`validate:placeholder` 扩至 9 项。

## 最新交接

- 占位符系统已完成并验证：typecheck / lint（0 错误）/ validate:arena（11 项）/ validate:scroll / validate:placeholder（9 项，新脚本，含"切模型数量过滤旧票"回归断言）/ build 全部通过；浏览器目视：开关生效、题库 7 题各 8 模型全部可入场、004 配对/投票/揭晓显示"占位 · 模型 NN"、换组避开上一轮、评论区替换为停用提示、生成 200 条占位投票、关闭后真实数据完整恢复。
- 换组与投票按钮在特定阶段有悬停/高亮动效，IAB 指针探测会被卡住，验证时改用键盘快捷键（A/D 投票、N 换组）——真实用户点击正常，属测试环境问题。
- 本轮改动**未提交**（等用户确认）。
- 更早一轮的改动与遗留核对见 [左上角返回入口归档](docs/handoff/2026-09-09-左上角返回入口按钮化-kme7kme7-prog.md) 与 [真实样例接入与防泄漏换组归档](docs/handoff/2026-09-09-真实样例接入与防泄漏换组-Atmeplz.md)。

## 待办（下一步候选，非约束）

- **投票落库 + 榜单 UI（用户已定为下一步）**：votes 表按 `scope`（real/placeholder）严格分流；占位世界已有 `generatePlaceholderVotes()` 与 localStorage 存取（`arenaofbias:placeholder-votes`）可直接喂榜单演示。
- 004–007 接入模型结果（操作步骤见 `docs/ARCHITECTURE.md` 扩充一节；上轮已验证 `public/works/` + `kind:'html'` 路径可行，注意 dist 需相对路径或构建时 `--base=./`；真实测试集在用户桌面 `AI测试流程设计/模型输出结果`）。
- 已知不一致：竞技场页"本场收录 N 个模型"未过滤 isDemo，与提示词库页口径不同（用户当前不可见，见 `docs/ARCHITECTURE.md` 技术备注）。
- 待用户拍板：002/003 虚构模型身份的长期取向。
- `docs/IDEAS.md` 全部条目均为候选，未经确认不得开发。

## 历史验证备注（2026-09-08 改名阶段）

- 当时通过：`npm run typecheck`、`npm run lint`（0 错误）、`npm run validate:arena`（11 项）、`npm run validate:scroll`；字标形态已经浏览器目视确认。各轮完整验证见 `docs/handoff/` 对应归档。
