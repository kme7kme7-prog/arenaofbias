# 2026-10-05 · 补齐游戏跨平台锁文件 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：GPT-6.1 Sol / Codex Desktop。
- 范围：1a9948a 后的发布前锁文件修复轮；仅 package-lock 与交接归档。

## 目标与改动

协调发布在 Linux Node22.23.2 执行干净 npm ci 时发现 @emnapi/core 与 @emnapi/runtime 1.11.3 缺失。按用户授权新增这两个 dev/optional 根条目，使用官方 npm tarball/integrity；core 引用已存在的 wasi-threads1.2.3 与 tslib。未改 package.json、应用源码、已有依赖版本或现有包记录。

## 验证

逐项比对上一提交锁文件：仅新增两条，每个原有 package 记录保持一致。协调代理使用本最小补丁在 Linux Node22.23.2 干净 npm ci 成功安装227包、lint 0错0警告；typecheck/build:check由协调代理收取结果。本机隔离 npm ci 通过锁一致性阶段，既有 npmmirror 下载耗时；不把尚未收取的本机安装结果记成成功。

固定新提交以相同 LF 归一化、VITE_API_BASE_URL=https://api.arenaofbias.icu 重建，并核对 1a9948a 生产包的827文件集合与SHA256；最终结果另交协调代理。本轮不重复业务浏览器全组，业务源码和依赖版本没有变化。

## 决策与边界

修复干净安装门禁，不接受历史连接node_modules作为Linux安装替代；没有新产品决定。生产切换由协调代理执行，本代理未部署、改生产数据或作品源。

## 遗留物

忽略的隔离安装/构建目录保留，其他人文件保留。使用负责人 noreply 身份单条英文提交，正常推送两远端。
