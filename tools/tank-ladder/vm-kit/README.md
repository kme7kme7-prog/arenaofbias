# 坦克计算虚拟机 · i5 一键安装包

此包只在你运行它的 Windows 实体机上创建计算环境，不安装网站服务器、不开放玩家投稿、不替你配置线上服务器。

## 你要做什么

1. 将压缩包完整解压到 i5 电脑（不能在压缩包预览窗口里直接运行）。
2. 右键 **01-Install.cmd → 以管理员身份运行**。
3. 等待下载、安装。出现 **READY** 才表示虚拟机启动、沙箱自检和虚拟机防火墙检查成功。
4. 把最后输出发给我。此时没有节点密钥，不会领取或计算比赛。

不要同时运行以前那个 Windows 版计算器。整个安装通常涉及数百 MB 到约 1 GB 的官方软件下载，以及 Linux 软件包下载；速度取决于网络。宿主盘需要至少32GB空闲空间。请保持联网、接电且不睡眠。

如果提示重启 Windows，手动重启后再运行同一个 01-Install.cmd 即可。安装器不自动重启电脑，不自动更改 BIOS、Hyper-V、Defender、宿主防火墙或系统全局执行策略。启动器的 ExecutionPolicy Bypass 仅作用于该 PowerShell 进程，用来运行这份可阅读的脚本。

## 安装内容

- Oracle VirtualBox 7.2.20 基础程序（若未安装）；必要时安装 Microsoft VC++ x64 运行库。不安装 Extension Pack、Python 绑定、桥接网卡或 USB 组件。不自动升级其他已有 VirtualBox 版本。
- Debian 13.7 amd64 最小系统：2个虚拟CPU、4GB内存、24GB动态虚拟磁盘。安装器只将新建 VDI 文件挂入虚拟机，不挂宿主物理盘。
- Node.js 22.23.1、锁定的计算器依赖及 QuickJS/WASM。程序根目录为 /opt/tank-runner。
- 默认1场并发，systemd服务上限2GB内存、180% CPU、128任务，异常重启。未配置连接时保持等待。
- 宿主工作目录：C:\ProgramData\AOBTankVM，只授予本机Administrators和SYSTEM访问；其中包含本机管理密钥，请勿整体发送或分享。

软件来自官网。VirtualBox、Debian ISO、Node压缩包校验固定SHA-256；Windows安装程序另外检查有效发布者签名。Microsoft运行库从官方地址下载并检查签名。下载或验证失败就停止，不跳过证书或签名检查。

## 以后使用

所有按钮在同一台 i5 上，以管理员身份运行：

- **02-Status.cmd**：查看准备状态和最近计算日志。
- **03-Start.cmd**：启动虚拟机；若已经配置节点，Linux服务自动开始领任务。
- **04-Stop.cmd**：发送正常关机请求，不强行断电。未完成比赛由调度端租约到期回收。
- **05-Connect.cmd**：服务器准备好之后才用。填写专用HTTPS计算域名与64位节点密钥，密钥输入不回显。它不是网站登录密码，也不是AI API密钥。该按钮不生成实际服务器地址或账户。
- **00-Check-package.cmd**：只检查安装包完整性，不安装任何软件。

安装完成后不需要每天操作Linux命令行，也不需要在魔改Windows上创建新用户。暂不创建宿主开机计划任务；宿主重启后使用03-Start.cmd。虚拟机未安装图形桌面，如需诊断可打开VirtualBox里的AOB-Tank-i5控制台。

## 隔离边界

计算使用Linux无登录、无sudo权限的 tankrunner 账户。tankmaint 是仅供你管理虚拟机的维护账户，允许公钥SSH和sudo；它的私钥只放在宿主受保护目录，不传给计算服务。SSH宿主密钥在安装时生成并固定校验，不使用 StrictHostKeyChecking=no。

网络为NAT。管理SSH只映射到宿主127.0.0.1:22222，不开放局域网端口。无共享文件夹、双向剪贴板、拖放、USB、VRDE或Guest Additions。安装期间只使用只读虚拟安装DVD。

虚拟机防火墙阻止主动连接宿主/局域网/常用私网和链路本地地址，保留NAT DNS、DHCP和已建立连接；公网出站并非域名白名单。运行服务有只读系统目录、隐藏home、移除能力、禁止提权和cgroup资源限制。QuickJS限制继续保留。

这降低风险，不保证抵抗未知的虚拟机或内核逃逸。恶意代码若突破解释器与服务隔离仍可能滥用公网或节点凭据。i5不应存放网站管理密钥、数据库密码和AI供应商密钥。不要在虚拟机放个人资料。

## 失败如何处理

- 提示VT-x未开：需要你进BIOS/UEFI开启Intel虚拟化。脚本无法替你完成。
- VirtualBox驱动/安装器失败：可能是魔改Windows删了必要服务；不会自动关闭安全功能来强行安装。把屏幕错误发来。
- 端口22222被占用、已有同名虚拟机或目录所有权标记不符：停止，不覆盖别人环境。
- 下载失败：联网后重新运行。下载完整且哈希正确的文件会复用；损坏文件会明确报错，不静默采用。
- Linux安装等待超时：不能当作安装成功。打开VirtualBox观察安装屏幕；诊断日志在虚拟机 /var/log/tank-install.log。重新运行会等待同一台虚拟机，不自动清盘重装。
- 配置后的“服务已启动”不代表服务器已接受节点。需通过真实领任务和返回结果另行验收。

连接等待超时且服务器没有成功领取记录时，可使用独立 `Diagnose.cmd` / `diagnose-node.ps1` 诊断包，在同一台 i5 上以管理员身份执行。它复用已有 VM 归属标记及固定 SSH host key，只读取服务状态、最近35条日志、DNS配置，并以 tankrunner 用户发送不带凭据的 HTTPS 请求；403 表示该网络探测已抵达接口，AAAA 的 ENODATA 单独出现不表示 IPv4 失败。它不重启服务、不调整防火墙、不读取节点令牌或连接包。结果写入诊断包旁的 `tank-node-diagnostic.txt`，日志中的64位十六进制内容自动遮蔽。独立网络探测不完全复现 systemd 沙箱，需结合服务日志判断。

### 旧包 DNS 指向家庭路由器、服务持续 fetch failed

VirtualBox 默认将宿主 DNS 地址通过 DHCP 提供给 guest；若地址是 `192.168.1.1`，会被本包的私网隔离规则拒绝。新版安装配置显式启用 NAT DNS 代理与宿主解析器，使 guest 使用已允许的 `10.0.2.3:53`，不放开家庭路由器或整个局域网。

现有 i5 使用独立 `Tank-i5-DNS-Fix.zip`，管理员运行 `Repair-DNS.cmd`。它验证 VM 归属/SSH身份/冻结运行指纹，保留配置备份，为 enp0s3 固定 DNS，正常关闭 VM，开启 NAT DNS 选项，再启动原 VM；不重启 Windows、不重装或清盘、不更换节点密钥、不改防火墙规则。发现计算子进程则拒绝重启；DNS已正确时只验收连接。完成后从 guest 访问带认证的状态接口，仅在节点领任务和沙箱回传均确认后显示 CONNECTED，12场试赛另外验收。

修复日志在包旁 `tank-dns-repair.txt`；原配置备份位于宿主 `C:\ProgramData\AOBTankVM\dns-repair-before.txt` 和 guest `/root/aob-dns-repair-before/`。旧诊断包的 `sudo -u tankrunner` 因维护账户仅可免密切换到root而报密码错误；新版通过 `sudo -n runuser -u tankrunner -- ...` 调用，不扩大sudo授权、不设置新密码。

DNS方案参考 [VirtualBox 7.2 官方说明](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/networkingdetails.html)；guest固定DNS语法见 [Debian dhcpcd.conf](https://manpages.debian.org/trixie/dhcpcd-base/dhcpcd.conf.5.en.html)。

### 旧包出现 Missing privilege separation directory: /run/sshd

这是安装阶段尚未启动 SSH 服务、检查配置前缺少运行目录导致的中断，已在新包修复。若旧包停在 Debian 安装器菜单，且 `/target/var/log/tank-install.log` 明确只有此错误，选择 **Execute a shell**，执行：

```sh
in-target install -d -o root -g root -m 0755 /run/sshd
```

命令没有报错后输入 `exit`，回到菜单选择 **Finish the installation**，让安装器重新执行收尾步骤。不要手动重跑整个 bootstrap 后再选 Finish，否则旧脚本会重复解压。不要选择分区、重装或强制断电。若再次报错，读取日志最后20行定位新的错误。待虚拟机重启进入系统后，在 Windows 以管理员身份运行原来的 **01-Install.cmd** 完成就绪校验；重新运行不会重新分区。只有显示 READY 才表示沙箱和防火墙检查通过。

此方法修复现有安装，不需要下载新包。仅替换 Windows 目录里的脚本不会改变已生成的虚拟安装光盘。

## 测试范围与赛季

此安装包在开发侧做脚本语法、包哈希、配置约束和生成模板检查；尚未在你的魔改Windows完成真实虚拟机安装。只有实体机显示READY才算环境验收。不会把准备好的脚本描述为已经远程安装完成。

Linux虚拟机与此前Windows实机不是同一硬件/OS环境。现有运行指纹标识源代码，不包含完整硬件配置；正式接入时需建立Linux计算环境的独立试赛数据、补齐环境标识和预算校准，不能直接混入旧成绩。服务器端HTTPS节点入口及主站账号对接尚待实施。

上游说明：
- https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html
- https://docs.oracle.com/en/virtualization/virtualbox/7.0/user/vboxmanage.html
- https://www.debian.org/releases/stable/debian-installer/
- https://nodejs.org/dist/v22.23.1/SHASUMS256.txt
