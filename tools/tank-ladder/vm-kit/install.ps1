param([ValidateSet('Install','Status','Start','Stop','Connect','Validate')][string]$Action = 'Install')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Kit = $PSScriptRoot
$Base = Join-Path $env:ProgramData 'AOBTankVM'
$VmName = 'AOB-Tank-i5'
$Port = 22222
$VBox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
$Utf8 = New-Object Text.UTF8Encoding($false)
$Mutex = $null
$Locked = $false

function Write-Utf8([string]$File, [string]$Value) { [IO.File]::WriteAllText($File, $Value.Replace("`r`n", "`n"), $Utf8) }
function Native-Quote([string]$Value) {
    $s = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $s = [regex]::Replace($s, '(\\+)$', '$1$1')
    return '"' + $s + '"'
}
function Native([string]$Exe, [string[]]$Arguments, [switch]$AllowFailure, [string]$InputText) {
    $p = New-Object Diagnostics.Process
    $p.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $p.StartInfo.FileName = $Exe
    $p.StartInfo.Arguments = ($Arguments | ForEach-Object { Native-Quote $_ }) -join ' '
    $p.StartInfo.UseShellExecute = $false
    $p.StartInfo.CreateNoWindow = $true
    $p.StartInfo.RedirectStandardOutput = $true
    $p.StartInfo.RedirectStandardError = $true
    $p.StartInfo.RedirectStandardInput = $true
    [void]$p.Start()
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    if ($InputText) { $p.StandardInput.Write($InputText) }
    $p.StandardInput.Close()
    $p.WaitForExit()
    $result = [pscustomobject]@{ Code=$p.ExitCode; Out=$outTask.GetAwaiter().GetResult(); Err=$errTask.GetAwaiter().GetResult() }
    $p.Dispose()
    if (!$AllowFailure -and $result.Code -ne 0) { throw "Command failed ($($result.Code)): $Exe`n$($result.Err)" }
    return $result
}
function VBox([string[]]$Arguments) { return (Native $script:VBox $Arguments).Out }
function Save-State { Write-Utf8 (Join-Path $Base 'state.json') ($script:State | ConvertTo-Json) }
function Check-Hash([string]$File, [string]$Hash) {
    if (!(Test-Path -LiteralPath $File) -or (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Hash) { throw "SHA256 verification failed: $File" }
}
function Download([string]$Url, [string]$File, [string]$Hash) {
    if (Test-Path -LiteralPath $File) { Check-Hash $File $Hash; return }
    Write-Host "Downloading official package: $Url"
    $part = "$File.part"
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $part -TimeoutSec 1800
    Check-Hash $part $Hash
    Move-Item -LiteralPath $part -Destination $File
}
function Check-Signer([string]$File, [string]$Vendor) {
    $signature = Get-AuthenticodeSignature -LiteralPath $File
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $Vendor) { throw "Publisher signature verification failed: $File" }
}
function New-Key([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        if (!(Test-Path -LiteralPath "$Path.pub")) { throw "Incomplete key pair at $Path; refusing to overwrite." }
        return
    }
    [void](Native 'ssh-keygen.exe' @('-q','-t','ed25519','-N','','-f',$Path,'-C','aob-tank-vm-local'))
}
function Ssh([string]$Command, [switch]$AllowFailure, [string]$InputText) {
    $argsList = @('-p',"$Port",'-i', (Join-Path $Base 'admin-key'), '-o','BatchMode=yes','-o','ConnectTimeout=5',
        '-o','StrictHostKeyChecking=yes','-o',('UserKnownHostsFile=' + (Join-Path $Base 'known_hosts')), '-o','IdentitiesOnly=yes',
        'tankmaint@127.0.0.1',$Command)
    return Native 'ssh.exe' $argsList -AllowFailure:$AllowFailure -InputText $InputText
}
function Vm-Info {
    $r = Native $VBox @('showvminfo',$script:State.vmId,'--machinereadable') -AllowFailure
    if ($r.Code -ne 0) { return $null }
    return $r.Out
}
function Check-Owned {
    $info = Vm-Info
    if (!$info) { throw 'The managed VM is not registered. Run Install first.' }
    $tag = VBox @('getextradata',$script:State.vmId,'AOBTankVM/Owner')
    if ($tag.Trim() -ne ('Value: ' + $script:State.owner)) { throw 'VM ownership marker mismatch. No VM was modified.' }
    return $info
}
function Check-LocalPort {
    $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    try { $probe.Start() } catch { throw "Local management port $Port is already in use. No running service was stopped." }
    finally { $probe.Stop() }
}
function Wait-Ready {
    Write-Host 'Waiting for Debian installation and compute self-check (up to 60 minutes).'
    Write-Host 'Keep this window open. Downloads inside the VM also require Internet access.'
    for ($i=0; $i -lt 180; $i++) {
        $r = Ssh 'systemctl is-active --quiet nftables && sudo nft list table inet tank >/dev/null && test -f /var/lib/tank-setup/ready.json && cat /var/lib/tank-setup/ready.json' -AllowFailure
        if ($r.Code -eq 0) {
            $ready = $r.Out | ConvertFrom-Json
            if ($ready.runtimeHash -ne $script:Manifest.runtimeHash) { throw 'Guest runtime fingerprint mismatch.' }
            $script:State.ready = $true; Save-State
            Write-Host $r.Out
            Write-Host 'READY: isolated Linux compute environment installed. Waiting for coordinator URL and token.' -ForegroundColor Green
            return
        }
        if ($r.Err -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed') { throw 'Guest SSH identity mismatch. Do not bypass host-key checks.' }
        if ($i % 3 -eq 0) { Write-Host ('Installing / waiting... elapsed about ' + [int]($i/3) + ' minutes.') }
        Start-Sleep -Seconds 20
    }
    throw 'Setup is not confirmed. Re-run Install to continue waiting, or open the AOB-Tank-i5 console in VirtualBox and send the error. No disk will be reformatted on resume.'
}

try {
    $Manifest = Get-Content -Raw -LiteralPath (Join-Path $Kit 'manifest.json') | ConvertFrom-Json
    foreach ($entry in $Manifest.files.PSObject.Properties) { Check-Hash (Join-Path $Kit $entry.Name) $entry.Value }
    if ($Action -eq 'Validate') { Write-Host 'Kit hashes verified. No host changes made.'; exit 0 }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Right-click the CMD launcher and choose Run as administrator.' }
    if (![Environment]::Is64BitOperatingSystem) { throw 'A 64-bit Windows host is required.' }
    $Mutex = New-Object Threading.Mutex($false, 'Local\AOBTankVM-Setup')
    $Locked = $Mutex.WaitOne(0)
    if (!$Locked) { throw 'Another Tank VM operation is running. Close it before retrying.' }
    foreach ($program in @('ssh.exe','ssh-keygen.exe')) { if (!(Get-Command $program -ErrorAction SilentlyContinue)) { throw "$program is missing. Install the Windows OpenSSH Client optional component first." } }
    if (!(Test-Path -LiteralPath $Base)) {
        if ($Action -ne 'Install') { throw 'Run Install first.' }
        New-Item -ItemType Directory -Path $Base | Out-Null
        $State = [pscustomobject]@{ owner=[guid]::NewGuid().ToString(); vmId=[guid]::NewGuid().ToString(); configured=$false; prepared=$false; ready=$false; runtimeHash=$Manifest.runtimeHash }
        Save-State
    } else {
        if (!(Test-Path -LiteralPath (Join-Path $Base 'state.json'))) { throw "$Base already exists without our marker. Refusing to change it." }
        $State = Get-Content -Raw -LiteralPath (Join-Path $Base 'state.json') | ConvertFrom-Json
        if ($State.runtimeHash -ne $Manifest.runtimeHash) { throw 'This machine has a different runner build. An explicit upgrade is required; no existing VM or data changed.' }
    }
    # Protect generated management keys/passwords from other local users.
    [void](Native 'icacls.exe' @($Base,'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'))
    if ($Action -eq 'Install') {
        $cpu = @(Get-CimInstance Win32_Processor)
        $machine = Get-CimInstance Win32_ComputerSystem
        if (!$machine.HypervisorPresent -and !($cpu | Where-Object { $_.VirtualizationFirmwareEnabled })) { throw 'CPU virtualization is not enabled or cannot be detected. Enable Intel VT-x in BIOS/UEFI, then run Install again. No BIOS/security setting is changed automatically.' }
        if ($machine.TotalPhysicalMemory -lt 8GB) { throw 'At least 8 GB host RAM is required for this configuration.' }
        $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($Base))
        if ($drive.AvailableFreeSpace -lt 32GB) { throw 'At least 32 GB free space on the ProgramData drive is required.' }
        $cache = Join-Path $Base 'downloads'
        New-Item -ItemType Directory -Force -Path $cache | Out-Null
        if (!(Test-Path -LiteralPath $VBox)) {
            $vc = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
            if (!$vc -or $vc.Installed -ne 1) {
                $vcFile = Join-Path $cache 'vc_redist.x64.exe'
                Invoke-WebRequest -UseBasicParsing 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $vcFile -TimeoutSec 600
                Check-Signer $vcFile 'Microsoft Corporation'
                $r = Native $vcFile @('/install','/quiet','/norestart') -AllowFailure
                Write-Utf8 (Join-Path $Base 'vc-install.log') ($r.Out + "`n" + $r.Err)
                if ($r.Code -eq 3010) { throw 'Microsoft runtime installed. Restart Windows, then run Install again.' }
                if ($r.Code -notin @(0,1638)) { throw "Microsoft runtime installation failed: $($r.Code)" }
            }
            $installer = Join-Path $cache 'VirtualBox-7.2.20-175154-Win.exe'
            Download 'https://download.virtualbox.org/virtualbox/7.2.20/VirtualBox-7.2.20-175154-Win.exe' $installer 'a81777d2b36380ce042a29e9c554cf032eb46a793f62e3cc82e7411e535c2c26'
            Check-Signer $installer 'Oracle (America|Corporation)'
            Write-Host 'Installing VirtualBox base application; no Extension Pack, bridged networking or USB components requested.'
            $r = Native $installer @('--silent','-msiparams','ADDLOCAL=VBoxApplication','REBOOT=ReallySuppress','VBOX_START=0') -AllowFailure
            Write-Utf8 (Join-Path $Base 'virtualbox-install.log') ($r.Out + "`n" + $r.Err)
            if ($r.Code -eq 3010) { throw 'VirtualBox installed. Restart Windows, then run Install again.' }
            if ($r.Code -ne 0) { throw "VirtualBox installation failed: $($r.Code). The modified Windows installation may be missing required services." }
        }
        $version = (VBox @('--version')).Trim()
        if ($version -notmatch '^7\.2\.(\d+)' -or [int]$Matches[1] -lt 20) { throw "Found VirtualBox $version. This kit requires 7.2.20 or a newer 7.2 maintenance release. Existing installations are not automatically upgraded." }
        if (!(Vm-Info)) {
            $existing = VBox @('list','vms')
            if ($existing -match ('"' + [regex]::Escape($VmName) + '"')) { throw 'A VM with the same name already exists. It will not be replaced.' }
            [void](VBox @('createvm','--name',$VmName,'--uuid',$State.vmId,'--ostype','Debian_64','--basefolder',(Join-Path $Base 'machines'),'--register'))
            [void](VBox @('setextradata',$State.vmId,'AOBTankVM/Owner',$State.owner))
        }
        $info = Check-Owned
        if (!$State.configured) {
            if ($info -notmatch 'VMState="poweroff"') { throw 'Partial setup VM is not powered off. No running VM was modified.' }
            [void](VBox @('modifyvm',$State.vmId,'--memory','4096','--cpus','2','--vram','16','--graphicscontroller','vmsvga','--audio-enabled','off','--usb-ohci','off','--usb-ehci','off','--usb-xhci','off','--clipboard-mode','disabled','--drag-and-drop','disabled','--vrde','off','--nic1','nat','--natdnsproxy1','on','--natdnshostresolver1','on','--nic2','none','--boot1','disk','--boot2','dvd','--boot3','none','--boot4','none'))
            [void](Native $VBox @('modifyvm',$State.vmId,'--natpf1','delete','tank-ssh') -AllowFailure)
            [void](VBox @('modifyvm',$State.vmId,'--natpf1',"tank-ssh,tcp,127.0.0.1,$Port,,22"))
            $info = Check-Owned
            if ($info -notmatch 'storagecontrollername\d+="SATA"') { [void](VBox @('storagectl',$State.vmId,'--name','SATA','--add','sata','--controller','IntelAhci','--portcount','2')) }
            if ($info -notmatch 'storagecontrollername\d+="IDE"') { [void](VBox @('storagectl',$State.vmId,'--name','IDE','--add','ide','--controller','PIIX4')) }
            $disk = Join-Path $Base 'tank-system.vdi'
            if (!(Test-Path -LiteralPath $disk)) { [void](VBox @('createmedium','disk','--filename',$disk,'--size','24576','--format','VDI','--variant','Standard')) }
            [void](VBox @('storageattach',$State.vmId,'--storagectl','SATA','--port','0','--device','0','--type','hdd','--medium',$disk))
            $State.configured = $true; Save-State
        }
        if (!$State.prepared) {
            $iso = Join-Path $cache 'debian-13.7.0-amd64-netinst.iso'
            Download 'https://cdimage.debian.org/debian-cd/13.7.0/amd64/iso-cd/debian-13.7.0-amd64-netinst.iso' $iso 'a7ef94ac2fb9a7fec454552abd629b7cc9d5155c886165a45649f5ce6167e355'
            New-Key (Join-Path $Base 'admin-key')
            New-Key (Join-Path $Base 'guest-host-key')
            $adminPublic = (Get-Content -Raw -LiteralPath (Join-Path $Base 'admin-key.pub')).Trim()
            $hostPublic = (Get-Content -Raw -LiteralPath (Join-Path $Base 'guest-host-key.pub')).Trim()
            Write-Utf8 (Join-Path $Base 'known_hosts') ("[127.0.0.1]:$Port $hostPublic`n")
            $passwordFile = Join-Path $Base 'install-password.txt'
            if (!(Test-Path -LiteralPath $passwordFile)) {
                $bytes = New-Object byte[] 32
                $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
                Write-Utf8 $passwordFile ([Convert]::ToBase64String($bytes))
            }
            $bootstrap = Get-Content -Raw -LiteralPath (Join-Path $Kit 'guest-bootstrap.sh')
            $bootstrap = $bootstrap.Replace('__ADMIN_PUBLIC_KEY__',$adminPublic)
            $bootstrap = $bootstrap.Replace('__SSH_HOST_PRIVATE_B64__',[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $Base 'guest-host-key'))))
            $bootstrap = $bootstrap.Replace('__SSH_HOST_PUBLIC_B64__',[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $Base 'guest-host-key.pub'))))
            $bootstrap = $bootstrap.Replace('__RUNNER_ZIP_B64__',[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $Kit 'runner.zip'))))
            $bootstrap = $bootstrap.Replace('__RUNNER_ZIP_SHA__',$Manifest.files.'runner.zip')
            $post = "#!/bin/sh`nset -eu`ncat > /target/root/tank-bootstrap.sh <<'TANK_BOOTSTRAP_END'`n$bootstrap`nTANK_BOOTSTRAP_END`nin-target /bin/bash /root/tank-bootstrap.sh`n"
            Write-Utf8 (Join-Path $Base 'postinstall.sh') $post
            Copy-Item -LiteralPath (Join-Path $Kit 'preseed.cfg') -Destination (Join-Path $Base 'preseed.cfg')
            [void](VBox @('storageattach',$State.vmId,'--storagectl','IDE','--port','0','--device','0','--type','dvddrive','--medium',$iso))
            $prep = VBox @('unattended','install',$State.vmId,"--iso=$iso",'--user=tankmaint',"--password-file=$passwordFile",'--hostname=tank-runner.local','--locale=en_US','--country=US','--time-zone=Asia/Shanghai','--no-install-additions','--no-install-txs','--package-selection-adjustment=minimal',('--script-template=' + (Join-Path $Base 'preseed.cfg')),('--post-install-template=' + (Join-Path $Base 'postinstall.sh')),('--auxiliary-base-path=' + (Join-Path $Base 'unattended-')))
            # VBox preparation output may contain credentials; keep it in the ACL-protected directory.
            Write-Utf8 (Join-Path $Base 'unattended.log') $prep
            $State.prepared = $true; Save-State
        }
        $info = Check-Owned
        if ($info -match 'VMState="poweroff"') { Check-LocalPort; [void](VBox @('startvm',$State.vmId,'--type','headless')) }
        elseif ($info -notmatch 'VMState="running"') { throw 'VM is not running or powered off; inspect its state in VirtualBox before resuming.' }
        Wait-Ready
    } else {
        $info = Check-Owned
        if ($Action -eq 'Start') {
            if ($info -match 'VMState="poweroff"') { Check-LocalPort; [void](VBox @('startvm',$State.vmId,'--type','headless')) }
            Wait-Ready
        } elseif ($Action -eq 'Stop') {
            if ($info -match 'VMState="running"') { [void](VBox @('controlvm',$State.vmId,'acpipowerbutton')); Write-Host 'Graceful shutdown requested. Incomplete matches return to the coordinator queue after lease expiry.' }
            else { Write-Host 'VM is not running; no change made.' }
        } elseif ($Action -eq 'Status') {
            if ($info -notmatch 'VMState="running"') { Write-Host 'VM is not running. Use Start.' }
            else { Write-Host (Ssh 'sudo /usr/local/sbin/tank-status').Out }
        } elseif ($Action -eq 'Connect') {
            if (!$State.ready) { throw 'Installation is not confirmed. Run Install first.' }
            $url = Read-Host 'Dedicated HTTPS compute origin (provided later; e.g. https://compute.example.com)'
            $secure = Read-Host 'Node token (64 lowercase hex characters; input hidden)' -AsSecureString
            $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
            try {
                $config = @{ url=$url.Trim(); token=$token.Trim(); slots=1 } | ConvertTo-Json -Compress
                Write-Host (Ssh 'sudo /usr/local/sbin/tank-connect' -InputText $config).Out
                Write-Host (Ssh 'sudo /usr/local/sbin/tank-status').Out
            } finally { $token=$null; $config=$null; $secure.Dispose() }
        }
    }
} catch {
    Write-Host ("STOPPED: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'No automatic host reboot, security-setting changes, VM deletion or disk reset was requested. Send this error text for diagnosis.'
    exit 1
} finally {
    if ($Locked -and $Mutex) { $Mutex.ReleaseMutex() }
    if ($Mutex) { $Mutex.Dispose() }
}
