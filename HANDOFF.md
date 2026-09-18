# HANDOFF.md · 当前状态

本文件只记录当前状态与接手指引。历史过程见 `docs/handoff/`，产品规则见 `docs/PRODUCT.md`，用户决定见 `docs/DECISIONS.md`；文档中的旧「未提交」描述以 Git 实际状态为准。

## 2026-09-18 · 接入测试样本与超级结果处理（本轮，已归档）

- 本轮已归档：`docs/handoff/2026-09-18-接入测试样本与超级结果处理-kme7kme7-prog.md`，决策 091。要点：**榜单六维画像接真实评分**（按题维度权重分维 Elo 重放，标签与方向定稿）、**004–007 样本全量接入**（24 份作品，每题 6 模型）、**入场作品就绪门控 + 揭幕编排**（`?aob=prev` 预览隐藏、探针握手、round-tag 与作品同拍）、**超级结果库处理**（库区地图 `Temp/超级结果/README.md` 建档；UI 隐藏注入库内 70 份 + 站上 15 份；探针库内 220 份 + 站上 24 份全覆盖）、**vite watcher 忽略 Temp/**。
- 计数口径速查：站上作品 = 24 份（001 的 20 份鹈鹕另有登记）；库内 = 32 组合 × 8 用例、约 12GB。
- 未 push。工作区另含并行 AI 的 09-17 审查修复批次（同批提交，详见归档「改动 F」）。

## 2026-09-17 · 全站代码审查第二轮 + 六处修复（审查修复批次，已随 09-18 提交）

- 用户要求全站代码审查（需起项目时用不常用端口）。5 路并行审查（后端 / 模一把 / 竞技场动效 / 管理后台 / 公共前端），高危发现本人二次核验；用户拍板修复「确认 BUG + 竞技场时序竞态」共 6 处。
- **修复清单**：
  - **模一把发布灯灰档失效（高）**：`lib/guess-logic.ts` 的 `judgeNumeric` 旧按「阈值>1 走比值分支」猜口径，发布时间阈值 6（个月）被错送进比值分支，月序号比值恒≈1 → 任意不同月恒黄、灰灯永不出现。现加显式 `mode: 'diff' | 'ratio'` 参数（released=diff、contextK=ratio）。`validate:guess` 补发布时间状态断言（36→**37 项**，合成模型钉差 1 月黄/差 7 月灰/跨年箭头）。
  - **跨零点战绩丢失（中）**：`app/guess.tsx` `enterDaily` 不重置 `settledRef`，「重玩今天→跨零点→自动换新题」后新一天的结算/上报被残留标记永久挡下。现 commit 里重置。
  - **后台作品管理卡死（中）**：`app/admin/works.tsx` 重复点击已选中状态筛选时 `filters()` 无条件 `setLoading(true)` 而依赖不变、effect 不重跑，页面永久「加载中」。现重复点击只回第一页（第 1 页则 no-op），不走 `filters()`。注意：别改成 effect 本体置位 loading——react-compiler lint 会拦 effect 内同步 setState。
  - **竞技场晚到换对局（中）**：`app/page.tsx` subscribeWorks 回调改为「当前对局在新清单里仍成立就原样保留，失效才重抽」（旧每次 emit 无条件重抽，voting/result 阶段脚下对局被整个换掉；内置花名册 id 如 `001-sample` 与远端 id 不同体系，失效时仍必须重抽否则投票 400——070 的修复目标保住）。
  - **随机换个竞技场（低）**：补 `disabled={blocked}`，重播过场中不再叠 match 纸幕。
  - **text-swap 残留（低）**：`lib/text-swap-mask.ts` armed 标记加 5s TTL，目的地不是竞技场（如落 PromptPreview）时超时作废，之后进任意竞技场不再凭空揭字。`check-text-swap-mask.mjs` 6→**7 项**（TTL 行为断言，假时钟）；`check-arena-scroll.mjs` 补「保留有效对局」「随机入口 gating」两条静态断言。
- 验证：typecheck 0 错、build 过、validate:guess 37 项全过、check-text-swap-mask 7 项、check-arena-scroll 过、git diff --check 过、定向 oxlint（8 个改动文件）0 错——其中 `check-text-swap-mask.mjs` 第 93/164 行有 2 个**既有** lint 错（createElement 弃用/模板串类型），不在本轮改动行，未顺手修。未做浏览器实测：发布灯判定已被 jiti 实跑断言覆盖，其余四处是纯 UI 状态逻辑。
- 审查未修的遗留（等拍板）：DevPanel 生产无环境守卫（`src/main.tsx:121`，注释自认上线前删挂载）；TRUST_PROXY 未设时限流桶全局共享 + dev 登录后门残余（070 已记部署硬前提，代码无启动告警）；偏好榜两处运行时拼接中文英文用户可见；VENDOR_REGION 原型链查重、inbox 泄路径、PATCH prompts 可改 kind 等低危批。
- 已随 2026-09-18 提交落库（详见该轮归档的「改动 F」）；未 push。

## 2026-09-18 · 榜单六维画像接真实投票 + 雷达方向（本轮）

- 用户拍板（决策 091）：雷达六维统一为 视觉设计/空间营造/动态表现/文字表达/思辨推理/创意构思（三赛道同套标签）；视觉三维度居左上半、文字三维度居右下半（平顶六边形，`app/ranking.tsx` `coord` 起始角 -180°）。
- 六维画像弃用播种演示值：`lib/leaderboard.ts` 新增 `PROMPT_DIMENSION_WEIGHTS`（001–007 每题一组权重，006 已由用户确认同 003）与 `computeRadarProfiles`——分维 Elo 重放（基准 50、K=32×权重、平局各半、零权重维度不动），与榜单共用流水与赛道/口径过滤；`app/ranking.tsx` 页面层算好传入 ProfilePanel。
- 权重映射中用户口语「动态交互/空间构建/推理思辨」按规范维度名落表；「前端网页设计」对应 003 环游轨道（已向用户报告，可改）。
- 验证通过：typecheck、validate:leaderboard 11 项（新增权重归一、重放确定、合成票权重语义与平局边界断言）、validate-locale、build。未 commit、未 push。

## 2026-09-17 · 后台逐作品画布校准与作品列表

- 用户授权在作品管理增加拖动校准并改善管理体验，决策 088。入口 http://127.0.0.1:5173/admin#works（兼容 admin.html）。
- 新增 app/admin/work-calibration.tsx、work-types.ts、works.css；重做 works.tsx：自动搜索、题目/状态筛选、30 条分页、行内信息编辑、明确发布/下架、原作入口、校准状态。
- 校准：内部宽高输入及完整画布右下角拖柄；拖动取景、缩放、水平/垂直滑杆；桌面/手机预览；保存、恢复默认、未保存关闭提醒。编辑作品信息期间暂禁列表筛选和其他行操作，避免误丢草稿。
- server/work-framing.js 验证配置；PATCH admin works 将 framing 写入现有 content JSON，公开端随作品返回。无需迁移，未改 data/public 原作。FixedHtmlWork/framedCanvas 共用 16:9 构图，手机/展开一致；其他 HTML 仅主动保存校准后启用。
- 验证通过：typecheck、build、定向 oxlint、check-work-framing、validate:admin（含临时数据库保存/重置、权限/参数保护、原 HTML 不变）。Tabbit 实机验收受阻：reload/只读 title 等连续超时，恢复任务后仍无法读取页面；未宣称截图或拖动操作已实测。没有改动任何真实作品的校准数据。
- 待用户浏览器体验视觉和拖动手感；保留此前工作区改动，未 commit、未 push。
## 2026-09-17 · HTML 固定画布预览（前轮）

- 用户授权实施固定内部画布/外部等比缩放方案，决策 087。新增 `lib/work-framing.ts` 的题级/作品 ID 级配置与 contain 计算；001 HTML 默认为 1280×720，普通网页/其他题不自动启用。
- 新增 `components/fixed-html-work.tsx/.css`：ResizeObserver 读 layout 尺寸（不把入场 transform 算进去），iframe 内部尺寸保持不变，外层整体缩放居中，异比例留白。更新布局不重新挂载 iframe，动画不会因窗口 resize 重播。卡片 16:9、手机上下排沿用现有布局；弹窗同样固定画布适配容器。
- `app/page.tsx` 001 跳过旧 `aob=prev` 补丁参数并退出长页自动滚动目标，保留互动/沙箱；data/public 原作文件和旧修补脚本未修改。其他未提交改动为前轮/其他工作，未整理、未覆盖。
- 新增真实组件检查页 `/reference/work-framing-review.html`（20 份已发布作品选择、宽度与比例切换、原作入口）；`node scripts/check-work-framing.mjs` 验证 opt-in、网页不套用、横竖容器 contain/居中/零尺寸。
- 验证通过：typecheck、build、validate:arena 12 项、check-vote-split、定向 oxlint。Tabbit：20 份真实作品内部 1280×720 且未启用旧预览类；调整 320/640/1280 外宽不重新加载文档；9:16 容器完整居中。实际竞技场桌面每侧约 648×364，CSS 320×604 手机为上下排列、16:9 且无横向溢出，弹窗仍 1280×720 并完整容纳；003 网页未套组件，001 正常入场聚焦期间尺寸不变。未做实体手机验收，不宣称所有原作自身构图问题已修复。
- 开发态格式化触发 HMR 后浏览器记录过 NotFoundError；冷刷新后完整入场到 voting 观察 8 秒无 pageerror，未在冷加载复现，未扩大范围改揭晓/热更新逻辑。
- 未实现：主体裁切/AI 修复/后台校准器/手势缩放。本轮聚焦容器适配，原作主体小等质量差异保留。
- 未 commit、未 push。体验入口 `http://127.0.0.1:5173/#arena/001`。
## 2026-09-17 · 真机移动端巡检与换场文字过场（已归档）

- 本轮已归档：`docs/handoff/2026-09-17-真机移动端巡检与换场文字过场-Devin.md`，决策 082/083/084/086/089/090。要点：真机链路（无线 ADB + CDP + screencap）与全功能巡检；移动端三处修复；窄屏菜单→测评走 match 双页；首页版本定稿新版、切换收进 dev 面板；换题盖区外文字用 `lib/text-swap-mask.ts` 纸条先遮后揭（`[data-swap]` + `armed` 跨路由），并做时间轴对齐（`data-gt-phase` + `introGateTail` 提前放牌）；逐个巡览窄屏下线、桌面 opt-in。
- 开发态注意：改 `lib/game-transitions.ts` 触发 HMR 会把 `translateTransition` 重置成原样输出，过场文案暂时显示英文——整页刷新即恢复，非 bug。
- 仍未 commit、未 push；连同此前全部累计改动一起待提交。
## 2026-09-16 · 模一把搜索补全分隔符不敏感（当前轮，待体验）

- 用户报「模一把的输入自动补全有点问题」。Tabbit 实测复现：候选匹配是原样小写 `includes`，数据集名含 `-`/`.`/空格，按自然习惯输入即落空——`"gpt 5"`、`"gpt5"`、`"sonnet4.5"`、`"llama3.3"`、`"glm5"`、`"deepseekv3.2"` 全部显示「没有找到这个模型」。
- 修复：匹配逻辑抽成 `lib/guess-logic.ts` 的纯函数 `searchGuessModels`（与判定核心同模块、可断言）——先规范化（小写 + 剥掉非字母数字分隔符）再做 前缀 > 子串 排序，多词乱序（"5.6 luna"、"luna gpt"）走逐词全命中兜底（rank 2）。`app/guess.tsx` 的 `candidates` 改为调用它（已猜排除不变，仍全库搜、8 条上限）。
- 追加（用户要求）：同档候选按 `released` 倒序——`"gpt-"` 首条 = GPT-6 Astra；为此新增「规范化全等」最高档，输入完整旧名（如 `gpt-5`）仍命中 GPT-5 本身、不被更新的 5.6 抢走第一。
- `validate:guess` 新增断言（36 项）：分隔符不敏感命中、乱序多词、前缀优先、同档 released 单调倒序、全等档优先、空查询与无命中。`docs/games/guess.md` 搜索口径同步。
- 验证：typecheck、build、validate:guess 36 项、validate-locale、定向 oxlint 0 错、diff --check 通过。Tabbit 实测原落空输入全部出候选；`gpt-` 首条 GPT-6 Astra (2026-09)、`claude` 首条 Claude Fable 5.1、`gpt-5` 首条仍为 GPT-5；乱输入仍正确报无匹配。
- 未 commit、未 push。

## 2026-09-16 · 模一把层叠分池 + 第一版映射落地（当前轮，待体验）

- 用户交接文件 `Temp/guess-pool-task.md` + `guess-pool-mapping.json`（用后已删）：分池从「4 个互斥池」改为「**4 个层叠池**」——`difficulty` = 最低从哪一档开始出现，难度 k 的池 = `difficulty ≤ k`（地狱=全库）；第 2 档「标准」改名「普通 / Common」（「中等」仍被价格档占用）。记为决策 **081**（080 被并行 AI 的价格口径批次先占了编号，注意别引用错）。
- 数据集落地（`lib/guess-models.json`）：29 个困难档条目退役入地狱（含 Claude 3.x Sonnet/Haiku 两个**合并组**，改组条目变体继承）、66 条新模型 **append 数组末尾**（二选一里选了 append：追加契约口径一致、diff 干净可审计；字段剔除冗余的 `region`，地区登记走代码侧 `VENDOR_REGION` +10 家）。updatedAt/source 同步。落地后专属档（槽）40/33/66/29，层叠池 40/73/139/168 槽，总 168 槽 / 204 可猜名。**每日题答案本轮起全部重排**（用户明确豁免：没上线不管历史）。
- 层叠化改动：`poolForDifficulty` 与 `dailyPool` 改 `<=` 过滤；`app/guess.tsx` 练习池与选择屏候选数改层叠（59/106/173/204 模型）；blurb 四档文案换层叠表述；地狱卡不再禁用。`validate:guess` 断言改层叠（⊆ 链、地狱=全集、单调不减、每档专属非空、答案 difficulty ≤ d）；冻结指纹改钉「每档专属槽集合」（`difficulty === k`）并重算；「十年槽位命中」阈值改随槽数走（0.5×/1.6× 均值，168 槽下旧绝对值失效）。`_dataset-review.md` 已按新数据重出。
- 验证：typecheck 零错（Temp 外部项目的 TS5097 噪音除外，与本轮无关）、oxlint 0、validate:guess **35 项**全过、validate-locale 过、diff --check 过。Tabbit 实测：四档卡全部可选、层叠候选数单调递增；地狱档真实开局（chip=Hell、204 models）→ 提交 Llama 3.3 70B 出七格反馈、机会 08→07、chip 返回选择屏正常；中英选择屏文案正确。候选下拉用 fill() 一次性注入时偶发不出（pressSequentially 逐键输入正常）——Playwright 手法问题非代码 bug。
- **并行提示**：另一个 AI 正在做价格口径批次（决策 080），接下来会动数据集 `priceOut`——它**不应**碰 `difficulty` 与数组顺序；若它改了分池，指纹断言会拦。合并时注意 json 冲突。
- 收尾清理（主 agent）：`messages.ts` 死键「先选一个难度。三档各出一道题…」已删（全仓库无引用）；`/Temp/` 加入 `.gitignore` 并同步写进 `tsconfig.json` 的 `exclude`（此前该 44MB 外部项目既可能被 `git add -A` 扫入、又让裸跑 `npx tsc` 报 563 个无关 TS5097 错；现在 typecheck 真正零错）。
- dev server 后台跑着（5173+3000）。本轮已按用户授权提交（起点 `bbe294e`）；**未 push**，待用户确认。

## 2026-09-16 · 模一把四档难度（新增「地狱」）+ 分池冻结指纹（上一版，分池语义已被 081 层叠取代；冻结机制保留并改专属集合口径）

- 用户任务：练习模式三档扩四档（新增第 4 档「地狱 / Hell」），每日池维持简单+标准不动；同时把「重新分池」从口头红线变成显式、可审计、机器拦截的操作。逐模型的地狱档归属由用户手工给映射，本轮不动 `lib/guess-models.json` 的任何归属（地狱池当前为空）。记为决策 079。
- 全链路：`lib/guess-logic.ts`（GuessDifficulty 1-4、DIFFICULTY_INFO 加地狱、DAILY_DIFFICULTIES 不动）；`server/index.js`（`parseGuessDifficulty` 与后台追加校验改吃 `GUESS_DIFFICULTIES`、`practice/start` 空池显式 503「这一档还没有收录模型」）；`app/admin/guess.tsx`（POOL_LABEL 加 4 地狱、追加表单第 4 选项；DIFFICULTY_LABEL 注释说明流水永不出现 4——练习不上报）；`app/guess.tsx`（选择屏第 4 张卡、forced 钩子支持 1-4、角标 /03→动态 /04、两处每日池过滤从 `!==3` 修为按 DAILY_DIFFICULTIES 正向过滤——旧写法会把地狱档混进每日候选）；`lib/messages.ts`（地狱/Hell 等中英文案）。
- **地狱入口设计**（用户要求低调、视觉第一）：选择屏前三档栅格原样不动，地狱卡横跨栅格整行成一条矮横条（骷髅图标 + 余烬橙点缀），池空时禁用并显示「筹备中」，收录后自动开放、无需改代码。
- **分池冻结（B 项核心）**：`validate:guess` 新增「分池冻结」断言——`POOL_FINGERPRINTS` 钉住主数据集各档槽位构成（组算一槽，槽 id 排序 sha256 前 16 位；当前 简单 39 / 标准 26 / 困难 37 / 地狱 0 槽），不经意调 difficulty 直接验证失败。定稿流程（唯一合法调档路径）写入 `docs/games/guess.md`：用户给映射 → 改数据集 → 重算指纹 → DECISIONS 记一条。此后普通开发不得再随手调档。
- 验证：typecheck 非 Temp 零错误（Temp/ai-model-directory-main 是用户放进来的外部项目，被 tsc 扫到报 TS5097，与本轮无关）、oxlint 定向 0 错、diff --check、validate:guess **35 项**全过（新增：冻结指纹断言、四池并集/不重叠改写、非空池≥10+空池允许、每日池≥20、地狱空池 503 断言）、validate-locale 过。Tabbit 实测：桌面 1440 地狱横条全宽禁用态（筹备中/候选 0）、英文 Hell/Coming soon、手机 390 无横向溢出；后台「追加模型」表单出现第 4 选项；force-mode=4 静默留选择屏（练习分支读旧 state 的既有问题，对照页只用 daily，未修）。
- **oxfmt 注意**：`server/index.js` 与 `scripts/validate-guess.mjs` 在 HEAD 本来就过不了 `oxfmt --check`（项目惯例是 oxlint + diff --check），全量格式化会产生数百行无关 diff，本轮不做；新代码按周围格式手写。
- dev server 后台跑着（5173+3000），可直接打开 `#guess` 体验。未 commit、未 push。
- 待拍板：地狱档收录哪些模型（用户给映射后走定稿流程落数据）；`messages.ts` 死键「先选一个难度。三档各出一道题…」（无页面引用，未动）。

## 2026-09-16 · 下一题区域斜幕 + 巡览开关去酸黄（当前版本，待体验）

- 用户指出「下一题」硬切无过渡很奇怪，要求画出区域（实时对比行→作品区→操作行）用色块横推过渡、其余区域照常恢复；巡览开关的亮黄滑块看不清且丑，记为决策 078。
- `app/page.tsx` `gotoRandomArena`：改经 `createGameTransition('convoy', {speed:1.25, title: 下一题题目名})`——层挂 `document.body` 活过组件卸载（卸载时不得 dispose），点击时用 `.field-meta`+`.arena-stage`+`.round-console` 并集 rect 以 fixed 定位到场内区域，`onCovered` 才切 hash。新竞技场的 intro 沿用 `.game-transition` 等待门控，斜幕扫出后开场牌才开始。防重入锁 `arenaTransition` ref。
- 巡览开关开态改为深墨轨道 + 纸色滑块，不再使用酸黄（`arena-refinement.css`）。
- `check-arena-scroll.mjs` 新增断言：convoy 区域过场、onCovered 切 hash、rect 定位、卸载不 dispose。
- 验证：typecheck、build、validate:arena 12 项、check:motion 全套、check-vote-split、validate-locale、oxlint、diff --check 通过。Tabbit 实测 003→001：层 119ms 起、rect 188–926×1440 精确等于画出区域、非全屏；1438ms 盖满切 hash 时层仍在；新开场牌 2364ms 出现、严格在层离场（2280ms）后，零叠放；截图目验 A 聚焦巡览正常。
- 本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 入场等过场离场、巡览放慢并可开关（上一版，开关配色与下一题过场以 078 为准）

- 用户体验后指出菜单→竞技场的过场动画与 Round Start 开场牌重合、逐个展示过快，并要求增加挨个显示的开关，记为决策 077。
- 重合根因：convoy/page-wipe 在盖满（convoy 约 520ms、wipe 约 360ms）时切路由，色块要再过约 900/550ms 才扫出完毕；竞技场挂载后 intro 立即播开场牌，两段动画叠放。现 intro 序列先等 `.game-transition`/`.page-wipe` 离开 body（40ms 轮询、2600ms 封顶兜底），`.intro-label` 由新状态 `arrivalReady` 门控，过场离场后才挂载播放；直达或 hash 换题无层时零等待。
- 巡览放慢（`ARENA_TIMING`）：introLead 1000、聚焦 700、静态停留 950、回位 500、间隔 200，新增收尾静止拍 introSettle 300；无溢出内容首入理想 6.0s、重播内部 5.2s。真实溢出长文仍走滚动巡览（引入 300、收尾 520）。
- 新增「逐个巡览」开关：底部操作行 text-button 带细线小拨杆（开=酸黄滑块），`localStorage` 键 `aob-arena-tour` 默认开；关闭时入场只保留开场牌一拍（首入约 1s 即开放投票），跳过 A/B 聚焦，重播同理约 0.5s。开关在 intro 中途切换会以可取消序列安全重启。
- `scripts/check-vote-split.mjs` 断言更新为 6.0s/5.2s 节拍（含 introSettle），新增过场等待、arrivalReady 门控、`aob-arena-tour` 键与 `!tour` 提前 READY 断言；对照页同步口径。
- 验证：typecheck、build、validate:arena 12 项、check:motion 全套、check-vote-split、validate-locale 通过。Tabbit 实测：菜单→003 convoy 期间开场牌零叠放（labelWhileLayer=false，开场牌在层离场后出现）；tour=on 首入 6.09s 解锁、A 0.95→3.08s、B 3.37→5.50s 无重叠；tour=off 重播 1.08s 可投、无 spotlight、无 transform 残留；开关写入 localStorage 并跨刷新保持。CSS 391×844 reduced-motion 163ms 到可投、开关在视口内、无横向溢出。
- 注意：Tabbit 后台标签 rAF 被节流时 convoy 层停留会被拉长（实测 4.3s 而非 1.4s），属环境特征非代码问题；前台实际节奏以固定时长为准。本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 竞技场完整时间轴根修（上一版，入场节奏与过场衔接以 077 为准）

- 用户体验后仍认为时间轴混乱，并指出入场存在严重问题。完整量化发现 003 从 intro 到可投实测被拖到 13.47s（代码理想时钟也约 7.48s）：1.3s 开场牌与 0.6s 开始的首件聚焦重叠；每件作品串行放大、空等、停留、回位、再空等；无溢出网页也等待滚动节奏；更严重的是状态机 `await animation.finished`，浏览器掉帧/调度会直接延迟投票解锁。记为决策 076。
- `app/page.tsx` 新增集中 `ARENA_TIMING`：首入开场牌完整播放 900ms 后才聚焦 A；每侧聚焦 460ms、无滚动停留 520ms、回位 380ms、间隔 100ms，两侧总计后首入理想 3.82s。只有 `scrollHeight > clientHeight` 的真实长内容才运行滚动巡览，普通网页不再假等。WAAPI 只画画面，流程由可取消 `delay(duration)` 推进，不再等待 `animation.finished`。
- 重播已有 610ms 全屏切换幕，不再重复挂开场标题牌；幕结束后只留 180ms 呼吸再进入 A/B 聚焦，内部 intro 理想 3.10s。`round-intro` 退场由裁成黑色竖条改为淡出上移。浏览器实测：首入 3.74s 解锁；重播含切换幕 3.91s、无第二张标题牌；跳过后两件作品 transform=none、无 spotlight 残留。
- 结果段重新与反馈牌交接：反馈约 49ms 出现、1.27s 开始退场；1.50s 进入身份解密，反馈在 1.56s 完全离场；解密约 2.39s 完成，随后反应 2.51s、提示词 2.64s、结果操作 2.72s、评论 2.89s 接力，不再让反馈牌和解密长时间重叠。
- `scripts/check-vote-split.mjs` 增加首入 3.82s、重播 3.10s、真实溢出判断、开场牌 0.9s、禁止 `await animation.finished`、反馈→解密交接和结果顺序断言。对照页同步完整验收口径。
- 验证：typecheck、build、validate:arena 12 项、check:motion 全套、check-vote-split、validate-locale、定向 oxlint 与 diff --check 通过。Tabbit 1440×900 三段截图目验开场/A/B 聚焦；CSS 391×844 reduced-motion 约 1.77s（含重载与资源）到可投、无 transform/spotlight/横向溢出。测试投票 POST 拦截，不写真实票。
- 本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 竞技场时间轴与换题滚动收束（上一版，完整时间轴以后续修订为准）

- 用户指出结果卡里的「看看偏好榜」样式怪、全页动效虽好看但时间轴混乱、每次下一题浏览器会跳，并要求首页默认显示新版且保留切换，记为决策 075（首页默认沿用既有 069）。
- 偏好榜入口的怪异断角来自 refinement 清掉边框/背景后漏清旧硬阴影；现改为无底色的单线文字入口，显式清除各态阴影，hover 只横移 3px，不与「下一题」争主按钮层级。
- 结果时间轴改为单向接力：点击后反馈牌约 0.12s 出现；锁定 0.8s 后开始身份解密；两侧判断约 1.42s、反应条约 1.91s、提示词条约 2.07s、结果操作约 2.17s、评论区约 2.34s 依次出现。反馈牌仍在 1.9s 内结束；reduced-motion 全部取消延迟直接显示。`scripts/check-vote-split.mjs` 新增顺序递增断言。
- 下一题跳动根因为 `src/main.tsx` 路由 effect 先 `scrollTo(0,0)`，竞技场下一帧又平滑定位命题，形成两次反向滚动。有效 arena/formal 路由不再执行全局归顶，只保留 `schedulePromptScroll` 的一次命题定位；浏览器实测从结果区 636 直接到新题 147，未经过 0。`check-arena-scroll` 补全局归顶守卫断言。
- `app/home.tsx` 代码本来已经是无历史偏好默认 `new`（决策 069），无需制造无效改动；本地预览已将 `aob-home-edition` 设为 `new`，并实测切经典版写入 old、切回新版写入 new，三版切换与记忆保留。
- 验证：typecheck、build、validate:arena 12 项、check:motion 全套、check-vote-split、validate-locale、定向 oxlint 与 diff --check 通过。Tabbit 1440×900 目验结果区及新偏好榜入口；CSS 391×844 reduced-motion 下五层结果内容均无延迟且无横向溢出。测试投票 POST 拦截，不写真实票。
- 本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 选择反馈即时化与成品级重做（上一版，整体时间轴以后续修订为准）

- 用户体验后指出上一版仍丑且存在明确 BUG：点击后隔一阵才显示。实测点击到可见约 1996ms，根因是反馈被限制到 1150ms 锁定阶段结束后的 result，再等待提交与人数读取；用户要求改为成品级，记为决策 074。
- `app/page.tsx` 恢复 locking 即挂载；`components/vote-split.tsx` 点击后先出现有明确汇总动势的选择反馈牌，提交结束再把真实人数无缝填入，不再让网络决定出现时机。GET 超时收紧到 1200ms，1550ms 开始退场、1850ms 卸载；按 run 清理请求与定时器、正式模式不显示等边界不变。
- `app/arena-refinement.css` 推翻上一版调试 HUD 式细条：新牌面用切角深墨底、红蓝两翼、酸黄锁定章、选中侧内描边、中央比例轨、扫光与向心收束退场；桌面约 500×164，手机约 371×157。人数未到时红蓝脉冲轨有意反馈“正在汇总”，到达后两侧数字从相反方向落位。
- 浏览器原生事件时间戳实测：点击后约 49ms 进入 DOM，模拟 POST 延迟 350ms 时约 479–509ms 填入人数，约 1605ms 开始退场、1899ms 完全移除。CSS 391×844 边界在可视区内且无横向溢出；reduced-motion 无装饰动画。投票 POST 拦截，不写真实票。
- 验证：typecheck、build、validate:arena 12 项、validate-locale、check-vote-split、定向 oxlint 与 diff --check 通过。
- 本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 竞技场选择反馈再收束（上一版，即时性与视觉以后续修订为准）

- 用户根据截图指出选择人数弹层太丑、太大、停留太久且动效不足，平局按钮几乎看不见；要求反馈 2 秒内自动关闭，并保留平局按钮透明、低干扰的设计，记为决策 073。
- `components/vote-split.tsx` 改为结果阶段且人数读取完成后才出现，不再用大面板等待网络；反馈压成约 540×130px 的横向结果条，保留左右人数、红蓝比例与平局数，移除重复标题层级。入场、顶边扫描、数字错峰、比例展开和退场组成短动效，1450ms 开始退场、1800ms 卸载；失败与占位提示同样短暂显示，减少动态效果时直接呈现但仍按时收起。
- `app/arena-refinement.css` 将透明平局按钮由 190×38 提至 238×42，增强双细边、文字、图标与键位提示，静态仍无填色，仅 hover/选中时出现反馈；反馈条桌面不再遮满作品中心，窄屏限制在可视区内。`scripts/check-vote-split.mjs` 补短生命周期与退场状态断言，真实对照页同步验收口径。
- 验证：typecheck、build、validate:arena 12 项、validate-locale、check-vote-split、定向 oxlint 与 diff --check 通过。Tabbit 1440×900 实测弹层由约 440×324 缩至约 535×130，1515ms 进入退场、1820ms 完全卸载；1024×720 目验透明平局入口；CSS 391×844 reduced-motion 下反馈约 359×126、无横向溢出、1811ms 卸载。投票 POST 继续拦截，不写真实票。
- 本轮仍未 commit、未 push，待用户体验。

## 2026-09-16 · 选择人数弹层与按钮再修订（上一版，反馈尺寸与时长以后续修订为准）

- 用户否定平局胶囊、下一题内嵌方块，并要求明显弹出反馈，展示左右人数与红蓝拼接条，记为决策 072。平局按钮改直线双细边，下一题改统一深墨切角、独立酸黄箭头；名字解密保留。
- `components/vote-split.tsx` 在娱乐测评选择后弹出反馈，提交结束再调用现有 `/api/votes`；`lib/vote-split.ts` 只聚合当前题当前作品对，按作品 id 对应左右。平局单列，零票不画假比例；占位模式、失败、读取中均有明确文案。读数或错误显示 6 秒后收起，可关闭；按 run 挂载，清理请求与定时器，GET 10 秒超时。正式模式不展示。复用全量流水接口，仍适用于当前演示规模，未新增服务端接口。
- 新增 `scripts/check-vote-split.mjs` 覆盖换边、平局、排除其他题/作品对、重复 id、零票和单边票；更新真实对照页、PRODUCT 和中英文文案。
- 验证：typecheck、build、validate:arena 12 项、validate-locale、定向 oxlint 与 diff --check 通过。Tabbit CSS 1440×900 查看真实统计弹出（左右各 1 票）与遮黑解密；拦截响应验证 6:3 + 1 平局、67/33 比例、零票、503、关闭、自动收起和重播取消晚到响应。CSS 391×844 英文面板边界在视口内、页面无横向溢出，截图有浏览器捕获裁切，未据此认定手机完整视觉验收。投票 POST 全部拦截，不新增真实票；测试路由已清理。
- 另通过 validate:votes 12 项（临时 SQLite 实例），浏览器已恢复正常动态效果并留在中文 003。本轮与上一轮修改均未 commit、未 push，待用户体验。

## 2026-09-16 · 竞技场视觉收束（上一版，按钮与反馈以后续修订为准）

- 用户授权打磨顶部/外框、简化锁定反馈、重做结果区和「下一题」、微调平局按钮；明确保留名字揭晓特效、两侧投票文案不动，记为决策 071。
- `app/page.tsx`：移除中央锁定浮层，将「你的选择」移入身份栏，不再盖住作品。`app/arena-refinement.css`：压缩顶部、减薄外框、未选作品仅轻微退焦；结果身份字号增大，保留原 DocumentDecryption 的遮黑错峰解密与触发时机；整理反应条和结果操作栏，平局改低对比圆角胶囊，「下一题」深墨底加酸黄箭头。作品预览尺寸和投票/换题逻辑未改。
- 更新 `reference/arena-layout-review.html` 验收指引。未添加新的动效生命周期；既有 validate:arena 的锁定、揭晓、重播、平局、换题 12 项通过。
- 验证：typecheck、build、validate:arena、validate-locale、定向 oxlint、diff --check 通过。Tabbit 实际 CSS 1920×1333 桌面投票/结果截图目验通过，锁定无中央遮挡、最终解密遮罩清理；CSS 391×844 英文结果无横向溢出，reduced-motion 重播→平局→下一题通过（003→001）。浏览器投票 POST 拦截返回 401，不写真实票。
- 手机结果截图工具超时；随后重试成功，已目验中文 001 投票首屏，英文手机结果仅检查布局与操作。未做实体手机验收，无完整正常速度解密过程录像。浏览器留在中文 003 预览（CSS 1440×900）。未 commit、未 push。

## 2026-09-15 · 全站代码审查与全部修复（当前轮）

- 用户要求完整代码审查找 BUG（需要跑项目时用不常用端口），审查后拍板「全部修复」。审查范围：当轮未提交的首页三版改动（逐行精读，未发现 BUG）+ 后端/模一把/页面组件/lib 模块四个并行审查任务；高危发现均由本人二次核验属实。修复批次记为决策 070。
- **修复清单（全部完成）**：
  - **H1 反代管理员后门**：`/api/auth/dev` 检测到 XFF 且未设 `TRUST_PROXY` 时拒绝（`/api/dev/clear-my-votes` 同口径）；dev 路由补 try/catch（原先唯一裸奔 async 路由，DB 异常会杀进程）。**部署硬前提新增：反代必设 `TRUST_PROXY` 白名单**。
  - **H2 增量契约后门**：`registerExtraModels` 强制 sinceDay（缺失整批拒绝）、拒 variants、批次内 id 查重、vendorRegions 坏批次回滚；`validate:guess` 增量文件校验与追加契约断言同步收紧。
  - **M1 看答案按钮不可达**：移到搜索框下方（对局中、已猜 ≥1 次可见），原结果面板位置的显示条件恒假；`revealAnswer` 补无猜测守卫。
  - **M2 formal 投票污染**：服务端对非 admin 的 formal 票 403。
  - **M3 匹配基准分**：`baseRating` 1000→1200，与 Elo 重放基准一致（无票模型不再被隔两档）。
  - **M4 跨零点**：每日题提交/看答案前比对 dayKey，过期自动切新一天的题并提示。
  - **M5/M6 限流分组**：social 10 / guess 30 / track 60（按 IP 独立桶，`RATE_LIMIT_PER_MIN` 为基础额度）；`/api/track` 补限流；checkGuess 429 抛 `RateLimitedError`、前端提示「请求太频繁」。
  - **低危批**：extra 文件原子写（tmp+rename）；result 上报幽灵日期往返核对；竞技场远端清单晚到重算对局（`subscribeWorks`）；后台发布开关以 PATCH 返回回写+busy 期禁工具栏；后台作品/模一把表单就近校验（行内/表单内错误）；单竞技场随机入口提示而非静默；登录表单输入中不被焦点刷新顶掉；占位缓存键带题库指纹；works 行 kind 白名单；leaderboard 死过滤移除；matchmaking/guess.ts 误导注释修正。
- **验证**：typecheck、定向 oxlint（仅剩 account.tsx 既有历史问题）、validate-locale、`validate:guess` 34 项（含新断言：缺 sinceDay 拒收+不部分注册、vendorRegions 回滚）、validate:matchmaking 7 项、validate:votes 12 项、validate:comments、validate:admin 11 项、validate:arena、validate:leaderboard 10 项、check:game、build 全过。隔离实例（8642 端口 + 临时 DATA_DIR，已清理）实测：dev 登录回环 201 / 带 XFF 403、普通用户 formal 票 403 而 blind 票 201、guess 桶第 31 次 429 新文案且 social 桶不受影响、幽灵日期 400 合法日期 204、后台追加模型 sinceDay=次日且无 .tmp 残留；浏览器实测每日题猜一次→「直接看答案」出现→点击揭晓 Grok 4.3→负场结算 played+1、settled 标记写入。M4 跨零点守护未做真实跨日实测（逻辑简单+guessDayKey 已有断言覆盖）。IAB 无焦点标签页的 rAF 冻结会让 folio 过场卡住（测试环境现象，刷新即恢复，非本轮引入）。
- 前端打包泄漏 `answerForDate`（PRICE_TIERS 打进前端包）仍是已知待拍板项，本轮未动。未 commit、未 push。

## 2026-09-15 · 首页第三版「对决版」

- 用户觉得新版"还可以更好看"但说不出具体点，全权交给我审美，允许新增一版供三版对比切换。未推翻新版，**新增第三版**：`app/home-duel.tsx` / `home-duel.css`，底部切换扩为「经典版 / 新版 / 对决版」（`aob-home-edition` 值 `old|new|duel`，默认仍 new）。
- 设计：整屏即一场放大的 A|B 对决——上半大标题（纯墨色，只保留句号点色）+ 右侧深墨主按钮与三条次级链接；下半横跨全宽的斜切双面板（A 深墨 / B 纸色，红蓝队色只作 A/B 角标）+ 中央酸黄 VS；悬停一侧另一侧退焦（呼应决策 003）；底部 mono 跑马灯。删掉新版里的小标签噪点与 BIAS 水印，酸黄只落在主按钮与 VS。守 067 色彩基线与 MiSans 字标；手机端面板上下堆叠、斜切改横向；遵守 reduced-motion。
- `lib/messages.ts` 补 `对决版: 'Duel'` 及书信/网页展陈文案英文；`app/home.tsx` 只改 edition 类型与分支。
- 用户指出左上角字标被翻成中文：是 056 单语化时 `legacyLabels` 顺带翻的。已移除 `ARENA OF` / `BIAS` / `ARENA OF BIAS` 三条映射，全站页头（首页三版、题库、榜单、菜单、模一把、竞技场页脚等共 10 处 `t('ARENA OF')`）中英文都显示 "ARENA OF BIAS"；小字仍随语言（创立于 2026 / Est. 2026）。记为决策 068；对决版记为决策 069。
- 验证：typecheck、定向 oxlint、build、validate-locale、diff --check 通过；Tabbit 1440×900 中英文、三类展陈、390×844 无横向溢出，作品未被面板遮挡，首屏可见底部说明与类型切换。未做实体手机验收。未 commit、未 push。

## 2026-09-15 · 标题强调再收敛

- 用户否定酸黄圆环句点。移除自绘圆环，恢复原字体句号，仅在“算”字下加 3px 细短线，不延伸到句号；题库/偏好榜新入口保留。typecheck 通过，已浏览器目验；本轮未重跑纯视觉之外的导航测试。未提交。

## 2026-09-15 · 标题句点与次级入口打磨（圆环已被否）

- 用户认为“算”下方荧光长条突兀，同时题库/偏好榜不够显眼，授权直接打磨。
- `home-next.tsx/css`：移除横压标题的黄条，改为句尾酸黄底、深墨圆环的小句点；保留视觉落点，缩小强调面积。主按钮下新增“提示词库 / 偏好榜”双入口带，图标、说明、整块链接与悬停反馈，页头链接保留；继续调用原 convoy / bands，不改主入口和经典版。
- 三条新文案补入 messages。验证：typecheck、定向 oxlint、build、validate-locale、diff --check 通过；Tabbit 实测两条新增链接及原转场正常，桌面与手机中英文 CSS 390×844 无横向溢出；已查看桌面及英文手机截图。未做实体手机验收。未 commit、未 push。

## 2026-09-15 · 首页重做：恢复全站视觉基线

- 用户否定上一轮暖白/朱红方案，要求认真读 README 并对照现有色彩样式重做。已完整重读 README，核对决策 002/013/023/027 与 globals.css；新方案记录为 067，不能把 066 的自由设计理解为另换品牌。
- 重写 `app/home-next.css`，调整 `home-next.tsx`：直接使用全站 `--paper` #dfe3dd、`--ink` #1c2423、`--acid` #d9fb51；恢复原 `lobby-brand` / MiSans 字标。移除朱红、暖纸纹、a/b 替代标志、旋转画框及圆印章，改为细网格、低对比斜面、错位双窗口、酸黄强调和深墨主入口。入场短位移、标题强调展开、悬停微抬；遵守 reduced-motion。
- 继续保留经典版/新版切换、原导航功能、演示类型切换与两张遗留图片；不改模一把和共享转场。新版是本轮待用户体验的修订稿，不视为已验收。
- 本轮验证：typecheck、build、定向 oxlint、validate-locale、git diff --check 通过。Tabbit 桌面 CSS 1440 宽、手机 CSS 390×844 中英文无横向溢出；实际目验桌面与英文手机，新旧切换、三类展陈、主入口及返回、reduced-motion 主入口通过。实际计算色值与三项全站变量一致。未重跑未改动的共享转场全套断言，上一轮已通过。
- 浏览器留在中文桌面新版：`http://localhost:5173/#home`。未 commit、未 push。

## 2026-09-15 · 首页新版 Hero 与新旧切换（朱红视觉已被否，见上方修订）

- 用户要求成品级首页，风格与模一把区分。新增 `app/home-next.tsx` / `home-next.css`：暖白纸纹、朱红重点色、大字排版、双作品展陈、短入场和悬停动作；保留图片/文字/网页演示切换，手机与英文适配，尊重 reduced-motion。
- `app/home.tsx` 保留原首页，新旧共用现有进入玩法菜单与随机入场逻辑；底部“经典版 / 新版”切换默认新版，localStorage `aob-home-edition` 记住选择，存储不可用时退回会话内切换。新版保留题库 convoy、榜单 bands、语言与账号入口。未改动模一把或共享转场实现。
- 用户追加定位：主要比较前端、网页等作品，不做生图测评；两张信号塔图是早期遗留，暂留作首页演示。已记录决策 066 与 PRODUCT，不据此扩展新赛道。
- 验证：typecheck、build、定向 oxlint、validate-locale、check:game、git diff --check 通过。Tabbit 实测桌面 CSS 1440 宽与手机 CSS 390×844 无横向溢出；新旧切换和刷新记忆、三类预览、主入口/题库/榜单/随机入场、reduced-motion 主入口通过；补主入口结束时复位 leaving，快速返回首页不残留禁用，并已复测；英文手机版完成目验。未做真实手机设备测试。
- 预览：`http://localhost:5173/#home`，开发服务已启动（`npm run dev`）。工作区基线 98c9b0c；本轮未 commit、未 push。

## 2026-09-14 · 模一把对局不再落盘（当前轮）

- 用户拍板：去掉保存对局——练习模式退出重进=服务端重新出题；每日一题同样不保存（每次进入全新棋盘），但答案仍是当日种子派生的同一道。
- 改动：`lib/guess.ts` 删 `loadSession/saveSession/replaySession/loadPractice/savePractice/clearPractice` 与 `counted` 字段，新增 `wasCounted/markCounted`（`guess-settled:<dayKey>` 标记）；`app/guess.tsx` 进模式即新局、结算改看标记、`persist` 全删、练习过期直接开新局（原死循环修复随落盘一起消失）；选择屏每日角标改「今日战绩已记录/今天还没玩」，练习卡恒「随机出题 · 不限次数」（不再有「继续上次」）；「重玩今天」保留（清盘重开，答案不变）。`resetGuessData` 顺带清旧键。
- 对照页 `reference/guess-review-stage.ts` 改为真实 UI 驱动：win/loss/feedback 场景进每日模式后用原生输入事件逐条提交（原来靠种子注入 `guess-session:`，路已不存在）。外壳页首次加载 iframe 场景偶发停在选择屏（时序），切换一次场景即正常——未深究。
- 文档：`docs/games/guess.md` 存储小节重写为「对局不落盘」口径。
- 验证：typecheck、oxlint（3 文件 0 错）、validate:guess（34 项）、build、validate-locale 通过。浏览器实测（隔离端口 5199/3999 + 临时 DATA_DIR，已清理）：每日题猜 2 次刷新丢盘且答案不变（GPT-5.6 Luna）、无 `guess-session:` 残留、赢局结算 played=1、刷新重进角标「今日战绩已记录」再赢不重复结算、练习退出重进开新局（08/8 全新棋盘）、对照页 win/loss/feedback/empty/picker 五场景全过。
- **本提交批次（059 过场～去落盘共 9 轮 + 后台模一把页 + 模式选择页美化）已按用户指示 commit，未 push。**

## 2026-09-14 · 模式选择页美化与双向导航（当前轮）

- 已重读接手文档，并按 064 的“每日一题 + 三档随机练习”当前实现调整 UI；不沿用旧的三档每日题口径。Git 基线仍为 `3315b5e`，原工作区其他批次未提交改动保留；本轮未 commit、未 push。
- 层级统一为 **玩法菜单 → 模式/难度选择 → 游戏**。游戏的左上角品牌、返回文字（改为“返回选择模式”）、模式标签均退回选择屏；选择屏品牌与“玩法菜单”链接才退回 `#play`。内部选择仍为 `#guess` 下的组件状态，不新增路由或改存档键。
- 保留已认可的菜单→模一把 `deal` 入场。新增 `folio` 薄幕短过渡（230ms 覆盖、310ms 开始退场、570ms 完成），选择→游戏正向，游戏→选择及选择→玩法菜单反向。全覆盖时才更新界面；退出路由时动画继续完成，内部卸载会取消。支持 reduced-motion、防连点、结束后焦点归还内容区。
- 选择页：每日大卡配简洁牌面，三档练习分区、编号与继续状态；去掉卡片上的重复英文难度名，中文/英文各自单语展示。练习等待期间所有模式入口禁用，准备成功后再播放过渡；失败停留选择页并显示错误。返回不清空每日/练习存档。
- 对照：`reference/guess-review.html` 默认模式选择屏，练习与每日均使用隔离接口/存储；`reference/game-transitions-review.html?study=folio` 新增 05 轻翻页，可切换前进/返回、拖动与暂停。
- 实测：typecheck、build、check:motion、validate-locale、定向 oxlint 通过。Tabbit 检查中文桌面 CSS 1440×1000、英文手机 CSS 390×844 无横向溢出；每日题与三档练习前进/三种返回入口、每日和练习猜测进度恢复、开局失败留在选择页、连点仅发 1 次请求、reduced-motion 无残留、真实主入口仍为 deal / 退出为 folio 均通过。
- 本轮不改后端、难度归档、判定与上报口径；未重跑会触及后端的整套玩法验证，原 34 项结果见下方审查批次。真实手机设备验收未做。

## 2026-09-14 · 代码审查与修复：追加契约 + 价格档判定（当前轮）

- 用户要求全面代码审查（重点后台与模一把），随后拍板全部修复。审查发现 3 个 BUG，全部已修：
- **BUG1（严重）后台追加模型会换掉当天及历史的每日题答案**：旧实现「散列 % 全量槽数」，98→100 槽实测 60 天里 58 天换答案，「追加不改历史」的契约从未实现。修法：`answerForDate` 槽分基础/追加两类——基础槽（主数据集，槽序冻结）恒参与；追加槽带 `sinceDay`（服务端写入 = 追加次日）从该日起才并入当日模数。追加模型立即进候选与练习池，次日才可能被抽为每日答案。**等价性自证：对当前数据集（无增量条目）新逻辑与旧逻辑四池 × 3650 天 = 14600 次比对零差异，无任何答案重排**；`registerExtraModels` 顺带改两阶段提交（坏批次整体拒绝，不再部分注册残留在数据集里）。
- **BUG2（严重）价格档相邻档黄灯失效**：旧实现把档位序数喂给 `judgeNumeric` 比值分支，0↔1（1/0=∞）与 1↔2（2>1.5）都误判灰，全数据集 4930 对相邻档组合 2200 对错给灰。修法：`judge` 内价格档改纯序数判定（差 1 黄 / ≥2 灰 + 箭头 / 同档绿 / null=？），不再走 `judgeNumeric`。
- **BUG3（显示）后台模型清单难度全标「（旧）」**：`DIFFICULTY_LABEL` 是给 `guess_results` 历史流水（060 时期）用的，数据集清单误用同表。已拆出 `POOL_LABEL`（现行 简单/标准/困难）供清单用。
- 断言补充（`validate:guess` 32→**34 项**）：价格档全档位相邻=黄断言（合成最小模型，防回归）；追加契约断言（独立 jiti 实例：追加不改当天与历史答案、sinceDay 起十年内确实参与派生、两阶段拒绝坏批次）。
- 文档同步：`docs/games/guess.md` 派生小节补基础槽/追加槽机制与「勿用全量取模」警告、追加通道补 sinceDay 与两阶段、上报口径修正（「看答案」按负场结算并上报，旧描述「不收尾局不上报」与代码不符）。
- 端到端实测（隔离端口 3998 + 临时 DATA_DIR，未动用户数据）：dev 登录→后台追加→增量文件 sinceDay=次日、today 候选 139 含新模型、**服务端每日答案追加前后一致**、简单练习 60 局中新模型出现 1 次。
- 验证：typecheck、validate:guess（34 项）、validate-locale 通过。未 commit、未 push。
- 审查中其余确认正常的部分：判定核心其余规则、每日派生确定性/UTC+8 切日、练习局过期自愈、counted 防重、认证层、后台接口门禁与校验、i18n 覆盖（含模态动态文案）、deal 过场与导航锁。
- 未修的已知项（留用户拍板）：限流 10 次/分钟对模一把偏紧（一局每日题 8 猜+看答案+上报正好用满，紧接开练习局会 429，前端文案「网络不给力」有误导——`RATE_LIMIT_PER_MIN` 可调）；前端打包泄漏 `answerForDate`（HANDOFF 前轮已记录，待拍板挪 PRICE_TIERS 独立模块）。

## 2026-09-14 · 模一把搜索改全库补全（当前轮）

- 用户拍板：搜索输入改为纯补全——**空输入不再出候选**（原来的「热门前 8 + 熟悉的模型开始」面板去掉），输入后才在**全量模型库**匹配，不按当前答案池过滤（每日/练习都一样；猜池外模型拿正常反馈，等于自愿加难度）。已猜排除不变。
- 改动只在 `app/guess.tsx`：`candidates` 从 `today.models` 全库搜、空 query 返回空；建议面板加 `query 非空` 渲染门槛；`pool` 仍用于「N 个模型，唯一答案」的**答案池**口径不变。messages 删掉「从一个熟悉的模型开始」。
- 验证：typecheck、build、validate-locale、定向 oxlint 通过。Tabbit 实测每日题：聚焦空输入不出面板；输入 "gpt oss" 出 GPT OSS 120B/20B（困难池模型，证明全库搜索生效）。
- 同修一个练习局过期死循环：服务端重启后本地 `guess-practice:<难度>` 里的死 gameId 触发 `game-expired` → 旧逻辑 `setSession(null)` 后 `enterPractice` 又从 `loadPractice` 把同一死局续回来 → 每次提交都报「上一局已过期」。修法：`lib/guess.ts` 新增 `clearPractice`，`app/guess.tsx` 抽 `recoverExpiredPractice`（清档再开新局），`submit` 与 `revealAnswer` 两处 checkGuess 调用统一兜 `PracticeExpiredError`（后者此前无 catch，会未处理 rejection）。Tabbit 实测：种死 gameId 残局 → 首猜报一次过期并换新局号 → 次猜 200 正常出行。用户浏览器里的死档刷一次页面即自愈。
- 未 commit、未 push。

## 2026-09-14 · 模一把进后台：游玩统计 + 手动加模型（当前轮）

- 用户要求后台加「模一把」页：看游玩数据、各模型平均猜出步数、手动加模型（决策 063）。
- **游玩数据此前不存在**——对局全在浏览器本地。新增匿名上报 `POST /api/guess/result`（一局结束报一条，与 counted 结算同一时机）：answer_id 由服务端按 dayKey 从每日池重新派生，客户端伪造不了归属；落 `guess_results` 表（迁移 006）。064 起只收每日题、difficulty 记 0，练习模式不上报。
- **新模型存增量文件** `data/guess-models-extra.json`（方案 B，用户从直改仓库文件/增量文件/数据库三选一拍板）：服务端启动时 `registerExtraModels` 合并到数据集末尾，追加契约不破；后台 `POST /api/admin/guess/models` 写文件+即时注册内存，不重启生效。新厂商强制登记地区码（并入 VENDOR_REGION 口径）。只能追加不能改。
- 后台页 `app/admin/guess.tsx`（侧边栏「模一把」）：概览卡（累计/今日完成局数、猜中率、胜局平均步数、模型总数）、按模式表（0=每日一题、1-3=060 旧档）、按答案模型表（出场/猜中率/平均步数）、近 14 日表、追加模型表单（全字段校验+厂商 datalist）、全量模型清单（extra 标记）。
- 与并行 AI（064 双模式拆分）协同：各管各的文件已合流；`reportResult` 签名以 064 版为准（3 参，不带 difficulty）。
- 验证：typecheck、build、validate:guess（32 项，含 result 落库/admin 门禁/增量文件结构断言）、定向 oxlint 通过。实测真实 server：dev 登录成 admin，加模型两个（新厂商带地区/已有厂商）落盘+即时进 today（140 个），重名/缺地区码 400，result 上报 204 且 stats 聚合正确（answer_id 服务端派生）。未做浏览器端后台页面目验。
- 未 commit、未 push。

## 2026-09-14 · 模一把双模式拆分：每日一题 + 难度练习（当前轮）

- 用户拍板（决策 064）：**每日一题**全球同题、种子派生、只从简单+标准池出（困难不进每日）；**练习模式**三档难度随机出题、不限次、「再来一把」。练习答案服务端随机抽取并持有（`POST /api/guess/practice/start` 发 gameId，`check` 带 gameId；局存内存，重启失效前端自动开新局）；练习不计战绩不上报。
- 存储：每日对局 `guess-session:<dayKey>`、战绩 `guess-stats`（060 时期的 `guess-stats:1` 自动并入）；练习局 `guess-practice:<难度>`。060 版按天分难度对局不迁移（口径已变，自然作废）。
- 与并行 AI（063 后台）的接口约定：`/api/guess/result` 只收每日题、difficulty 记 0；后台按难度统计图出现 0 档是每日题。我的改动集中在 check/practice/result 与前端，后台管理段未动。
- 验证：typecheck、build、validate:guess（32 项；新增练习开局/游戏态判定/过期局 404、每日题不出困难档、上报 difficulty=0；测试服限流经 RATE_LIMIT_PER_MIN 放宽）、定向 oxlint 通过。浏览器实测：选择屏=每日大卡（98 候选）+三档练习卡（58/40/40）；每日池搜不到困难档（Vicuna 拦截）；困难练习连猜 8 次→揭晓（Doubao Pro）→「再来一把」重置开新局；对照页四状态正常。
- 注意：开发期间 3000 端口 API 进程挂过一次（疑似 --watch 在并行编辑中崩溃），已用 `npm run dev:server` 单独重启后台运行；若用户重启整组 dev，注意端口占用。
- 未 commit、未 push。

## 2026-09-14 · 难度手动调档 + 厂商同国家给黄（当前轮）

- 用户对重构后数据集手动调档 15 项（GPT OSS/Llama 3.3/Qwen3.5 397B/o4-mini/Inkling/Grok Build/Qwen3.5 122B/Qwen3 Coder Plus/Qwen3 VL 入困难；GPT-5.x Nano 入标准；Grok 4.x/DeepSeek R1/Claude Fable 5.1/Gemini 3.x Flash/GPT-6 Astra 入简单），当前三池 **简单 39 / 标准 26 / 困难 37**。
- 厂商格新规则（决策 062）：同厂商绿、同国家/地区黄、跨国灰；映射表 `VENDOR_REGION` 在 `lib/guess-logic.ts`，新厂商必须登记（validate 有断言）。当前 21 家厂商：CN 11 / US 9 / FR 1。
- 分组不一致已列清单待用户拍板（未动）：Gemini 3.5/3.8 Flash 独立于 3.x Flash 组、GPT-5 主线 5/5.4/5.5/5.6×3 独立而 5.1/5.2 成组、Sonnet 4.5/4.6/5 独立而 Opus 4.x 成组、DeepSeek 全系未成组、GLM-5.3、Kimi K3/K2 Thinking 独立。方案 A 维持 / B 家族彻底合并 / C 只修明显不一致。
- 存疑厂商归属（留给外部 AI 查证批次顺带核）：Muse Spark 1.3 记 Meta、Inkling 记 Thinking Machines——名称无前缀线索，虚构新款无法网查实证。
- 验证：typecheck、build、validate:guess（31 项，新增厂商同国黄/地区登记断言）通过。未 commit、未 push。

## 2026-09-14 · 模一把数据集重构：合并组 + 剔除 + 国内线（当前轮）

- 用户判定数据集可猜性差（Qwen3 Coder 480B A35B 这类参数串无从猜起、国内热门不足），拍板合并方案（决策 061）：**同线小版本并入组条目**（`name` 用 "Qwen3.x 27B" 占位写法，`variants` 存各版本完整条目、不带 difficulty 随组），答案池组占一槽；抽中组后按「该槽历史命中次数」轮转实例化版本（两级派生、无随机源、同题全球一致）。玩家猜组内邻近版本得「全绿只差月份」，版本号即最后一层推理。**越古老的代际合并越多，新模型分开**。
- 数据集：155 条 → **102 个答案槽 / 138 个可猜名**（21 组合并、删 22 条、追加 5 条：Doubao Seed 1.8 / 2.0 Pro / 2.1 Pro / Hy4 Preview / Muse Spark 1.3）。**未来答案全部重排**（上线第 2 天执行，代价最小）。
- 实现：`lib/guess-logic.ts` 适配层展开 variants（`GuessModel.groupId`），`answerForDate` 第一层散列选槽、第二层轮转版本；组名本身不可猜，候选/判定吃具体版本。前端无需改动（today.models 自动含变体）。
- 验证：typecheck、validate:guess（30 项，新增组契约/同组同池/十年全槽位覆盖+版本全实例化断言）通过。组内版本轮转曾试第二散列常数方案——数学上不保证全覆盖（GLM-4.6 十年未出），改命中次序轮转。
- 存疑字段（Doubao 三条的 contextK、2.x 模态）按口径填 null 走「?」，**用户已派外部 AI 查证**，回填时字段补齐即可、勿动 id/name/数组顺序。
- 未 commit、未 push。

## 2026-09-14 · 模一把三档难度（当前轮）

- 用户指示：冷门与热门同池不合理（Falcon vs GPT-5.6），做三档难度，进游戏先选难度再开局；**模型归档后续由用户逐个调**（筛选名单与补价格缺口暂停，见决策 060）。
- 机制：简单/标准/困难三池互不重叠（`poolForDifficulty`），同一天三档各出一题（池内下标散列），对局与战绩按难度分键（`guess-session:<dayKey>:<难度>`、`guess-stats:<难度>`），旧无后缀记录读简单档时自动迁移。分享文案带难度。重玩、换难度（页面内难度标签）都不丢进度。
- 默认归档按热度：≥30 简单（47）/ 14–29 标准（73）/ 其余含全部经典 困难（35）。调档只改数据集 `difficulty` 字段——**注意：改归档会重排两个池的历史答案，上线后冻结**。
- 已知文案冲突处理：中档叫「标准」不叫「中等」——「中等」已被价格档占用（en=Mid），messages 按中文键查。
- 改动：数据集加 `difficulty` 字段、`lib/guess-logic.ts`（难度常量/分池/answerForDate 带池）、`server/index.js`（check 带 difficulty，缺省回落简单档）、`lib/guess.ts`、`app/guess.tsx`（选择屏+切换）、`app/guess.css`、`lib/messages.ts`、`reference/guess-review-stage.ts`（guess-force-difficulty 钩子跳过选择屏）、`scripts/validate-guess.mjs`（28 项）、`_dataset-review.md` 重出（带难度列）。
- 验证：typecheck、build、validate:guess（28 项）、定向 oxlint 通过。浏览器实测：选择屏三卡计数 47/73/35、状态角标正确（简单档迁移出「进行中 4 次」）；困难档候选 35 个且下拉只出经典；难度标签往返不丢进度；服务端三档答案与本地派生一致（GPT OSS 20B / o4-mini / Qwen1.5 72B）；390px 无横向溢出。对照页四状态经钩子正常。
- 发现一个既有问题（未修，不阻塞）：`app/guess.tsx` 从 `lib/guess-logic` 引 PRICE_TIERS 会把 `answerForDate` 与全量数据集打进前端包，控制台可直接算出当日答案——「答案不下发」只挡了网络层。要修就把 PRICE_TIERS 挪到独立模块。待用户拍板。
- 未 commit、未 push。

## 2026-09-14 · 模一把重玩按钮（当前轮）

- 用户要求给模一把加「重玩」：结果横幅新增「重玩今天」按钮（酸黄描边次级按钮，位于「分享战绩」左侧；手机端两键等宽并排）。点击后清空本日猜测重新开局，搜索框与 8 次机会恢复。
- **战绩口径**：对局记录新增 `counted` 字段，战绩只在首次结束时结算一次并写回 `counted`；重玩后再次结束、刷新页面都不再重复记。顺带修掉了一个既有隐患：旧逻辑靠组件内 ref 防重，刷新已结束的对局会重复结算战绩。
- 改动文件：`lib/guess.ts`（`counted` + `replaySession()`）、`app/guess.tsx`（结算守卫 + `replay()` + 按钮）、`app/guess.css`（按钮与移动端样式）、`lib/messages.ts`（重玩今天/Replay today）、`docs/games/guess.md`。
- 验证：typecheck、build、validate:guess（26 项）、定向 oxlint 通过。对照页（隔离存储）实测：重玩后棋盘清空/搜索恢复/机会重置为 08/8，重玩再猜中战绩不重复累计；390px 视口按钮并排无横向溢出（DOM 几何核对，clip 截图有拼贴伪影不可信）。
- 未 commit、未 push。

## 2026-09-14 · 模一把专属入场过渡（当前轮）

- 当前 Git 基线为 `3315b5e`（模一把玩法与视觉重做已由此前批次提交）；本轮专属过渡及文档改动未 commit、未 push。下方上一轮的“未提交”说明属于历史状态。
- 用户喜欢首页→菜单的档案锁定节奏，但明确要求模一把的新动画不要长得太像，授权重新设计。已将菜单→模一把从 convoy 改为独立 `deal`（今日密牌）；其他入口及模一把返回方式保持原行为。
- **最新定稿方向**：用户认为竖版密牌开头失去神秘感，要求恢复此前黑框，仅稍加装饰。已恢复原黑框与问号的旋入/放大轨道，以及两层背板；只在开头问号层加极淡双细边与横向暗纹，720ms 随问号消失，后段保持原样。上一条“独立竖版密牌”方案已撤回。typecheck、check:game 通过；本轮未重新做截图复核。
- 开头单独打磨：用户已认可后续部分，只要求改善最初黑色方块。现在用独立竖版密牌从下方入场并靠近放大，复用后段的细纹、压边和标记；满屏遮挡层不再缩小成方块。720ms 时开头牌完全透明、遮挡层完全不透明，后段轨道和总时序保持不变。
- 开头续轮验证：typecheck、build、check:game、定向 oxlint 通过；新增“满屏层不缩放、开头牌在交接点消失”断言。浏览器读取 300ms 牌面尺寸约 169×223px，720ms 遮挡透明度为 1 / 开头牌为 0，实际导航与清理通过。截图工具两次超时，未完成本轮新开头的截图视觉复核；不沿用上轮截图作为本轮验收。
- 质感打磨续轮：用户认可设计方向但认为有廉价感，授权继续打磨。改为深色细纹卡面、浅金属色压边、柔和阴影及一次掠光；移除外圈轨道与硬色块投影，七条线索改为细刻度，收小旋转/位移并降低标题字重。保持 720/1370/2020ms 导航时序。
- 视觉：卡牌错峰旋入、展开为墨绿满屏、七条线索依次亮起、左右从中央揭幕。默认覆盖点 720ms，退场 1370ms，总长 2020ms；手机竖屏为上下构图。标题支持主站中英文。
- 模块与样式：`lib/game-transitions.ts` / `app/game-transitions.css`，入口为 `app/play-menu.tsx` 的 `guessNavigate()`。与 convoy 共用菜单导航锁，盖满后才切 `#guess`，结束清理；减少动态效果直接跳转。对照页与实际入口共用实现。
- 体验：`http://localhost:5173/#play` 点击“模一把”；对照：`http://localhost:5173/reference/game-transitions-review.html?study=deal`，新增“04 今日密牌”，支持拖动、暂停、全屏、速度和中段节奏。
- 本轮验证：typecheck、build、check:motion、validate-locale、定向 oxlint 通过。新增断言覆盖完整遮挡、两半屏退出时机、七条线索、重复/跨入口点击锁及 reduced 清理。Tabbit 实际点击确认先保持菜单，切页时遮挡矩阵已归位且两半屏覆盖 CSS 1440×1000；退场无残留。中文竖屏 CSS 488×1055、英文 CSS 390×844 已查看。无真实手机设备验收。
- 打磨续轮验证：typecheck、build、check:motion、定向 oxlint 通过；新增掠光首尾透明与随内容结束的断言。Tabbit 查看桌面对照与 CSS 390×844 手机画面，并重跑实际菜单入口，结束后无残留层。
- 原有玩法规则和战绩统计未修改。打磨版本待用户体验反馈，未 commit、未 push。

## 2026-09-14 · 模一把视觉重做（当前轮）

- **收尾状态**：用户已确认“没问题”，要求“文档写一下，先这样”。当前视觉版本保留，本轮到此结束；后续改动等用户新指示。此确认不包含 commit/push 授权，所有改动继续留在工作区。
- 用户授权全面重做模一把界面，暂不处理此前发现的规则/战绩问题（决策 058）。已直接接入 `#guess`，未 commit、未 push。
- `app/guess.tsx` / `app/guess.css`：墨绿解谜舞台、酸黄悬浮卡牌、八次机会指示、搜索置顶、七属性横向棋盘、分色反馈、结果横幅与本地战绩。手机仅棋盘横向滚动，键盘方向键/回车/Escape 可操作候选；加入请求中与加载失败重试状态。
- 动效使用 CSS transform/opacity：入场、浮动卡牌、候选展开、刚提交行的七格依次揭示、延后结算入场；不靠动画时钟决定胜负/持久化，恢复存档不重播翻格，支持减少动态效果。
- 对照入口：`http://localhost:5173/reference/guess-review.html`。调用真实页面，演示空白/反馈/胜利/失败；猜测接口、对局/战绩和语言设置隔离在演示页面内存，不影响真实记录。可调宽度、暂停和重播。
- 本轮实测：typecheck、build、validate:guess（26 项）、validate-locale、check:motion 通过；定向 oxlint 通过。Tabbit 检查 CSS 1440 / 390 视口，中英文布局、四种状态、键盘提交、无匹配、胜利揭晓、恢复历史不重播、减少动态效果均通过；请求失败不扣次数、恢复输入，加载失败可重试恢复，键盘候选自动滚入可见范围。未运行 Lighthouse、未做真实手机设备验收。
- 既有战绩当次不刷新等问题未处理；不以本轮 UI 检查代替这些问题的验证。原工作区其他未提交改动保留。

## 接手阅读顺序

1. `AGENTS.md`。
2. 本文。
3. [本轮总结：模一把每日猜模型玩法](docs/handoff/2026-09-13-模一把每日猜模型玩法-kme7kme7-prog.md)。
4. 按需阅读 `docs/PRODUCT.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`；首次接手读 `README.md`。
5. 上一远端批次见 [本地同步、鹈鹕接入与主站语言视觉整理](docs/handoff/2026-09-13-本地同步鹈鹕接入与主站语言视觉整理-Atmeplz.md)。`docs/IDEAS.md` 是候选库，不是授权任务清单。

## 当前状态速览

- **代码基线**：以 `git log` 为准（多批已 commit 未 push 的工作叠加在工作区，上方按日期排列的各轮即工作日志，push 前按模板归档进 `docs/handoff/`）。
- **模一把**：每日一题（简单+标准池）+ 三档随机练习双模式（064）；数据集 102 答案槽/138 可猜名（061 合并组）；厂商同国给黄（062）；后台有游玩统计与追加模型页（063）；对局不落盘、只存结算标记与战绩（09-14）。
- **竞技场**：入场/结果时间轴与「下一题」区域过场为 076-078 定稿口径；「逐个巡览」开关默认开。
- **本地服务**：`npm run dev`，前端 `http://localhost:5173/`、API 3000；模一把入口 `#guess`。
- **多实例坑**：vite HMR 多文件更新偶发白屏（root 无子节点）——硬刷新即恢复，不是代码 bug。

## 模一把实现要点（接手改动前必读）

- 判定核心 `lib/guess-logic.ts` 是纯函数，**前端类型与后端判定是同一份文件**：服务端用 jiti 加载（`server/index.js`），验证脚本同法。改判定规则只改这一处。
- 答案永不下发：每日题只有猜中或 `final:true`（第 8 次）才附答案；练习局答案服务端内存持有。**已知待拍板**：前端打包会把 `answerForDate` 打进 bundle（引 PRICE_TIERS 的连带），控制台可算当日答案——修法是把 PRICE_TIERS 挪独立模块。
- 每日一题派生：每日池（简单+标准，064）`dayNumber × 2654435761` 散列选槽 + 组内命中次序轮转（061 两级派生），无随机源；epoch=2026-09-13；追加条目（含增量文件）必须带 sinceDay（070）。
- **视觉维护入口**：`app/guess.tsx` / `app/guess.css`，反馈格保留 hit/near/miss/unknown 四种语义 class，配色集中在 `--guess-*` 变量；规则阈值在 `GUESS_CONFIG`，不要通过改判定规则实现视觉效果。
- **玩法规则独立成篇**：`docs/games/guess.md`——规则口径、判定阈值、每日派生、数据集维护契约以它为准；PRODUCT.md 只留概述外链。
- **模态判定是二元口径（085）**：只分「纯文本 / 多模态」——同纯文本=绿、同多模态=黄（恒黄，不细究图/音/视差别）、一纯一多=灰。数据集 `modality` 仍记细分集合，判定不看细节。改模态**不影响历史答案与分池指纹**（实证 365 天 0 变化），故修正模态数据不必走分池定稿流程。

- 过场分工：题库与菜单进测评用 convoy 一体斜幕，榜单入口用 bands（决策 052）；模一把走独立 `deal` 今日密牌（决策 059，不再走 convoy）。
- 娱乐结果主按钮「下一题」随机排除当前题；正式测评维持同题换组（053）。
- 平局双方 Elo 各 0.5，并占用对局去重（048）。
- 模型反应一人一题一模型一槽（054）；揭晓后提示词折叠条在作品下方（055）。
- 真实作品走数据库与 `data/works`，不要恢复 `lib/arena.ts` 旧硬编码注册。
- 提交需用户明确授权；他人遗留 `public/works/005-007/` 与 zip 不动。

## 遗留文件与下一步

- 他人遗留 `public/works/005/`、`006/`、`007/` 与 `public/works/works_2026-09-11,a-k.zip` 未动；不得顺手删除或提交。
- 本轮改动清单与验证细节见本轮总结；`data/`、`dist/`、截图不提交。
- 下一步优先级：①用户验收模一把（玩法手感/视觉为第一版，难度分池与合并组刚重构）；②验收后授权提交；③数据集后续：逐模型调难度归档、外部 AI 查证回填存疑字段（null 价/上下文）；④多人对战模式（用户已表达后续意向，未授权开工）。
- 候选：004–007 正式接入、反应取消语义、iframe 沙箱方案、后台活动管理。均按用户确认范围推进。
