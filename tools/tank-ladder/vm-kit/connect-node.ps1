Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = Join-Path $env:ProgramData 'AOBTankVM'
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
function Quote-Arg([string]$value) {
    $escaped = [regex]::Replace($value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}
function Run([string]$exe, [string[]]$arguments, [string]$inputText) {
    $p = New-Object Diagnostics.Process
    $p.StartInfo.FileName = $exe
    $p.StartInfo.Arguments = ($arguments | ForEach-Object { Quote-Arg $_ }) -join ' '
    $p.StartInfo.UseShellExecute = $false
    $p.StartInfo.CreateNoWindow = $true
    $p.StartInfo.RedirectStandardInput = $true
    $p.StartInfo.RedirectStandardOutput = $true
    $p.StartInfo.RedirectStandardError = $true
    [void]$p.Start()
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    if ($inputText) { $p.StandardInput.Write($inputText) }
    $p.StandardInput.Close()
    if (!$p.WaitForExit(30000)) { $p.Kill(); $p.Dispose(); throw 'Command timed out. No VM or disk was reset.' }
    $code = $p.ExitCode
    $output = $outTask.GetAwaiter().GetResult()
    $errorText = $errTask.GetAwaiter().GetResult()
    $p.Dispose()
    if ($code -ne 0) { throw "Command failed ($code): $errorText" }
    return $output
}
function Guest([string]$command, [string]$inputText) {
    return Run 'ssh.exe' @('-p','22222','-i',(Join-Path $base 'admin-key'),'-o','BatchMode=yes','-o','ConnectTimeout=5',
        '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-o','StrictHostKeyChecking=yes',
        '-o',('UserKnownHostsFile=' + (Join-Path $base 'known_hosts')),'-o','IdentitiesOnly=yes','tankmaint@127.0.0.1',$command) $inputText
}
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Right-click Connect.cmd and choose Run as administrator.' }
    $connection = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'connection.json') | ConvertFrom-Json
    if ($connection.url -ne 'https://game.arenaofbias.icu' -or $connection.token -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid connection package.' }
    $state = Get-Content -Raw -LiteralPath (Join-Path $base 'state.json') | ConvertFrom-Json
    if (!$state.ready -or $state.runtimeHash -ne $connection.runtimeHash) { throw 'Run the original 01-Install.cmd to obtain READY first. This package does not reinstall the VM.' }
    $owner = Run $vbox @('getextradata',$state.vmId,'AOBTankVM/Owner')
    if ($owner.Trim() -ne ('Value: ' + $state.owner)) { throw 'Managed VM ownership mismatch.' }
    $info = Run $vbox @('showvminfo',$state.vmId,'--machinereadable')
    if ($info -notmatch 'VMState="running"') { throw 'Start the existing VM with 03-Start.cmd first.' }
    $probe = @'
systemctl is-active --quiet nftables && sudo -n nft list table inet tank >/dev/null && /opt/tank-node/bin/node -e 'const fs=require("fs"), os=require("os"); console.log(JSON.stringify({...JSON.parse(fs.readFileSync("/var/lib/tank-setup/ready.json","utf8")),actualNode:process.version,actualPlatform:process.platform,cpus:os.cpus().length}));'
'@
    $guestInfo = (Guest $probe) | ConvertFrom-Json
    if ($guestInfo.runtimeHash -ne $connection.runtimeHash -or $guestInfo.actualNode -ne 'v22.23.1' -or $guestInfo.actualPlatform -ne 'linux' -or $guestInfo.cpus -ne 2) { throw 'VM runtime differs from the reviewed i5 calibration environment.' }
    $headers = @{ Authorization=('Bearer ' + $connection.token) }
    $statusUrl = $connection.url + '/tank-node/status'
    $before = Invoke-RestMethod -Uri $statusUrl -Headers $headers -TimeoutSec 15 -MaximumRedirection 0
    if ($before.runtimeHash -ne $connection.runtimeHash -or $before.environment -ne $connection.environment -or $before.mode -ne 'remote-only') { throw 'Coordinator environment mismatch.' }
    $config = @{ url=$connection.url; token=$connection.token; slots=1 } | ConvertTo-Json -Compress
    Write-Host 'VM and HTTPS coordinator verified. Connecting the i5 node...'
    Write-Host (Guest 'sudo -n /usr/local/sbin/tank-connect' $config)
    [void](Guest 'systemctl is-active --quiet tank-runner')
    $config = $null
    for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 3
        $status = Invoke-RestMethod -Uri $statusUrl -Headers $headers -TimeoutSec 15 -MaximumRedirection 0
        if ($status.claims -gt $before.claims -and $status.trial.probe -and $status.trial.probe.status -eq 'ready') {
            Write-Host 'CONNECTED: the server received the i5 request and its successful sandbox check.' -ForegroundColor Green
            Write-Host ('Environment: ' + $status.environment)
            Write-Host ('Trial: ' + ($status.trial.jobs | ConvertTo-Json -Compress))
            Write-Host 'Keep Windows and the VM running, online and awake. The 12 calibration matches run only on the i5.'
            Write-Host 'Send the output above. Do not send connection.json: it contains this node credential.'
            exit 0
        }
        if ($status.trial.probe -and $status.trial.probe.status -eq 'rejected') { throw 'The node connected but its sandbox check failed. Send this message for diagnosis.' }
        if ($i % 5 -eq 0) { Write-Host ('Waiting for node confirmation... ' + ($i*3) + ' seconds.') }
    }
    throw 'Service started but end-to-end confirmation is still pending. Keep the VM running and send this output; do not reinstall.'
} catch {
    Write-Host ('STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally { $config=$null; $connection=$null; $headers=$null }
