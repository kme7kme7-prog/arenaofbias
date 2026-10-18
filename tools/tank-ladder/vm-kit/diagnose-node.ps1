Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:ProgramData 'AOBTankVM'
$report = New-Object 'System.Collections.Generic.List[string]'
function Redact([string]$text) {
    return [regex]::Replace($text, '(?i)\b[a-f0-9]{64}\b', '[redacted]')
}
function Show([string]$text) {
    $safe = Redact $text
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
    if (!$p.WaitForExit(30000)) { $p.Kill(); $p.Dispose(); throw 'Diagnostic command timed out.' }
    $code = $p.ExitCode
    $output = $outTask.GetAwaiter().GetResult()
    $errorText = $errTask.GetAwaiter().GetResult()
    $p.Dispose()
    if ($code -ne 0) { throw "Diagnostic failed ($code): $output $errorText" }
    return $output + $errorText
}
function Guest([string]$command, [string]$inputText) {
    return Run 'ssh.exe' @('-p','22222','-i',(Join-Path $base 'admin-key'),'-o','BatchMode=yes','-o','ConnectTimeout=5',
        '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-o','StrictHostKeyChecking=yes',
        '-o',('UserKnownHostsFile=' + (Join-Path $base 'known_hosts')),'-o','IdentitiesOnly=yes','tankmaint@127.0.0.1',$command) $inputText
}
$failed = $false
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Right-click Diagnose.cmd and choose Run as administrator.' }
    $state = Get-Content -Raw -LiteralPath (Join-Path $base 'state.json') | ConvertFrom-Json
    $vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
    $owner = Run $vbox @('getextradata',$state.vmId,'AOBTankVM/Owner')
    if ($owner.Trim() -ne ('Value: ' + $state.owner)) { throw 'Managed VM ownership mismatch.' }
    $info = Run $vbox @('showvminfo',$state.vmId,'--machinereadable')
    if ($info -notmatch 'VMState="running"') { throw 'The existing VM must be running. This diagnostic does not start or reset it.' }
    Show ('Host time: ' + [DateTimeOffset]::Now.ToString('o'))
    Show '=== VM service, recent logs and DNS configuration ==='
    $statusCommand = @'
date -u; systemctl show tank-runner --property=ActiveState,SubState,Result,NRestarts,ExecMainCode,ExecMainStatus; sudo -n journalctl -u tank-runner -n 35 --no-pager -o short-iso; printf '\nDNS configuration:\n'; cat /etc/resolv.conf; printf '\nFirewall:\n'; systemctl is-active nftables
'@
    Show (Guest $statusCommand)
    Show '=== HTTPS probe as tankrunner (no credential sent; HTTP 403 means reachable) ==='
    $networkProbe = @'
import dns from 'node:dns/promises';
import https from 'node:https';
const host = 'game.arenaofbias.icu';
const url = `https://${host}/tank-node/status`;
const reason = (e, depth=0) => depth > 3 ? undefined : ({name:e?.name,code:e?.code,message:e?.message,cause:e?.cause?reason(e.cause,depth+1):undefined,errors:e?.errors?.map(x=>reason(x,depth+1))});
async function check(label, fn) {
  let timer;
  try {
    const result = await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostic timeout (10s)')),10000)})]);
    console.log(JSON.stringify({label,result}));
  } catch(e) { console.log(JSON.stringify({label,error:reason(e)})); }
  finally { clearTimeout(timer); }
}
console.log(JSON.stringify({node:process.version,platform:process.platform,uid:process.getuid(),time:new Date().toISOString()}));
await Promise.all([
  check('DNS lookup',()=>dns.lookup(host,{all:true})),
  check('DNS A',()=>dns.resolve4(host)),
  check('DNS AAAA',()=>dns.resolve6(host)),
  check('Node fetch HTTPS',async()=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(9000)});await r.body?.cancel();return {status:r.status};}),
  check('IPv4 HTTPS',()=>new Promise((resolve,reject)=>{
    const req=https.get(url,{family:4,agent:false},r=>{r.resume();resolve({status:r.statusCode});});
    req.on('error',reject);req.setTimeout(9000,()=>req.destroy(new Error('HTTPS timeout')));
  }))
]);
process.exitCode = 0;
'@
    Show (Guest 'sudo -n runuser -u tankrunner -- /opt/tank-node/bin/node --input-type=module' $networkProbe)
    Show 'DONE. No services, firewall rules, credentials or VM files were changed. Send tank-node-diagnostic.txt.'
} catch {
    $failed = $true
    Show ('DIAGNOSTIC ERROR: ' + $_.Exception.Message)
} finally {
    $outputPath = Join-Path $PSScriptRoot 'tank-node-diagnostic.txt'
    try { $report | Set-Content -LiteralPath $outputPath -Encoding UTF8; Write-Host ('Report saved: ' + $outputPath) }
    catch { Write-Host 'Could not save report. Copy the output above instead.' }
}
if ($failed) { exit 1 }
