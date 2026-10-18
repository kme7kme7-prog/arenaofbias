# 坦克排位赛 S01

入口 `/ladder.html`；坦克四人赛左侧「排位赛」可进入，复用纸墨与色块横推过场。
复用主站 AccountProvider 和 API 域名的 HttpOnly 登录会话，不新建匿名参赛身份。

登录 → 上传单文件 bot.js → i5 运行检查 → 第一份自动成为主力 → 自动参加排位；也可手动「加赛 12 场」。
后续版本主动切换主力；同一账号仅一辆同时参赛，历史与已封存对局保留。模型/思考强度是作者声明。
三张标准图，各四席同种子轮换；每组随机新种子。按保守排位分、胜率、平均击杀查看；每场回放可下载，摘要导出限当前主力与最近60场。

公开测试按滚动24小时限制6次上传、24场主动排赛；全局等待/运行/暂停任务不超过96。
自动排赛只在节点在线、现有队列空闲时补一组12场；不积压多个自动批次。优先有效场次少的当前主力，同场作者不同，随机对手/种子且三图四席轮换。新主力自然优先补赛；已封存旧版本仍正常完成。自动比赛不消耗用户手动额度，个人暂停/取消仅作用于手动队列。失败后5分钟退避，离线/容量不足暂停补新组。

源码最大256KiB；每账号最多2份待检查、20件作品。全季最多2000版本/10000场，数据库超过512MiB或磁盘余量不足512MiB暂停新任务，已有队列继续。
这不是抗多账号串通的正式赛事；没有宣称模型身份认证或AI源码审核。

## 计算与身份边界

`coordinator.mjs` 只做私有存储、身份桥接、排队、回放和结算，禁止导入executor/执行代码。
`public-api.mjs` 固定访问loopback主站 `/api/auth/me`；只转发唯一的 `__Host-sp_session` Cookie，忽略客户端自报用户ID。
写入同时核对精确Origin、会话绑定HMAC CSRF、账号归属、日额度与全局容量。没有登录/重新登录即不通过。
API通过 `api.arenaofbias.icu/api/tank-ladder/`，CORS仅放行game域名。节点 `/claim`、`/complete` 继续独立密钥。
作品源代码不在静态目录、状态API、导出或回放中；只发给已认证i5计算节点。主站账号数据库没有迁移或第二写入者。

实际计算使用已连接i5上的Debian VM、低权限进程、QuickJS/WASM与系统出站限制。1场并发。
运行器冻结指纹 `95e96cab0957bde80b8aec11d917e9792ab42c353512ecd4330791eb1f8da412`，此版本没有要求重装实体节点。
公开数据目录 `/var/lib/aob-tank-public-s01`，旧连接试赛 `/var/lib/aob-tank-calibration` 保留，成绩不迁入。
指纹内的历史常量 `local-s01` 保持冻结；对外赛季标识与数据归属由独立 `environment.json` 的 `s01-i5-linux-quickjs` 明确区分。

## 构建与运维

`npx vite build --config vite.ladder.config.ts` 只构建坦克与排位入口，不带其他开发中的玩法。
发布须一起包含共享构建资产、`public/tank-starter.js`、`public/tank-bot-guide.txt`，已有其他页面不覆盖。
源码/运行器哈希依赖原始字节，`.gitattributes` 保留冻结文件，不自动换行。
`server.mjs`仍只供本地预览，不可直接开放公网。
公开协调器需要三个独立systemd凭据：node-token、operator-token、web-secret；均不入库。
systemd样例与nginx精确前缀见 `tools/tank-ladder/deploy/`。开启公开环境时禁止私有连接试赛运营入口。
`TANK_AUTO_MATCHES=1` 仅决定首次启用；之后开关保存在SQLite。运营者可在loopback使用operator-token调用 `POST /ops/automatic`，`{"action":"pause"}` 停止补新组、让现有对局正常结束，`resume`恢复。节点密钥和网页账号均无此权限；该路径不通过公网nginx。

回退：先停止接受新写入、等待运行对局结束，再停协调器、备份其SQLite/WAL/环境文件，恢复current链接与对应环境配置。
仅撤回公开页面时也须关闭新API路径；不覆盖网站数据库或删除已投稿作品。节点离线不需要重装，租约到期自动回队。
备份须在服务停止后复制完整数据目录，或使用SQLite backup API；摘要导出不是完整备份。
