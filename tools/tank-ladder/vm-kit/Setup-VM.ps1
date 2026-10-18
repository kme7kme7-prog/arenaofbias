[CmdletBinding()]
param([ValidateSet('Create','Guest','Check')][string]$Mode = 'Create')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$vmName = 'AOB-TankRunner'
$marker = 'AOB-TankRunner-VM-kit-v1'
$storage = Join-Path $env:PUBLIC 'Documents\AOB-TankRunner-VM'

try {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw '请右键启动 CMD 文件，选择“以管理员身份运行”。'
    }
    if (-not [Environment]::Is64BitProcess) { throw '请使用64位 Windows PowerShell。' }
    $os = Get-CimInstance Win32_OperatingSystem
    $system = Get-CimInstance Win32_ComputerSystem
    $cpus = @(Get-CimInstance Win32_Processor)
    $feature = $null
    try { $feature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All } catch {}
    $report = [ordered]@{
        windows = $os.Caption; build = $os.BuildNumber
        cpu = @($cpus | ForEach-Object { $_.Name })
        memoryGB = [Math]::Round($system.TotalPhysicalMemory / 1GB, 1)
        hypervisorPresent = $system.HypervisorPresent
        virtualizationFirmware = @($cpus | ForEach-Object { $_.VirtualizationFirmwareEnabled })
        hyperVFeature = $(if ($feature) { [string]$feature.State } else { 'Unavailable' })
        freeSystemGB = [Math]::Round((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free / 1GB, 1)
    }
    $report | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'host-check.json') -Encoding UTF8
    $report | Format-List | Out-Host
    if ($Mode -eq 'Check') { return }
    if (-not $feature) { throw '系统没有 Hyper-V 完整组件。可能是家庭版或魔改删减；未尝试强装。请把 host-check.json 发回，改用其他虚拟机方案。' }
    if (-not $system.HypervisorPresent -and @($cpus | Where-Object { -not $_.VirtualizationFirmwareEnabled -or -not $_.SecondLevelAddressTranslationExtensions }).Count) {
        throw '固件虚拟化未开启或处理器缺少必需支持。请先在 BIOS 开启 Intel VT-x，不能由此脚本代替操作。'
    }
    if ($feature.State -ne 'Enabled') {
        if ($feature.State -eq 'EnablePending') { throw 'Hyper-V 等待重启；保存工作后手动重启，再运行本文件。' }
        Write-Host '将启用 Windows Hyper-V 功能。不自动重启、不修改物理网卡。' -ForegroundColor Yellow
        if ((Read-Host '输入 YES 继续') -cne 'YES') { return }
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart | Out-Host
        Write-Host '请保存工作并手动重启电脑，然后重新运行 01-create-vm.cmd。' -ForegroundColor Green
        return
    }
    Import-Module Hyper-V
    $vm = Get-VM -Name $vmName -ErrorAction SilentlyContinue
    if ($vm -and $vm.Notes -ne $marker) { throw '已有同名虚拟机，不属于这个安装包。为避免覆盖，已停止。' }
    if ($vm -and -not (Test-Path -LiteralPath (Join-Path $storage 'creation-complete.txt'))) { throw '上次虚拟机创建未完整完成，已保留现场。请发回错误，不自动启动残留配置。' }

    if ($Mode -eq 'Guest') {
        if (-not $vm -or $vm.State -ne 'Running') { throw '请先完成虚拟机里的 Windows 安装，并保持虚拟机运行。' }
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'runner.zip'))) { throw '缺少随包的 runner.zip，请重新完整解压。' }
        Write-Host '下面输入的是虚拟机内 Windows 管理员账号，不是宿主机账号。密码不保存。'
        $credential = Get-Credential -Message '虚拟机内管理员凭据'
        if (-not $credential) { return }
        $password = Read-Host '为虚拟机中的标准用户 TankRunner 设置密码（至少12位）' -AsSecureString
        if ($password.Length -lt 12) { throw '密码至少12位，请重新运行。' }
        $session = $null
        try {
            $session = New-PSSession -VMName $vmName -Credential $credential
            $stage = Invoke-Command -Session $session -ScriptBlock {
                $p = Join-Path $env:TEMP ('aob-install-' + [guid]::NewGuid().ToString('N'))
                New-Item -ItemType Directory -Path $p | Out-Null
                return $p
            }
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runner.zip') -Destination "$stage\runner.zip" -ToSession $session
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Setup-Guest.ps1') -Destination "$stage\Setup-Guest.ps1" -ToSession $session
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-Compute.ps1') -Destination "$stage\Start-Compute.ps1" -ToSession $session
            Invoke-Command -Session $session -ArgumentList $stage,$password -ScriptBlock {
                param($stagePath,$accountPassword)
                Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
                & "$stagePath\Setup-Guest.ps1" -RunnerZip "$stagePath\runner.zip" -AccountPassword $accountPassword
            }
        } finally { if ($session) { Remove-PSSession $session }; if ($password) { $password.Dispose() } }
        Write-Host '配置完成。请在虚拟机里登录 TankRunner。服务器 HTTPS 地址与密钥尚未配发，暂不开始计算。' -ForegroundColor Green
        return
    }

    if (-not $system.HypervisorPresent) { throw 'Hyper-V 已安装但未运行，请重启。若仍失败，请发回 host-check.json，不要关闭安全功能。' }
    if (-not $vm) {
        if ($system.TotalPhysicalMemory -lt 12GB) { throw '此配置需要宿主至少12GB内存。' }
        if ((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free -lt 90GB) { throw '系统盘需至少90GB可用空间（80GB动态虚拟盘及安装余量）。空间不足时先停止，不自动清理文件。' }
        if (Test-Path -LiteralPath $storage) { throw "目标目录已存在但未找到虚拟机，保留不覆盖：$storage" }
        $switch = @(Get-VMSwitch | Where-Object { $_.Name -in @('Default Switch','默认交换机') -and $_.SwitchType -eq 'Internal' })
        if ($switch.Count -ne 1) { throw '未找到唯一的 Hyper-V 默认 NAT 交换机。未修改现有网络，请发回诊断。' }
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = '选择从微软官网下载的 Windows 11 x64 ISO'
        $dialog.Filter = 'Windows 安装镜像 (*.iso)|*.iso'
        if ($dialog.ShowDialog() -ne 'OK') { return }
        $iso = $dialog.FileName
        if (-not (Test-Path -LiteralPath $iso -PathType Leaf)) { throw 'ISO 文件不存在。' }
        Write-Host "将创建 $vmName：2 vCPU、6GB内存、80GB动态虚拟盘，仅连接默认NAT。"
        Write-Host '只创建新虚拟磁盘，不格式化物理盘。现有宿主系统、用户和其他虚拟机不修改。'
        if ((Read-Host '输入 CREATE 创建') -cne 'CREATE') { return }
        New-Item -ItemType Directory -Path $storage | Out-Null
        $vm = New-VM -Name $vmName -Generation 2 -MemoryStartupBytes 6GB -Path $storage -NewVHDPath (Join-Path $storage 'system.vhdx') -NewVHDSizeBytes 80GB -SwitchName $switch[0].Name
        Set-VM -VM $vm -Notes $marker -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -CheckpointType Disabled
        Set-VMProcessor -VM $vm -Count 2 -ExposeVirtualizationExtensions $false
        Set-VMMemory -VM $vm -DynamicMemoryEnabled $false
        Set-VMFirmware -VM $vm -EnableSecureBoot On -SecureBootTemplate MicrosoftWindows
        Set-VMKeyProtector -VM $vm -NewLocalKeyProtector
        Enable-VMTPM -VM $vm
        Add-VMDvdDrive -VM $vm -Path $iso
        $dvd = Get-VMDvdDrive -VM $vm | Select-Object -First 1
        Set-VMFirmware -VM $vm -FirstBootDevice $dvd
        Set-Content -LiteralPath (Join-Path $storage 'creation-complete.txt') -Value $vm.Id -Encoding ASCII
        Write-Host '创建成功。配置若中途失败会保留虚拟机，不删除重建；请发送错误文本。'
    }
    if ($vm.State -eq 'Off') { Start-VM -VM $vm | Out-Null }
    if ($vm.State -notin @('Off','Running')) { throw '虚拟机状态不是关闭/运行；请在 Hyper-V 中检查，脚本不会强制关机。' }
    Write-Host '在控制台按任意键从DVD启动。Windows安装只选择虚拟机内的80GB磁盘。'
    Write-Host '使用基本会话，不启用增强会话的剪贴板或磁盘重定向。安装完成后运行 02-install-runner.cmd。'
    Start-Process -FilePath "$env:SystemRoot\System32\vmconnect.exe" -ArgumentList @('localhost', $vmName)
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $_ | Out-String | Set-Content (Join-Path $PSScriptRoot 'last-error.txt') -Encoding UTF8
    Write-Host '已停止。没有自动删除/覆盖旧文件。请发送 host-check.json 与 last-error.txt 的内容。'
    exit 1
}
