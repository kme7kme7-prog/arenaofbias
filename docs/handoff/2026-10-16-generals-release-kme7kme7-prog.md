# 2026-10-16 · 将军对垒上线 · kme7kme7-prog

- 负责人：kme7kme7-prog。
- 提交范围：`09d0cd7..本提交`，单独发布将军对垒和五份模型作品。
- 用户授权：“你帮我推上去吧 其实做的差不多了 几个作品也推上去”。

## 改动与决定

菜单将军对垒解除锁定，连接 `/generals.html`，复用纸墨主题与双向色块横推。发布当前沙盘、真人参战、本地预计算与回放、13 章动画教学；移除开发服务依赖，静态加载作品库。

五份原件为 Astra high、6.1 Sol high、6 Luna max、5.6 Terra high、5.6 Sol high。原件 SHA 与原字节保留，七个 baseline 独立分组。来源、规则、边界见 `docs/games/generals.md`；本轮发布决定记于 `docs/DECISIONS.md` 同日条目，无待拍板事项。

浏览器模块使用 `.js` 以获得正确 MIME。首次公网验收发现生产 CSP 拒绝 Function 编译，立即恢复原站，再切换到 Blob Worker 直接解析可信源代码。没有修改全站 CSP、nginx、后端或数据库；修正版经相同 CSP 和公网真实对局验证。

## 验证

- `npm run typecheck`、生产 `npm run build -- --manifest`：通过。
- 新入口、菜单文件、browser-worker 和两份新校验脚本的 scoped oxlint：通过。
- `node scripts/validate-generals.mjs`：12 原件哈希、5 模型及强度、菜单/主题/过场、真实 Node Worker 和回放校验通过。
- `node scripts/validate-generals-worker.mjs`：禁用字符串编译下执行 12 原件；种子一致、同步返回、异常处理和 URL 回收通过。
- 本地生产构建及生产相同 CSP：两场真实四人对局分别 480 / 492 回合，覆盖五份作品，异常均 0；真人模式、暂停和有效方向队列通过。
- 教学 13 章、选手分组、五种视口（1920×900、2560×1440、1366×768、390×844、320×760）通过；画布为正方形，无横向溢出。纸墨及减少动态效果下双向菜单过场通过。
- 最终公网：43 个增量文件逐一 GET 的哈希和 JS MIME 正确；12 选手加载成功；480 回合真实四人比赛、回放与结算无 bot 异常；纸墨主题、教学和双向过场通过，页面错误 / 控制台错误 / HTTP 错误均 0。验收拦截两次统计 POST，未写生产业务数据。
- `git diff --check` 排除原件目录后通过；原件中的换行和空白不为格式检查改写。
- 未重复原工作区 200 场策略评测和完整引擎差分套件：本轮未改规则或作品策略。未跑全仓 lint：已有作品风格错误；另直接 lint 复制的 runtime 报出未使用解构 code 与两处 Promise.all/可选值检查，保留既有行为，真实 Node/浏览器对局通过，不宣称全仓 lint 无错。

## 发布与回滚

修正版部署构建提交 `03c582685d98af129db8bf28d2ef5ac397638334`，最终提交仅追加发布记录。静态目录从 1426 文件增至 1468；只覆盖既有 `index.html`，新增 42 文件，其他既有静态文件哈希全部保留。

- 线上入口：`https://game.arenaofbias.icu/generals.html`。
- 服务器发布凭据目录：`/root/aob-generals-20261016-03c5826`。
- 回滚目录：`/www/wwwroot/show1-dist.prev-generals-03c5826`。
- 初次失败发布另存 `.failed-generals-cec63fb`，没有作为完成版本。
- 本地证据：隔离工作树 `.local/generals-release/`；最终公网凭据 `public-qa-fixed.json`。

## 遗留物与范围

主工作区的未提交 / 未跟踪改动原样保留，未把辩论、海龟汤、坦克联赛或其他试验纳入发布。源 `generals-ai-pk` 和冻结的参赛工作区未改。没有新模型调用、服务器比赛、20 人或超大地图功能。

发布使用 `C:/Users/hyc/.codex/worktrees/generals-release/Show1` 的 `codex/generals-release-20261016` 分支；主工作区因存在重叠菜单改动，不强行更新其本地 main。后续继续工作应基于已发布的 origin/main，并保留原工作区改动。Git 只使用用户身份，无联合署名。
