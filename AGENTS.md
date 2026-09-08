# AGENTS.md
接手先读 `HANDOFF.md`（当前状态与阅读指引）；历史交接日志在 `docs/handoff/`
提交信息简短中文。提交身份用当轮负责人自己的 GitHub 名与 noreply 邮箱（GitHub 靠邮箱认人），禁止工具名和幽灵邮箱（如 `Codex <codex@localhost>`）。
- **别人的遗留**：工作区中他人未提交、未跟踪的文件不动不删，先问用户。
- **决策即录**：用户当轮拍板的决定，当轮记入 `docs/DECISIONS.md`，能引原话就引原话；既有决策只能由用户显式推翻，不重提被否方案。
- **不越界**：README 是愿景不是功能清单；IDEAS.md 是想法库不是任务清单——未经用户确认不实施、不扩范围。
- **收工**：改动全部提交；按 `docs/handoff/_TEMPLATE.md` 写本轮交接日志、更新 `HANDOFF.md`；验证结果如实记录，没跑的写明原因。
- **生成物**：`data/` `dist/ ` `outputs/` 是本地数据与生成物，不入库、不手改。

## 文档地图
- `HANDOFF.md` — 当前状态与阅读指引
- `docs/handoff/` — 按日期归档的交接日志（模板 `_TEMPLATE.md`）
- `README.md` — 项目定位与长期愿景
- `docs/PRODUCT.md` — 产品当前行为
- `docs/ARCHITECTURE.md` — 架构、代码地图、本地运行与验证
- `docs/DECISIONS.md` — 决策日志，只追加
- `docs/DEPLOY.md` — 部署与运维
- `docs/IDEAS.md` — 候选想法库
- `docs/ARTWORK.md` — 演示素材生成记录
