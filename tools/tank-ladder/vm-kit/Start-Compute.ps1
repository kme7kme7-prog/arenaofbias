$ErrorActionPreference = 'Stop'
try {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw '请在标准账户 TankRunner 下普通双击，不要以管理员身份运行。' }
    if ([Environment]::UserName -ne 'TankRunner') { throw '请使用 TankRunner 标准账户。' }
    $receipt = Get-Content 'C:\AOBTank\receipt.json' -Raw | ConvertFrom-Json
    $configFile = 'C:\AOBTank\private\connection.json'
    if (-not (Test-Path -LiteralPath $configFile)) { throw '等待服务器配发 connection.json 与 runner-token.txt，放入 C:\AOBTank\private 后再运行。' }
    $connection = Get-Content $configFile -Raw | ConvertFrom-Json
    $uri = [uri]$connection.url
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo) { throw '计算连接必须使用合法HTTPS地址。' }
    $env:TANK_RUNNER_URL = $uri.AbsoluteUri
    $env:TANK_RUNNER_TOKEN_FILE = 'C:\AOBTank\private\runner-token.txt'
    if (-not (Test-Path -LiteralPath $env:TANK_RUNNER_TOKEN_FILE)) { throw '缺少节点密钥文件。' }
    $env:TANK_RUNNER_SLOTS = '1'
    $env:Path = "$($receipt.runtime);$env:Path"
    Set-Location "$($receipt.runner)\tools\tank-ladder"
    & "$($receipt.runtime)\node.exe" runner.mjs
    if ($LASTEXITCODE -ne 0) { throw '计算器退出，请把错误信息发回。' }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
