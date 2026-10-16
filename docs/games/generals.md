# 将军对垒

入口为 `/generals.html`，玩法菜单直接进入，进入和返回沿用主站色块横推。使用主站 `aob-theme` 纸面 / 墨色 / 跟随系统设置；减少动态效果时跳过完整过场。

## 当前玩法

- 2–4 人 FFA，14、18、22 格方形地图，固定种子可复现初始地形，回合上限为 600 / 1200 / 2400。
- 看 AI 交锋：在浏览器 Worker 中先计算完整比赛，再播放本地回放，可暂停、调速、定位、导入和导出。
- 我来当将军：A 席由真人控制，只显示己方视野；支持方向键、WASD、屏幕方向按钮、半兵和最多 8 步指令队列。
- 13 章动画教学覆盖地形、增长、调兵、战斗、迷雾、城市、将军失守和操作。
- 每步 bot 预算 500 ms，累计 50 次异常淘汰；Worker 是计算隔离，不是对恶意代码的完整安全沙箱。本地导入只使用可信作品。
- 没有付费模型在线调用、服务器比赛、正式积分或排行榜写入。

规则与接口以 `public/generals/engine/RULES.md`、`API.md` 为准。当前网页不开放 20 人或超大地图；原参赛工作区的兼容性探针不能当作这些玩法已完成的证据。

## 选手与原件

登记源为 `public/generals/roster.json`，程序为 `public/generals/bots/<id>.js`。加载时按原始字节校验 SHA-256，之后再解码执行。Git 对此目录禁用换行转换，保留 BOM 和原件字节。

| ID | 模型 | 思考强度 | 作品 |
| --- | --- | --- | --- |
| trial-astra-high | GPT-6 Astra | high | 星渡 |
| trial-sol61-high | GPT-6.1 Sol | high | 巡衡 |
| trial-luna6-max | GPT-6 Luna | max | 月澄·锋城共振 |
| trial-terra56-high | GPT-5.6 Terra | high | 边境潮汐 |
| trial-sol56-high | GPT-5.6 Sol | high | 潮汐锋 |

五份作品来自 `generals-ai-pk/Generals-五模型试跑-20261016/entries/`，没有为上线调整策略；原提交说明保存在 `docs/games/generals-entries/`。七个公开陪练仍命名 baseline-01 至 baseline-07，并与参赛作品分组。展示模型名、作品名和思考强度，不能按模型名合并不同作品。

网页可导入 `bot.js` 与 `submission.json`，保存在当前浏览器；这不等于上传正式库。新增正式作品应另行登记稳定 ID 和原件哈希。

## 网站接入

核心和前端来自本地 `generals-ai-pk`，冻结的 `Generals-参赛工作区-v1.2` 保持原样。网站副本位于 `public/generals/`；原 `.mjs` 和浏览器兼容的 `.cjs` 包装改用 `.js` 扩展及对应导入路径，避免静态服务器以二进制 MIME 返回模块。保留引擎逻辑与 JAX 来源许可 `LICENSE-JAX.txt`。浏览器通过 `browser-worker.js` 将可信作品作为 Blob Worker 脚本解析，不使用 eval / Function 编译；沿用现网已允许的 `worker-src blob:`，不放宽全站 CSP。Node 验证继续使用独立 VM Worker。

`app/generals/entry.mjs` 加载独立应用；作品库从静态 JSON / JS 加载，不调用开发工作区的 `/api/entries`。页面必须等选手加载完才启用开始按钮并释放入场遮罩，失败时显示错误且释放遮罩。离开会取消比赛及本地播放。

发布只需要首页新菜单资源、`generals.html` 和 `generals/` 文件，无后端与数据库迁移。使用静态文件增量清单保留线上其他入口和旧资源，不能用本地 `dist` 整目录覆盖现场。

## 验证

`node scripts/validate-generals.mjs` 检查原件、登记、入口、主题和真实 Worker / 回放。`node scripts/validate-generals-worker.mjs` 在禁用字符串编译的上下文运行 12 份原件，检查种子、异常与 Blob URL 回收；另在与生产相同 CSP 的本地服务上完成两场四人回放和真人控制。2026-10-16 接入时通过类型检查、相关文件 lint、生产构建；浏览器两场四人比赛覆盖五份作品，均无 bot 异常；验证真人控制、13 章教学、纸墨主题及减少动态效果下的菜单往返。

视口检查覆盖 1920×900、2560×1440、1366×768、390×844、320×760，无横向溢出、画布为正方形。未重复原工作区 200 场策略评测，也未做完整恶意代码安全审计；本轮不改变策略和比赛规则。

公网入口：https://game.arenaofbias.icu/generals.html 。2026-10-16 修正版实测完成 480 回合四人比赛、异常 0，五作品 / 七陪练加载、教学和纸墨双向菜单过场通过。
