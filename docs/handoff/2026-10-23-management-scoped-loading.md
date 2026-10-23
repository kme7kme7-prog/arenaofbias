# 2026-10-23 · 审核、成员和作品按需加载 · wsnxxxs

- 负责人：wsnxxxs / 269096463+wsnxxxs@users.noreply.github.com；主代理与三个继承相同模型的子代理分工及交叉复核
- 起点：35dd0ce；本归档于获授权推送前写入，实际提交号由私有push-receipts记录。

## 目标与决定

用户要求先将上一轮四仓全部提交推送，再继续优化管理员审核、成员和作品加载。先完成四仓推送，再按当前页面/交互读取，保留原权限、审核规则、作品和实时下架门禁；后端先发布、静态增量切换，保留完整回滚。

## 改动

3D目录只读取固定11道题；Tier首屏只读当前8件作品与当前题，首次点击换题才读取147 ID可用索引；分享只读当前题与两件作品。新reader按50 ID分批、重叠请求共享在途，完成即清除，揭晓和分享重新确认公开状态。索引失败保留已有榜单并允许再次点击重试；不把定向读取写进全量stores。

## 验证

typecheck、两套相关lint、build、加载恢复与分享6项、新reader专项通过；真实dist+隔离API浏览器11项/页面错误0，390px无横溢。1169作品/1019题的隔离数据含1000条长文本，API JSON：objects12,748,614→28,250B，Tier→2,075B，分享→671B。该数字不是生产流量，3D iframe使用准备状态桩，不能冒称原作渲染性能。最终18文件387,653B，依赖闭包、inline CSP和160个保留资产校验通过。

## 发布

只发布index/playground/objects/tier四入口与14个新hash JS，保留旧hash、其他入口和live-only内容。回滚 /www/wwwroot/show1-dist.before-pages-20261023。后端selectors先安装；本轮无generals/ladder/capture或datapack发布。

## 明确未做与限制

未修改作品、玩法规则、坦克冻结引擎/运行指纹或历史成绩；没有重跑不受本轮影响的坦克套件。沿用2026-10-23按需加载决策，未添加未来自动发布授权。

## 遗留物

源码在原检出，证据/测试脚本/组合候选/只读测量/发布清单/receipts位于父工作区.local/performance-round2-20261023（不提交）。首次SSH中断后用户修复，重新核对原基线一致再发布；未将中断时的候选误称已上线。正式数据包沿用原pin，未激活本次data CI生成的新包。生产备份保留供回滚，不覆盖实时业务库。

## 2026-10-23 补充与更正：真实安全外壳兼容

公网验收发现Tier没有卡片；full与scoped API的8件作品完全一致，根因是旧URL校验只识别独立子域，拒绝现有固定域名`/v/`沙盒外壳。新增`lib/public-work-url.mjs`供Tier和3D共用：仅HTTPS、无凭据/非默认端口、精确固定主机及`/v/[wc]32hex/`；保留旧`[wpc]`独立子域。拒绝直接`/c/`原文、私密固定路径、伪域名和其他外域，不改服务端配置、安全壳或iframe权限。

修复后类型、两套相关lint、构建、URL正反例均通过；混合两种地址的真实shell源码/CSP浏览器专项11项、异常0，验证双向消息转发与inner不含allow-same-origin。额外以本地候选静态覆盖game响应，配合真实公开API与作品网络验证3页：Tier八卡、首屏零iframe、Astra取景ready/复位/关闭释放，390px无横溢；Objects机械键盘随机两件上传作品ready，仅2个outer和2个opaque inner。脚本异常、请求失败和写请求均0。该额外验证不是19题所有原作回归；旧基线必然拒绝新地址，因此原纯旧地址对照数据保留，新混合专项单独记录，不伪造旧版可用。

本轮最终清单更正为19文件388,037B（四入口+15个新hash JS），保留依赖160个及所有旧资源，已增量安装并逐入口公网SHA匹配；兼容修复前快照`/www/wwwroot/show1-dist.before-content-path-20261023`，整轮回滚仍用`show1-dist.before-pages-20261023`。证据在本仓`.local/gateway-ui/`、`.local/gateway-live-overlay/`和父工作区`game-followup-install.json`。发布后无静态覆盖验收结果另见父工作区最终报告与receipts。

发布后公网浏览器无响应覆盖6场通过：Gallery个人中心访客、成员审核访客、Tier桌面/390px、双作品分享生成1080宽PNG、3D实际双作品。页面异常0、横溢0。Tier首屏8卡且零iframe，仅8件作品JSON2145B与题1800B；分享仅2件JSON608B与题1800B；3D仅11题目录JSON194148B与题29541B，实际2个outer+2个无allow-same-origin的inner并进入exploring。数字为本次解码响应正文，不是压缩传输或全站时延基准。访客未访问审核/成员数据接口，私有操作完整流程仍以隔离测试为准。证据为父工作区`public-browser.json`及截图。
