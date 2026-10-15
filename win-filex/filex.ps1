# Run from any directory; never changes the root to the installation directory.
$FilexRoot = $PSScriptRoot
$FilexExe = Join-Path $FilexRoot 'bin/filex.exe'
if (-not (Test-Path -LiteralPath $FilexExe)) { $FilexExe = Join-Path $FilexRoot 'target/release/filex.exe' }
if (-not (Test-Path -LiteralPath $FilexExe)) { throw 'Build first: ./scripts/build.ps1' }
$FilexPreviousCwdFile = $env:FILEX_CWD_FILE
$FilexPreviousRoot = $env:FILEX_ROOT
$FilexCwdFile = [IO.Path]::GetTempFileName()
try {
    $env:FILEX_CWD_FILE = $FilexCwdFile
    $env:FILEX_ROOT = $FilexRoot
    & $FilexExe @args
    $FilexStatus = $LASTEXITCODE
    if ($FilexStatus -eq 0) {
        $FilexDirectory = [IO.File]::ReadAllText($FilexCwdFile, [Text.Encoding]::UTF8).TrimEnd([char[]]"`r`n")
        if ($FilexDirectory -and (Test-Path -LiteralPath $FilexDirectory -PathType Container)) { Set-Location -LiteralPath $FilexDirectory }
    }
    $global:LASTEXITCODE = $FilexStatus
} finally {
    $env:FILEX_CWD_FILE = $FilexPreviousCwdFile
    $env:FILEX_ROOT = $FilexPreviousRoot
    Remove-Item -LiteralPath $FilexCwdFile -Force -ErrorAction SilentlyContinue
}
