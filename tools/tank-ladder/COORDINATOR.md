# 公开投稿接入补充（2026-10-19）

S01 以独立 `aob-tank-public-s01` StateDirectory 运行，使用主站账号，nginx仅新增API域名 `/api/tank-ladder/`。原节点URL、密钥与冻结计算指纹不变，私有校准目录保留。配置见 `deploy/public-season.conf` / `tank-public.conf`。启用公开模式时 `/ops/trial` 拒绝排校准任务。下文为先前私有试赛接入记录。

# i5 节点接入与私有试赛

`coordinator.mjs` 是只调度的生产入口，不导入或调用 executor、QuickJS 或比赛引擎。必须显式提供节点密钥、独立运营密钥、预期运行指纹和全新试赛数据目录；任何一项缺失都退出，不回退到服务器计算。`server.mjs` 仍仅为本地原型，不能拿来作线上启动入口。

## 本轮范围

- 沿用现有 `https://game.arenaofbias.icu` 及证书，只添加精确 `/claim`、`/complete`、`/tank-node/status` 路由，均要求节点 Bearer 密钥，拒绝带浏览器 Origin 的请求。
- 旧版 i5 客户端采用根路径，继续保持原有源码指纹，用户不必重新安装虚拟机。`config.mjs` 所列指纹文件未改；新增调度器由独立发布清单记录哈希。
- 公网不代理试玩身份、上传、调度管理、数据库或 Bot 源码文件。节点接口只向持有运营密钥的计算节点按租约提供必要源码。主站用户登录与投稿接入仍是下一阶段。
- 所有后端监听 127.0.0.1。独立 systemd DynamicUser 服务，只写自己的 StateDirectory，不读取网站目录；不创建人工登录账户。节点离线时任务留在队列，失效租约回收，旧结果不能结算新租约。

## 一次性试赛

运营端在本机 `POST /ops/trial`（独立 operator-token，nginx 不转发）准备一次验证。先排一份无害 `stay` Bot 的沙箱检查，成功回传后才生成三张图 × 四席轮换的12场已有坦克库对局。准备调用、服务重启都复用同一批任务，不无限追加；中性检查 Bot 不进入匹配池。随机种子和对手名单由数据库封存。

结果仅属于 `i5-9400-debian13-node22.23.1-quickjs032-calibration-v1` 的私有数据目录；不写正式榜、不迁入旧 Windows 成绩。连接包会检查 guest 防火墙、Linux、Node22.23.1、2vCPU和运行指纹。旧 runner 协议本身不做硬件/OS远程证明，服务端环境标识是运营方配置；不能把标识当成远程测量。

## 用户操作

将单独交付的连接 ZIP 解压到已有 VM 的 i5，管理员运行 `Connect.cmd`。脚本用本机已有 SSH 私钥和固定 host key 检查当前 VM，通过 stdin 配置节点令牌，再等待 HTTPS 接口收到新请求和沙箱成功结果。令牌不回显，不写入命令行；包含令牌的 `connection.json` 不可转发。首次完成会显示 CONNECTED 和12场的进行状态，不能据此宣称12场已完成。

连接包不下载软件、重装 VM、关闭安全校验或重启宿主。后续使用原来的03-Start和04-Stop；计算不需要保持安装终端打开，但 Windows 和虚拟机需运行、联网且不休眠。

## 验收及回退

开发机跑 `node --test tools/tank-ladder/test/coordinator.test.mjs` 和原有远程节点测试。不要在网站服务器运行涉及 executor 的测试。生产只验证启动、监听范围、鉴权、版本不符拒绝、无节点时队列不变、原网站文件哈希不变。

上线仅新增独立 `/opt/aob-tank-coordinator/` 发布目录、`/etc/aob-tank-coordinator/` 凭据、systemd unit和game站点的一个nginx include。部署清单/证据在本轮 `.local/tank-coordinator-*/`。回退停用该独立服务并移走该单个include，nginx -t通过后reload；保留私有数据和凭据，不回滚主站数据库。不得整仓覆盖已有后端或静态站。

上游依据：[systemd服务隔离](https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html)、[nginx代理及请求缓冲](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。
