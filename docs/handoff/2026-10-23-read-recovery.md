# 2026-10-23 · 榜单与账号读取恢复 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行：主代理与相同模型子代理，后端代理独立复核无阻断。基线 `7c24c67`，用户授权修复、提交、推送、上线，实际SHA见父工作区私有 `final-github-state.json`。

## 目标与改动

继续检查已启用页面的加载与边界，保持按需读取、安全与用户体验。旧榜单及账号验证配置在慢响应头/正文时长时间停留加载态，SDK挂起后共享promise/script也不释放；在旧构建复现5项后最小修复。

榜单和验证配置复用12秒有界读取，覆盖正文，路由退出取消、旧响应不覆盖。失败显示手动重试，不自动连续重试或重发写请求。Turnstile SDK也加12秒截止、失败清理及局部重试，清空旧token/key/config；关闭取消配置，旧widget回调失效，使用捕获的SDK实例清理。错误配置仍要求验证，成员概览不预取，进入绑定意图后再读。

仅改 `components/account.tsx`、`lib/show1-board.ts`、`lib/messages.ts`、`scripts/validate-read-recovery.mjs`。沿用既有按需加载决定，隐藏评论保持关闭，无新增待拍板事项。

## 验证

真实候选构建+隔离流式/故障API共14项浏览器场景通过，覆盖慢头/慢正文、500/坏格式、快切/退出、关闭重开、SDK截止/迟到/失败重试、旧token隔离、成员按需和独立排位账号。均390px，无页面异常和横溢，不点完整回放。旧构建5项失败证据独立保留，不称为公网故障复现。

typecheck、主构建、独立scoped ladder构建、相关lint、目录恢复/按需检查、diff检查通过。account默认lint仍有与HEAD相同8项：EffectSetState 2、Refs 4、语义标签2，不称为全仓lint通过。没有扩大到无关重构或不受影响的坦克套件。

最终公网8场无响应覆盖全部通过，其中本仓4场为真实HTTP聚合榜单1440/390、首页账号390、排位账号390，页面异常0、横溢0，验证配置等待弹窗意图才读取，无生产登录及完整replay下载。未实际解Cloudflare挑战，故障与写入分支通过隔离夹具验证。

## 发布、限制与遗留物

普通dist和独立 `.local/round3-ladder-dist` 分别构建，按依赖闭包合并31文件1,014,540B：index/playground/ladder三入口及28个新hash JS；ladder只新增入口与主bundle两文件383,412B。139个旧依赖与生产逐项匹配，保留全部旧hash、其他入口、live-only内容。capture、数据包、原作及运行结果不发布。

静态备份 `/www/wwwroot/show1-dist.before-reads-20261023`，回退切静态目录，不回滚业务数据。未改i5、坦克/将军冻结引擎、协调器、规则与历史成绩，engine `4a53feb6…`、runtime `95e96cab…`保持。没有全面操作全部玩法或第三方原作。

私有发布清单、source冻结、安装回执、浏览器日志和截图在父工作区 `.local/performance-round3-20261023/` 及本仓 `.local/round3-*`；生成物与证据不入库。后续扩展按实际负载另作验证，不把本轮结论当作全部页面无边界问题的保证。
