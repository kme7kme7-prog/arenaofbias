# 2026-09-08 · 改名 arenaofbias · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：ZCode CLI（kimi-k3）
- 提交范围：本轮全部改动即 main 最新一笔提交（本文写于提交前，故不内嵌提交号）

## 本轮目标

用户原话："把所有涉及BIAS ARENA的都改成arenaofbias"。原名 BIAS ARENA 经调查已被占用，全站改用新名；展示形态由执行 AI 定（用户原话"至于布局怎么好看怎么来"）。

## 改动

展示形态定为统一小写连写单词标 `arenaofbias`（决策 013）：不大写、不拆词；品牌位沿用原"前重后轻"双色设计，拆为 `arenaof` + `bias` 两段。

- 品牌字标四处：`app/home.tsx`、`app/prompt-library.tsx`、`app/prompt-preview.tsx` 改为 `arenaof<b>bias</b>`；`app/page.tsx` 顶栏改为 `arenaof<span>bias</span>`；`app/globals.css` 的 `.brand strong span` 删除 margin-left（单词标不留词内空隙，该选择器仅顶栏一处使用）。
- 页脚与登录框：`app/page.tsx` 页脚、`components/account.tsx` 的 eyebrow 改为小写 `arenaofbias`。
- 浏览器标题 `index.html`；包名 `package.json` 与 `package-lock.json`（bias-arena → arenaofbias）；`server/index.js` 文件头注释与 5 处日志前缀 `[bias-arena]` → `[arenaofbias]`。
- 文档：`README.md` 标题去掉"（暂名）"并删除"名称也尚未最终确定"表述；`docs/IDEAS.md` 标题；`docs/DECISIONS.md` 追加决策 013。

明确没做：

- 中文名"偏见试验场"保留（用户只说英文名被占用）。
- HUD 装饰文案中的单词不连带改：`BIAS / OBSERVATION SYSTEM — 026`、`QUICK MATCH / RANDOM ARENA`、`ONE PROMPT / ONE ARENA` 是氛围词，不是品牌名。
- 决策 013 条目内引用原名属正常记录，不视为残留。
- 未动 GitHub 远端仓库名与本地目录名（不在仓库文件范围内）。

## 决策

- 已决（见 docs/DECISIONS.md）：决策 013 对外英文名定为 arenaofbias。

## 验证

- `npm run typecheck`：通过
- `npm run lint`：通过（0 错误 0 警告）
- `npm run validate:arena`：通过（11 项 + 素材检查）
- `npm run validate:scroll`：通过（5 项）
- 复扫：全仓 grep `bias.arena|biasarena`（大小写与连字符变体），残留仅决策 013 的理由与引用原文
- 未跑：`npm run build` —— 原因：AI 沙箱环境限制（见 docs/ARCHITECTURE.md），需本地终端复核
- 未跑：`npm run validate:comments` —— 原因：需先启动后端
- 建议：改名涉及字标视觉，本地 `npm run dev` 过目首页、提示词库、预览页、竞技场顶栏与登录框五处

## 遗留物

- 无未跟踪文件；全部改动随本轮一笔提交。

## 下一步建议

- 用户本地过目字标效果后 push；如需调整拆分位置或大小写形态，改决策 013 需用户显式拍板。
