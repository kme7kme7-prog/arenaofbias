param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (!$OutputDirectory) { $OutputDirectory = Join-Path $root ('.local/deliveries/tank-vm-i5-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory exists; use a fresh directory.' }
$kit = Join-Path $OutputDirectory 'Tank-VM-i5'
New-Item -ItemType Directory -Path $kit | Out-Null
$runner = Join-Path $OutputDirectory 'runner-build'
& node (Join-Path $root 'tools/tank-ladder/package-runner.mjs') $runner 1
if ($LASTEXITCODE -ne 0) { throw 'Runner packaging failed.' }
# Windows PowerShell Compress-Archive writes backslash entry names. Linux needs
# canonical slash paths, independent of unzip's compatibility heuristics.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = [IO.Compression.ZipFile]::Open((Join-Path $kit 'runner.zip'), [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem -LiteralPath $runner -File -Recurse) {
        $relative = $file.FullName.Substring($runner.Length + 1).Replace('\','/')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose() }
foreach ($name in @('install.ps1','guest-bootstrap.sh','preseed.cfg','README.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $kit $name) }
$actions = [ordered]@{'00-Check-package'='Validate'; '01-Install'='Install'; '02-Status'='Status'; '03-Start'='Start'; '04-Stop'='Stop'; '05-Connect'='Connect'}
foreach ($name in $actions.Keys) {
    $text = '@echo off' + "`r`n" + 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Action ' + $actions[$name] + "`r`npause`r`n"
    [IO.File]::WriteAllText((Join-Path $kit ($name + '.cmd')), $text, [Text.Encoding]::ASCII)
}
$hashes = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $kit -File) { $hashes[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
$runtime = (Get-Content -Raw -LiteralPath (Join-Path $runner 'build.json') | ConvertFrom-Json).runtimeHash
$manifest = [ordered]@{ format='aob-tank-vm-kit-v1'; runtimeHash=$runtime; files=$hashes }
[IO.File]::WriteAllText((Join-Path $kit 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
Compress-Archive -LiteralPath $kit -DestinationPath (Join-Path $OutputDirectory 'Tank-VM-i5.zip')
Write-Output (Join-Path $OutputDirectory 'Tank-VM-i5.zip')
