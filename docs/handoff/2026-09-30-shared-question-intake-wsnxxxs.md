# 2026-09-30 · shared-question-intake · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：GPT-6 / Codex
- 范围：提示词类型、解析及题库/无结果预览 UI，起点 3e8360a。

## 本轮目标

消费与 gallery 共用的正式题目；用户最终要求长短版不拆题。

## 改动

Prompt 类型与远端解析保留 promptVariants；题库及待收录预览复用原文按钮。切换后正文和字符数对应所选版本，折叠状态重置。共享组件采用现有主题令牌，未修改动效/作品。

## 决策

最终用户指示已追加至 docs/DECISIONS.md 的 2026-09-30「长短提示词归属于同一道题」，覆盖此前拆题回答。

## 验证

- typecheck/build 通过；5 个改动源码文件定向 lint 通过。
- 全量 lint 报 9 条既有 scripts 错误，涉及 grid-contrast-check、.tmp-mobile、.tmp-crosscheck、migrate-model-identity；未修改不相关脚本。
- 真实浏览器题库 25 道命题，与同后端数据包的 20 正式题相对应；SupernovAI 长698/短124字符、云山巨城长1897/短183字符分别切换正确，待收录预览按钮正常。
- 目视桌面检查；390px override 未实际生效，仍 1280px，因此未完成手机验收。未验证全部原作交互。

## 明确没做

没有生成或加入作品、改变玩法/计分、写生产 SQLite、改历史票、push 或部署；当前新增题无作品则不开放投票。

## 遗留物

联调证据位于 gallery 的忽略 output/shared-question-intake-20260930。本轮服务收工关闭。

## 下一步建议

在 data 正式发布并更新后端版本后，配套发布两个前端。
