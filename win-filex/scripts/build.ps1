param([switch]$Test)
$ErrorActionPreference = 'Stop'
$FilexRoot = Split-Path $PSScriptRoot -Parent
Push-Location $FilexRoot
try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Install Rust 1.88+ from https://rustup.rs (MSVC, with Visual Studio C++ Build Tools).' }
    if ($Test) {
        & cargo test --locked
        if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    }
    & cargo build --release --locked
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $FilexRoot 'bin') | Out-Null
    Copy-Item -LiteralPath (Join-Path $FilexRoot 'target/release/filex.exe') -Destination (Join-Path $FilexRoot 'bin/filex.exe') -Force
    Write-Host 'Built bin/filex.exe. Start: ./filex.ps1'
} finally { Pop-Location }
