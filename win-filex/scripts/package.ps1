param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$FilexRoot = Split-Path $PSScriptRoot -Parent
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build.ps1') -Test }
if (-not (Test-Path -LiteralPath (Join-Path $FilexRoot 'bin/filex.exe'))) { throw 'Missing bin/filex.exe.' }
$FilexStage = Join-Path ([IO.Path]::GetTempPath()) ('win-filex-package-' + [guid]::NewGuid().ToString('N'))
$FilexOutput = Join-Path $FilexRoot 'dist/win-filex-windows-x64.zip'
try {
    $FilexPayload = Join-Path $FilexStage 'win-filex'
    New-Item -ItemType Directory -Force -Path $FilexPayload, (Split-Path $FilexOutput -Parent) | Out-Null
    foreach ($Name in @('Cargo.toml', 'Cargo.lock', 'README.md', 'description.md', 'validation.json', 'fileX.example.conf', 'filex.ps1', 'filex.cmd', 'src', 'themes', 'scripts', 'shell', 'bin')) {
        Copy-Item -LiteralPath (Join-Path $FilexRoot $Name) -Destination $FilexPayload -Recurse -Force
    }
    Compress-Archive -LiteralPath $FilexPayload -DestinationPath $FilexOutput -Force
    Write-Host $FilexOutput
} finally { if (Test-Path -LiteralPath $FilexStage) { Remove-Item -LiteralPath $FilexStage -Recurse -Force } }
