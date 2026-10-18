Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:ProgramData 'AOBTankVM'
$report = New-Object 'System.Collections.Generic.List[string]'
function Show([string]$text) {
    $safe = [regex]::Replace($text, '(?i)\b[a-f0-9]{64}\b', '[redacted]')
    $report.Add($safe)
    Write-Host $safe
}
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
    if (!$p.WaitForExit(30000)) { $p.Kill(); $p.Dispose(); throw 'Command timed out. No disk was reset or VM forcibly powered off.' }
    $code = $p.ExitCode
    $output = $outTask.GetAwaiter().GetResult()
    $errorText = $errTask.GetAwaiter().GetResult()
    $p.Dispose()
    if ($code -ne 0) { throw "Command failed ($code): $output $errorText" }
    return $output
}
function Guest([string]$command, [string]$inputText) {
    return Run 'ssh.exe' @('-p','22222','-i',(Join-Path $base 'admin-key'),'-o','BatchMode=yes','-o','ConnectTimeout=5',
        '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-o','StrictHostKeyChecking=yes',
        '-o',('UserKnownHostsFile=' + (Join-Path $base 'known_hosts')),'-o','IdentitiesOnly=yes','tankmaint@127.0.0.1',$command) $inputText
}
function Vm-Info { return Run $vbox @('showvminfo',$state.vmId,'--machinereadable') }
function Check-IdentityError([string]$message) {
    if ($message -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed') { throw 'VM SSH identity changed; stopped without bypassing verification.' }
}
$failed = $false
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Right-click Repair-DNS.cmd and choose Run as administrator.' }
    $state = Get-Content -Raw -LiteralPath (Join-Path $base 'state.json') | ConvertFrom-Json
    if (!$state.ready -or $state.runtimeHash -ne '95e96cab0957bde80b8aec11d917e9792ab42c353512ecd4330791eb1f8da412') { throw 'Expected installed i5 calibration VM was not found.' }
    $vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
    $owner = Run $vbox @('getextradata',$state.vmId,'AOBTankVM/Owner')
    if ($owner.Trim() -ne ('Value: ' + $state.owner)) { throw 'Managed VM ownership mismatch.' }
    $info = Vm-Info
    if ($info -notmatch 'nic1="nat"' -or $info -notmatch 'VMState="(running|poweroff)"') { throw 'Expected running or powered-off NAT VM. No VM was changed.' }
    $backupPath = Join-Path $base 'dns-repair-before.txt'
    if (!(Test-Path -LiteralPath $backupPath)) { $info | Set-Content -LiteralPath $backupPath -Encoding UTF8 }
    $needsRepair = $true
    if ($info -match 'VMState="running"') {
        $currentDns = Guest 'cat /etc/resolv.conf'
        if ($currentDns -match '(?m)^nameserver\s+10\.0\.2\.3\s*$') {
            $needsRepair = $false
            Show 'VirtualBox DNS is already configured. Checking the connection without restarting the VM.'
        } else {
            $children = Guest 'p=$(systemctl show -p MainPID --value tank-runner); if [ "$p" != 0 ]; then ps -o pid= --ppid "$p"; fi; true'
            if ($children.Trim()) { throw 'A compute child process is running. Stopped before changing DNS or restarting the VM.' }
        }
    }
    if ($needsRepair -and $info -match 'VMState="running"') {
        Show 'Preparing persistent VM DNS. The private-network firewall stays enabled.'
        $prepare = @'
set -euo pipefail
test -f /var/lib/tank-setup/ready.json
test -f /etc/dhcpcd.conf
ip link show enp0s3 >/dev/null
install -d -m 700 /root/aob-dns-repair-before
if [ ! -f /root/aob-dns-repair-before/dhcpcd.conf ]; then
 cp -p /etc/dhcpcd.conf /root/aob-dns-repair-before/dhcpcd.conf
 cp -pL /etc/resolv.conf /root/aob-dns-repair-before/resolv.conf
fi
if ! grep -Fqx '# BEGIN AOB TANK DNS REPAIR' /etc/dhcpcd.conf; then
 printf '\n%s\n' '# BEGIN AOB TANK DNS REPAIR' 'interface enp0s3' 'static domain_name_servers=10.0.2.3' '# END AOB TANK DNS REPAIR' >> /etc/dhcpcd.conf
fi
echo 'DNS configuration backed up and pinned to VirtualBox DNS.'
'@
        Show (Guest 'sudo -n /bin/bash -s' ($prepare.Replace("`r`n","`n")))
        Show 'Requesting a normal VM shutdown. Windows will not restart.'
        [void](Run $vbox @('controlvm',$state.vmId,'acpipowerbutton'))
        $off = $false
        for ($i=0; $i -lt 40; $i++) {
            Start-Sleep -Seconds 3
            if ((Vm-Info) -match 'VMState="poweroff"') { $off=$true; break }
            if ($i % 5 -eq 0) { Show 'Waiting for normal VM shutdown...' }
        }
        if (!$off) { throw 'VM has not shut down normally. No forced power-off was attempted.' }
    }
    if ($needsRepair) {
        Show 'Enabling VirtualBox DNS proxy and the Windows resolver for this VM only.'
        [void](Run $vbox @('modifyvm',$state.vmId,'--natdnsproxy1','on','--natdnshostresolver1','on'))
        [void](Run $vbox @('startvm',$state.vmId,'--type','headless'))
    }
    $ready = $false
    for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 3
        try {
            $dns = Guest 'systemctl is-active --quiet nftables && sudo -n nft list table inet tank >/dev/null && cat /etc/resolv.conf'
            if ($dns -notmatch '(?m)^nameserver\s+10\.0\.2\.3\s*$') { throw 'Waiting for VirtualBox DNS from DHCP.' }
            $ready=$true; break
        } catch { Check-IdentityError $_.Exception.Message }
        if ($i % 5 -eq 0) { Show 'Waiting for VM boot and DNS configuration...' }
    }
    if (!$ready) { throw 'VM boot or DNS verification did not finish. Keep the VM running and send this log.' }
    Show ('VM DNS verified: ' + ($dns -replace "`r?`n",' | '))
    $statusProbe = @'
import fs from 'node:fs';
const token=fs.readFileSync('/etc/tank-runner/token','utf8').trim();
if(!/^[a-f0-9]{64}$/.test(token))throw Error('Node credential is not configured.');
try {
 const r=await fetch('https://game.arenaofbias.icu/tank-node/status',{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error(`Coordinator returned HTTP ${r.status}`);
 const s=await r.json();
 if(s.mode!=='remote-only'||s.runtimeHash!=='95e96cab0957bde80b8aec11d917e9792ab42c353512ecd4330791eb1f8da412')throw Error('Coordinator runtime mismatch');
 console.log(JSON.stringify({nodeOnline:s.nodeOnline,claims:s.claims,completions:s.completions,probe:s.trial?.probe?.status,counts:s.counts,trial:s.trial?.jobs}));
} catch(e) { console.error(JSON.stringify({message:e.message,code:e.cause?.code,cause:e.cause?.message}));process.exitCode=1; }
'@
    $confirmed = $false
    for ($i=0; $i -lt 24; $i++) {
        $status = (Guest 'sudo -n /opt/tank-node/bin/node --input-type=module' $statusProbe) | ConvertFrom-Json
        if ($status.probe -eq 'rejected') { throw 'Network is restored, but the sandbox check was rejected. Send this log for review.' }
        if ($i % 3 -eq 0) { Show ('Coordinator: ' + ($status | ConvertTo-Json -Compress -Depth 5)) }
        if ($status.nodeOnline -and $status.claims -gt 0 -and $status.probe -eq 'ready') { $confirmed=$true; break }
        Start-Sleep -Seconds 5
    }
    if (!$confirmed) { throw 'DNS is fixed; successful sandbox completion is not yet confirmed. Send this log.' }
    Show 'CONNECTED: coordinator received the compute node and accepted its sandbox result.'
    Show 'Keep the VM and i5 running. The 12 calibration matches are a separate check; they run only on the i5.'
} catch {
    $failed = $true
    Show ('STOPPED: ' + $_.Exception.Message)
    try { Show (Guest 'sudo -n journalctl -u tank-runner -n 15 --no-pager -o short-iso') } catch { Show ('Could not read VM log: ' + $_.Exception.Message) }
} finally {
    try { $report | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'tank-dns-repair.txt') -Encoding UTF8 }
    catch { Write-Host 'Could not save report. Copy the output above instead.' }
}
if ($failed) { exit 1 }
