[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunnerZip,[Parameter(Mandatory)][securestring]$AccountPassword)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ((Get-CimInstance Win32_ComputerSystem).Model -ne 'Virtual Machine') { throw '此脚本只允许在 Hyper-V 虚拟机内运行。' }
$root = 'C:\AOBTank'
if (Test-Path -LiteralPath $root) { throw 'C:\AOBTank 已存在，停止以避免覆盖。若之前安装中断，请发回错误，不要反复重装。' }
if (Get-LocalUser -Name TankRunner -ErrorAction SilentlyContinue) { throw 'TankRunner 用户已存在；不更改已有账户。' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Path $root | Out-Null

# Official Node downloads only; preserve the exact resolved runtime in receipt.json.
$releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
$release = @($releases | Where-Object { $_.version -match '^v22\.' -and $_.lts -and ([version]$_.version.Substring(1)) -ge [version]'22.13.0' } | Sort-Object { [version]$_.version.Substring(1) } -Descending)[0]
if (-not $release) { throw '未找到受支持的 Node 22 LTS 版本。' }
$file = "node-$($release.version)-win-x64.zip"
$base = "https://nodejs.org/dist/$($release.version)"
$sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
$pattern = '(?m)^([a-fA-F0-9]{64})\s+' + [regex]::Escape($file) + '\s*$'
$match = [regex]::Match($sums, $pattern)
if (-not $match.Success) { throw '官方清单未包含目标文件。' }
$download = Join-Path $root $file
Invoke-WebRequest -UseBasicParsing -Uri "$base/$file" -OutFile $download
if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'Node 下载哈希校验失败，不执行。' }
Expand-Archive -LiteralPath $download -DestinationPath (Join-Path $root 'runtime')
$runtime = Join-Path $root "runtime\node-$($release.version)-win-x64"
Expand-Archive -LiteralPath $RunnerZip -DestinationPath (Join-Path $root 'runner')
$runner = Join-Path $root 'runner'
if (-not (Test-Path -LiteralPath "$runner\tools\tank-ladder\runner.mjs")) { throw '计算包结构不正确。' }
$env:Path = "$runtime;$env:Path"
Push-Location "$runner\tools\tank-ladder"
try {
    & "$runtime\npm.cmd" ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
    & "$runtime\node.exe" --check runner.mjs
    if ($LASTEXITCODE -ne 0) { throw '运行器语法检查失败。' }
} finally { Pop-Location }

$user = New-LocalUser -Name TankRunner -Password $AccountPassword -Description 'Tank compute worker, standard user'
$usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
Add-LocalGroupMember -Group $usersGroup -Member $user
$config = Join-Path $root 'private'
New-Item -ItemType Directory -Path $config | Out-Null
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($entry in @(@('S-1-5-18','FullControl'), @('S-1-5-32-544','FullControl'), @($user.SID.Value,'Modify'))) {
    $sid = New-Object Security.Principal.SecurityIdentifier($entry[0])
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,$entry[1],'ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $config -AclObject $acl
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-Compute.ps1') -Destination $root
$launch = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AOBTank\Start-Compute.ps1"
pause
'@
Set-Content -LiteralPath "$root\start-compute.cmd" -Value $launch -Encoding ASCII
[ordered]@{ nodeVersion = $release.version; runtime = $runtime; runner = $runner; slots = 1; installedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content "$root\receipt.json" -Encoding UTF8
Write-Host '安装完成：标准用户 TankRunner，计算目录 C:\AOBTank，默认1场并发。'
Write-Host '尚未设置线上地址与节点密钥，也没有启动比赛。不要用管理员运行计算。'
