# HANDOFF.md · 当前状态

本文件只记录当前状态与接手指引。历史过程见 `docs/handoff/`，产品规则见 `docs/PRODUCT.md`，用户决定见 `docs/DECISIONS.md`；文档中的旧「未提交」描述以 Git 实际状态为准。

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

## 当前状态（2026-09-13 晚）

- **代码基线**：main 与远端同步于 `261ad29`；「模一把」玩法及视觉改动**未提交**。2026-09-14 用户已确认当前视觉版本，提交/推送仍须另行明确授权。
- **本轮新玩法**：玩法菜单第四项「模一把」（`#guess`，决策 057）——Wordle 式每日猜 AI 模型，8 次机会、七属性绿/黄/灰/?反馈+箭头、每日一题全世界同题（UTC+8 零点切换）、emoji 格局分享、对局与战绩存浏览器本地。用户已体验通过基本流程。
- **数据集**：`lib/guess-models.json` 102 个答案槽 / 138 个可猜模型名（含 21 个 `variants` 合并组，决策 061；models.dev 快照+人工整理，外部 AI 联网整理产出、经适配字段）。**追加新模型只放数组末尾**、组内版本只加 `variants` 末尾——每日答案按条目下标散列派生，插入/重排/调难度都会改变历史答案（契约见 `lib/guess-logic.ts` 文件头与 `docs/games/guess.md`）。
- **价格档已定稿（方案 A）**：`priceOut`=官方一手输出单价（$/M），档位由我方代码 `PRICE_BAND_EDGES` 划定（<$0.5 近免费/<$2 便宜/<$8 中等/<$25 贵/≥$25 旗舰）；数据集旧字符串档 `priceTier` 已弃用仅留 diff 校验。33 条无一手价的老模型走「?」口径。规则详见 `docs/games/guess.md`。
- **本地服务**：`npm run dev`，前端 `http://localhost:5173/`、API 3000；模一把入口 `http://localhost:5173/#guess`。
- **多实例坑**：本轮开发中 vite HMR 多文件更新出现过白屏（root 无子节点）——硬刷新即恢复，与上轮 HANDOFF 记录一致，不是代码 bug。

## 模一把实现要点（接手改动前必读）

- 判定核心 `lib/guess-logic.ts` 是纯函数，**前端类型与后端判定是同一份文件**：服务端用 jiti 加载（`server/index.js`），验证脚本同法。改判定规则只改这一处。
- 答案永不下发：`/api/guess/check` 只有猜中或 `final:true`（第 8 次）才附答案。对局无状态、全在客户端 localStorage。
- 每日一题答案派生：每日池（简单+标准，064）槽位 `dayNumber × 2654435761` 散列取模 + 组内命中次序轮转（061 两级派生），无随机源；epoch=2026-09-13。练习模式答案由服务端开局随机抽取、内存持有（practice/start + gameId）。
- **视觉维护入口**：页面与样式在 `app/guess.tsx` / `app/guess.css`，反馈格保留 hit/near/miss/unknown 四种语义 class，配色集中在 `--guess-*` 变量。动效先在 `reference/guess-review.html` 查看；规则阈值在 `GUESS_CONFIG`，不要通过改判定规则实现视觉效果。
- **玩法规则独立成篇**：`docs/games/guess.md`（AGENTS.md 文档地图已收录）——规则口径、判定阈值、每日派生、数据集维护契约以它为准；PRODUCT.md 只留一段概述外链。
- 已知小瑕疵（未修，不阻塞）：战绩条在结算当次不实时刷新，刷新页面后正确显示；「直接看答案」按钮在 `revealed` 后不再显示属预期但 `finished` 逻辑路径可再简化。

## 验证（本轮实际跑过）

- `npm run typecheck`、`npm run build`、`npm run check:motion`、`node scripts/validate-locale.mjs`：通过。
- `npm run validate:guess`（新脚本，26 项）：数据完整性/判定规则/答案派生确定性/价格档边界与分布/真实 server 接口比对全过。
- 定向 oxlint（本轮新文件 4 个）：0 错误。
- 浏览器目验：首猜反馈着色与数值正确（计算样式审计）、猜中全绿+揭晓、分享 emoji 格局剪贴板正确、刷新接档、390px 窄屏无横向溢出（表格内滚）、语言切换中英完整。
- 未跑完整 lint（既有 account/dev-panel 两项历史问题仍在，非本轮引入）；未跑 validate:votes/comments/admin 等后端回归（本轮未动这些业务，避免写库）。

## 接手时仍须遵守的既有边界

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
