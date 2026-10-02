# 2026-10-02 · 四仓整理、联调与部署 · wsnxxxs

- 负责人：wsnxxxs；执行 AI：Codex，三名用户指定 GPT-6.1 Sol / medium 子代理分别负责 Gallery、后台与数据仓。范围为四个独立仓库的既有成果整理和正式 VPS 发布。

## 本轮目标与改动

按本轮用户授权提交现有完成改动、读取远端、合并完成分支、推送并部署 114.66.27.88。上游竞技场两条已完成的 Hero/玩法菜单提交快进至 9b7357aaa4fbc173c77c55e11199c36d437f9a44，保留原作者 Atmeplz，同步 origin 与 fork 的 main。Gallery 原有9条、后端8条、数据2条本地提交连同本轮收尾均常规推送。可见其他分支已是 main 祖先，四仓无开放 PR，未强推或删除分支/工作树。

Gallery 初次源码收口 8a7bfe4，隔离浏览器联调发现未公开作者作品仍跳公开404页面，必要修复后最终 ef7b0a5bb240a518033a1ce78bb29a36d5205cdc。后台作者进度/名额、管理员批量审核及题目编辑收口2ceec02，再提交固定数据 pin 至83e43fe072a0280d86c76379d9964bd4a32eb4bd。数据源0291105a33d721d58b2345703817bc92c2ed5de4，固定不可变包53ab3e7caae664a520a231ef4fb715c493f1baa0，CI36960742936成功；20题/182件，领域与生成声明、模型登记同步。

## 发布与验证

现场后端343ed64与163个tracked文件按LF归一化一致，无未知 runtime 文件；数据库v27，Node22.23.2，正式service root配置与环境保留。最终功能2ceec02的LF源在生产Node22运行check82/0、test230/230；pin/文档后继83e43fe无功能代码变更。Windows同样230/230。

数据和静态产物从已推送Git提交导出LF规范字节。15个内容寻址块以8条SFTP通道传输15696896字节数据差异包，逐块与整包SHA256通过；6个重定位文件复用旧包相同哈希，Gallery77个文件复用新包规范字节。数据2369文件（含安装来源标记）、Gallery2419文件精确集合与完整SHA256通过后才启用。

停服务后SQLite一致性备份与旧tracked源码备份保存于/root/aob-release-20261002/backup/，再安装源码、切不可变current、启服务执行v28–v31。Gallery完整暂存目录校验后切换，旧目录/www/wwwroot/gallery.prev-20261002保留。数据库v31 integrity_check=ok，前后业务记录数相同：users31、works288、votes328、questions7、comments16、reactions60、matches368。server/tunnel均active；Nginx语法检查通过且五个vhost哈希未变。

主站820目标文件与现网完全同字节，两个额外旧哈希assets保留；总入口未变，因此没有重复切换这两站。公开三站、API和Gallery目录200，缓存头正确；serverVersion83e43fe、frontendCommit ef7b0a5、共同包53ab3e7、catalogDigest95f4979445a2528dccd866a1f2e1ca72d2b431943d295fea53ceb0e8ddbdec4a逐项吻合。

本仓typecheck/lint/check:game/check:theme/build/portal build通过。Gallery check45/0、test18/18、精确包build/intake通过，数据check30/0、test16/16、CIbuild/intake通过；intake保留8条既有提示。真实隔离跨仓smoke覆盖注册邮件测试替身、上传隐私、批量核验后公开封面、馆藏资源与盲评投票，不使用生产数据库。Gallery隔离浏览器复核作者筛选、批量核验与作品/题目编辑、私有链接，console0error，未保存决定。公网上1440桌面首页、390题库无横向溢出，领域与45模型索引可见，console0error，截图目检通过；竞技场390首页同样通过。

## 决策与边界

本轮授权覆盖初始已有未提交成果和部署，未将README/想法清单扩为功能要求。没有新产品决策需追加DECISIONS。直接IP访问会被机房网关重定向友情提示，正式域名正常；不修改网关/DNS以绕过。

## 明确没做

未生产注册、投稿、投票、删除记录、人工审核或运行arena-backfill，不清理上传、旧包或备份；未更改systemd环境/服务用户或启用root不支持的Chromium sandbox。没有逐件验证全部原作、真实SMTP/付费审核/截图服务或所有设备。数据仓在冻结后由仍在运行的「修复小模型与地面适配」聊天产生另批截图替代/营地裁切/喷泉地面改动，来自该聊天独立用户授权，保留未动，不混入本次已验证不可变包。

## 遗留物与后续

/root/aob-release-20261002保存目标/基线manifest、规范源码、块hash、发布工具、Node22日志、backup、bootstrap、verification；四仓忽略output保存Git导出和联调/公网页面证据。数据库跨版本回退须考虑新写入，不自动覆盖业务库。各仓私有配置、其他工作树与并行工作保留。本文件为功能版本之后的文档归档，不要求重新构建或再次部署。
