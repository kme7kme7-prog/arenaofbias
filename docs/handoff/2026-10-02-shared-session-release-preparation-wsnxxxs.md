# 2026-10-02 · 共用会话发布准备 · wsnxxxs

- 负责人：wsnxxxs ｜ 执行 AI：Codex

## 本轮目标

按用户授权整理四仓既有改动、提交、推送、部署并联调。本记录为源码整理阶段，实际发布结果另记。

## 改动

整理共用 API 主机与 include、公开 .env.production、独立 API lint、旧 Node 验证器导入适配、placeholder 固定随机夹具、formal 连接清理和过时版本断言修正、build:check 与浏览器检查说明。保留已提交登录验证，并待合入上游 main 的 12a626a Hero 入场改动，不覆盖他人改动。

## 决策

Cookie 仍只属于 API 主机；生产 build 与本地 build:check 分开。保留 game /api 反代，移除须上线互通、用户指定观察期及另外明确授权。不顺手修复三项已确认过时的浏览器检查。

## 验证

本轮 lint、typecheck、placeholder 10 项、formal 6 项通过。前轮 placeholder 35/35、formal 3/3 及六项浏览器回归通过；portal-entry、formal-ui、admin-access 的已知旧夹具 / 断言失败保持。上游合入、新固定构建、联调与生产验收待后续阶段，不宣称已经完成。

## 明确没做

不改旧 server/、admin.html、Cookie 或业务数据，不新增依赖，不部署未推送的工作树，不强推覆盖他人历史。

## 遗留物

全部忽略的证据和本地服务保留；本轮不会无差别清理他轮临时文件。原 EBUSY 基线目录的删除此前被审批拒绝，未绕过。

## 下一步建议

合入并验证上游 Hero 改动，构建已推送固定源码，配套登录保护发布后进行两站登录、返回页面更新及正常浏览验收。
