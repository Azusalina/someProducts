param([switch]$RemoveConfig)
$ErrorActionPreference = 'Stop'
$FilexInstall = Join-Path $env:LOCALAPPDATA 'Programs/win-filex'
$FilexUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', (($FilexUserPath -split ';' | Where-Object { $_ -ne $FilexInstall }) -join ';'), 'User')
$env:Path = ($env:Path -split ';' | Where-Object { $_ -ne $FilexInstall }) -join ';'
$FilexDocuments = [Environment]::GetFolderPath('MyDocuments')
foreach ($Directory in @('WindowsPowerShell', 'PowerShell')) {
    $FilexProfile = Join-Path $FilexDocuments "$Directory/profile.ps1"
    if (Test-Path -LiteralPath $FilexProfile) {
        $FilexContent = [IO.File]::ReadAllText($FilexProfile)
        $FilexContent = [regex]::Replace($FilexContent, '(?ms)^# BEGIN win-filex\r?\n.*?^# END win-filex\r?\n?', '')
        [IO.File]::WriteAllText($FilexProfile, $FilexContent, (New-Object Text.UTF8Encoding($true)))
    }
}
Remove-Item Function:global:filex -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $FilexInstall) { Remove-Item -LiteralPath $FilexInstall -Recurse -Force }
if ($RemoveConfig) { Remove-Item -LiteralPath (Join-Path $env:APPDATA 'win-filex') -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host 'win-filex removed. Config retained unless -RemoveConfig was specified.'
