# 2026-09-08 · 改名 arenaofbias · kme7kme7-prog

- 负责人：kme7kme7-prog ｜ 执行 AI：ZCode CLI（kimi-k3）
- 提交范围：改名主体已提交（0696693）；其后的决策 013 删除与字标形态更换未提交，由用户自行提交

## 本轮目标

原名 BIAS ARENA 经调查已被占用，用户决定全站英文名统一改为 arenaofbias；展示形态授权执行 AI 决定。

## 改动

展示形态：书面引用（包名、日志前缀、文档标题等）为小写连写 `arenaofbias`；界面字标经三轮样张评选（临时 HTML 放 `outputs/`，共 29 个候选，选定后已删）定为 ARENA OF ＋ 酸底切角 BIAS 块（样张编号 08C-4）。初版小写连写字标与"ARENA of BIAS"均经浏览器实测后被否。

- 品牌字标四处：`app/home.tsx`、`app/prompt-library.tsx`、`app/prompt-preview.tsx` 改为 `ARENA OF <b class="brand-tag">BIAS</b>`，`app/page.tsx` 顶栏为同款 span 结构；`app/globals.css` 新增共享类 `.brand-tag`（酸底、右上角切角、em 单位适配 12–27px 各场景），删除旧的 `.brand strong span` 与 `app/home.css` 的 `.lobby-brand b` 细体规则。
- 页脚与登录框：`app/page.tsx` 页脚的 BIAS 同样压 `.brand-tag` 色块；`components/account.tsx` 的 eyebrow 为纯文本 `YOUR SEAT / ARENA OF BIAS`。
- `AGENTS.md` 收工规则调整：任务过程中只更新根目录 `HANDOFF.md`，归档日志在整轮完成、push 前才写入。
- 浏览器标题 `index.html` 改为"偏见试验场 ARENA OF BIAS — 相信你的第一直觉"；包名 `package.json` 与 `package-lock.json`（bias-arena → arenaofbias）；`server/index.js` 文件头注释与 5 处日志前缀 `[bias-arena]` → `[arenaofbias]`。
- 文档：`README.md` 标题去掉"（暂名）"并删除"名称也尚未最终确定"表述；`docs/IDEAS.md` 标题改名。`docs/DECISIONS.md` 曾追加决策 013，后按用户要求删去——执行类小事不进决策日志。

明确没做：

- 中文名"偏见试验场"保留（用户只说英文名被占用）。
- HUD 装饰文案中的单词不连带改：`BIAS / OBSERVATION SYSTEM — 026`、`QUICK MATCH / RANDOM ARENA`、`ONE PROMPT / ONE ARENA` 是氛围词，不是品牌名。
- 未动 GitHub 远端仓库名与本地目录名（不在仓库文件范围内）。

## 决策

- 无新增决策：改名属一次性执行事项，用户明确不记入决策日志（先写入的决策 013 已按用户要求删去）。

## 验证

- `npm run typecheck`：通过
- `npm run lint`：通过（0 错误 0 警告）
- `npm run validate:arena`：通过（11 项 + 素材检查）
- `npm run validate:scroll`：通过（5 项）
- 复扫：全仓 grep `bias.arena|biasarena`（大小写与连字符变体），残留仅 HANDOFF.md 与本日志对旧名的历史指涉
- 浏览器目视（dev server）：首页、提示词库、竞技场顶栏（暗色）、页脚、登录框五处品牌位确认
- 未跑：`npm run build` —— 原因：AI 沙箱环境限制（见 docs/ARCHITECTURE.md），需本地终端复核
- 未跑：`npm run validate:comments` —— 原因：需先启动后端

## 遗留物

- 无未跟踪文件；工作区有未提交的后续修订（字标定稿 08C-4、AGENTS.md 收工规则、DECISIONS.md 删 013、本日志与 HANDOFF.md），由用户自行提交。

## 下一步建议

- 用户过目字标效果后自行提交与 push；如需调整形态，由用户拍板后执行。
