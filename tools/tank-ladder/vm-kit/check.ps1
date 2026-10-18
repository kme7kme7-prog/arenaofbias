param([Parameter(Mandatory=$true)][string]$KitDirectory)
$ErrorActionPreference = 'Stop'
$errorsFound = $null; $tokensFound = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'install.ps1'),[ref]$tokensFound,[ref]$errorsFound)
if ($errorsFound.Count) { throw ($errorsFound | Out-String) }
# Load only two pure process helpers; do not invoke the installer's main block.
foreach ($name in @('Native-Quote','Native')) {
    $definition = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}
$expected = @('', 'with space', 'a"quote', 'C:\path with space\', 'ampersand&dollar$')
$actual = (Native (Get-Command node.exe).Source (@('-e','console.log(JSON.stringify(process.argv.slice(1)))') + $expected)).Out | ConvertFrom-Json
if (($actual | ConvertTo-Json -Compress) -ne ($expected | ConvertTo-Json -Compress)) { throw 'Native command argument quoting failed.' }
$payload = '{"test":"stdin only; not a command line argument"}'
$echo = Native (Get-Command node.exe).Source @('-e','process.stdin.pipe(process.stdout)') -InputText $payload
if ($echo.Out -ne $payload) { throw 'Private stdin forwarding failed.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $KitDirectory 'install.ps1') -Action Validate
if ($LASTEXITCODE -ne 0) { throw 'Kit validation failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $KitDirectory 'runner.zip'))
try {
    if ($zip.Entries | Where-Object { $_.FullName.Contains('\') -or $_.FullName -match '(^/|(^|/)\.\.(/|$)|node_modules|runner-token|\.sqlite|\.ssh)' }) { throw 'Unsafe or nonportable runner ZIP entry.' }
    foreach ($required in @('package.json','tools/tank-ladder/runner.mjs','app/tanks/engine/core/brawl.js')) {
        if (!$zip.GetEntry($required)) { throw "Missing $required" }
    }
} finally { $zip.Dispose() }
$install = Get-Content -Raw (Join-Path $KitDirectory 'install.ps1')
$guest = Get-Content -Raw (Join-Path $KitDirectory 'guest-bootstrap.sh')
foreach ($required in @('StrictHostKeyChecking=yes','127.0.0.1,$Port,,22','--natdnsproxy1','--natdnshostresolver1','--no-install-additions','Check-Signer','Check-Hash','No running service was stopped')) {
    if (!$install.Contains($required)) { throw "Missing install invariant: $required" }
}
foreach ($required in @('User=tankrunner','NoNewPrivileges=true','ProtectSystem=strict','MemoryMax=2G','CPUQuota=180%','PrivateDevices=true','ConditionPathExists=','chmod -R a+rX','ip daddr {','LoadCredential=token:')) {
    if (!$guest.Contains($required)) { throw "Missing guest invariant: $required" }
}
if ($install -match 'StrictHostKeyChecking=no|Set-ExecutionPolicy|Restart-Computer|unregistervm|--delete|controlvm.+poweroff') { throw 'Unexpected destructive operation or persistent security bypass.' }
Write-Host 'PASS: Windows PowerShell parser, native quoting, private stdin, package hashes, Linux ZIP paths and isolation configuration invariants.'
