# 2026-10-08 · 皮肤恢复人数浮层 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Claude Code（Opus 5.5），无子代理
- 提交范围：`0deaefd..fix/skin-vote-count`，从 fork 提 PR 交 kme7 审核

## 本轮目标

审阅远端 0deaefd（两套皮肤对所有人启用）时发现：招牌版橘子题与深夜聊天投票后不显示「大家怎么选」浮层。用户要求从 fork 提 PR 给 kme7 审。

## 改动

- `app/page.tsx`：AudienceVerdict 的挂载条件去掉 `!orangeBoards && !nightChat`，其余条件（锁定/结果阶段、非正式、保存中/已保存/重复）不变。
- `docs/DECISIONS.md`：追加本轮决定。

## 决策

- 两套皮肤都恢复人数浮层，见 DECISIONS 2026-10-08 条目。
- 待 kme7 判断：浮层固定居中，会在约 2 秒内盖住橘子与两块招牌上沿（桌面），手机上盖住标题与橘子上半；是否需要为皮肤调整位置由皮肤作者决定。

## 验证

- `npm run typecheck`、`npm run lint`、`npm run build:check`：通过。
- 本地 5442 皮肤评审服务（只读公开作品，写入一律 403）：1440 桌面橘子题投票后浮层出现并截图目检；深夜聊天浮层挂载且为最上层（elementFromPoint 命中），约 2 秒自动收起，截图未抓到；375 手机橘子题浮层出现、无横向溢出。评审模式下浮层显示「演示模式不显示真实人数」。
- 未跑：check:motion、validate:* 全套与真实计票 —— 本轮只改挂载条件，未接生产或真实后端。

## 明确没做

- 未修改橘子题只渲染正文段落的问题：后端给游戏的文字作品只有 paragraphs，真实数据不受影响。
- 未修复 `scripts/prepare-orange-review.mjs`：新后端直接返回文字正文、不再给 HTML 地址，脚本读取 `source.src` 报错；本轮用临时脚本在忽略目录生成评审快照。
- 未部署。

## 遗留物

- 忽略目录 `.local/orange-review/` 保存评审快照。

## 下一步建议

- kme7 审核 PR，必要时为皮肤调整浮层位置；顺带更新 prepare-orange-review 以适配新后端。
