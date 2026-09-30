# 2026-09-30 · repository-cleanup · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex；配套三仓由 GPT-6.1 sol high 子 agent 分工。
- 提交范围：基于上游 `main@f160df9`，归并 `show1-vote-processing@984b3f2` 的独有文档；本仓一条英文提交。

## 本轮目标

按用户要求整理四个仓库、更新文档并提交，审阅分支后合并已完成工作、关闭已合入分支，保留仍有独有成果的工作线。

## 改动

- 本地 main 从 `38dad57` 快进至 `f160df9`。主站投票分支只剩 4 个文档的独有跟进；合入共享题库来源、长短原文、扩充步骤和历史验收补记，再以 shared-question-release 的最终上线状态纠正当前摘要。
- HANDOFF 从叠加的轮次日志改为当前状态、分支处理、剩余事项和历史索引。保留部署 SHA、备份位置与验证边界；原始完整状态仍可从 `f160df9:HANDOFF.md` 和已有各轮归档读取。
- README 增四仓职责与当前开发入口；ARCHITECTURE 区分共享后端、旧 Express 服务、当前静态发布与退役 PM2 脚本；PRODUCT 修正真实作品来源、主题入口、服务端榜单和旧管理后台的适用范围。
- AGENTS 提交语言统一为用户本轮要求的英文简单句。未改既有产品决策或追加新的功能任务。

## 分支证据与处理

- `origin/email-auth@0119e22` 已是 main 祖先，PR #2 已合并，删除远端分支。
- `origin/show1-vote-processing@984b3f2` 与 main 的共同功能提交为 `9805416`；只需归并 4 个文档。归并后清理远端与本 checkout 的旧工作分支；占用 worktree 的 `codex/shared-question-docs` 保留。
- `origin/codex/public-beta-repair@e4c3980` 与 main 分叉，仍有 `da27fc0`、`01680ee`、`20892d0`、`e4c3980` 四条独有提交，涉及 57 个业务/UI 文件及历史发布。上游与 fork 的该分支均保留，不把真实工作当作重复分支删除。
- 配套 Gallery 的 shared-question-intake、后端的 vote/shared-question-intake、数据仓的 docs-round3/provenance-intake/registry-harness-provider 已清理；后端独有的发布前文档跟进已保全至归档。占用的本地 worktree 保留，数据发布分支与不可变标签保留。
- 数据仓 PR #5 保留为草稿：38 件新增成果与当前题目和模型注册表有冲突。本轮补充其具体迁移和验收条件，未把这些成果加入 main。

## 决策

沿用既有不同前端独立维护、同题长短原文、稳定题号及不可变数据包约定；没有新的待拍板功能。用户已明确授权本轮提交及分支处理。

## 验证

- fetch 后逐一核对远端分支 SHA、祖先关系、PR 状态、独有文件和提交；删除使用 expected SHA lease，避免清理移动后的分支。
- 文档本地链接、冲突标记及 `git diff --check` 核对；本仓相对初始 main 的最终变更只包含 Markdown 文件。
- 未重跑 typecheck/build/lint 或浏览器：本仓只归并和整理文档，无运行代码变更。主题、榜单、邮箱和线上部署的已有验证保留在对应历史归档，不能视为本轮重新验收。

## 明确没做

本轮未部署、未改业务数据库、原作、数据包 pin、依赖、生产审核或 Nginx；未执行生产测试票或投稿。保留未完成的独有成果，不强行关闭其工作线。

## 遗留物与下一步

本仓初始工作区干净；忽略目录、已占用 worktree 与历史证据均保留。旧公测修复分支需另行按当前共享后端与前端决策审阅；数据仓 38 件成果需独立完整收录。两项均不属于本轮新增实现。
