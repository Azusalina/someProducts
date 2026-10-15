param([switch]$SkipBuild, [switch]$NoProfile)
$ErrorActionPreference = 'Stop'
$FilexSource = Split-Path $PSScriptRoot -Parent
$FilexInstall = Join-Path $env:LOCALAPPDATA 'Programs/win-filex'
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build.ps1') -Test }
if (-not (Test-Path -LiteralPath (Join-Path $FilexSource 'bin/filex.exe'))) { throw 'Missing bin/filex.exe.' }
if ([IO.Path]::GetFullPath($FilexSource).TrimEnd('\') -ne [IO.Path]::GetFullPath($FilexInstall).TrimEnd('\')) {
    New-Item -ItemType Directory -Force -Path $FilexInstall | Out-Null
    foreach ($Name in @('bin', 'shell', 'scripts', 'filex.ps1', 'filex.cmd', 'fileX.example.conf', 'README.md', 'description.md')) {
        Copy-Item -LiteralPath (Join-Path $FilexSource $Name) -Destination $FilexInstall -Recurse -Force
    }
}
$FilexConfig = Join-Path $env:APPDATA 'win-filex/filex.conf'
if (-not (Test-Path -LiteralPath $FilexConfig)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $FilexConfig -Parent) | Out-Null
    Copy-Item -LiteralPath (Join-Path $FilexSource 'fileX.example.conf') -Destination $FilexConfig
}
$FilexUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($FilexUserPath -split ';') -notcontains $FilexInstall) { [Environment]::SetEnvironmentVariable('Path', ($FilexInstall + ';' + $FilexUserPath), 'User') }
if (($env:Path -split ';') -notcontains $FilexInstall) { $env:Path = $FilexInstall + ';' + $env:Path }
if (-not $NoProfile) {
    # Register in both Windows PowerShell and PowerShell 7, including relocated Documents.
    $FilexDocuments = [Environment]::GetFolderPath('MyDocuments')
    foreach ($Directory in @('WindowsPowerShell', 'PowerShell')) {
        $FilexProfile = Join-Path $FilexDocuments "$Directory/profile.ps1"
        New-Item -ItemType Directory -Force -Path (Split-Path $FilexProfile -Parent) | Out-Null
        $FilexContent = if (Test-Path -LiteralPath $FilexProfile) { [IO.File]::ReadAllText($FilexProfile) } else { '' }
        $FilexContent = [regex]::Replace($FilexContent, '(?ms)^# BEGIN win-filex\r?\n.*?^# END win-filex\r?\n?', '')
        $FilexQuoted = (Join-Path $FilexInstall 'filex.ps1').Replace("'", "''")
        $FilexContent += "`r`n# BEGIN win-filex`r`nfunction global:filex { & '$FilexQuoted' @args }`r`n# END win-filex`r`n"
        [IO.File]::WriteAllText($FilexProfile, $FilexContent, (New-Object Text.UTF8Encoding($true)))
    }
    $FilexLauncher = Join-Path $FilexInstall 'filex.ps1'
    $FilexFunction = { & $FilexLauncher @args }.GetNewClosure()
    Set-Item -Path Function:global:filex -Value $FilexFunction
}
Write-Host "Installed: $FilexInstall"
Write-Host 'CMD/PowerShell: filex (new terminals inherit PATH). Git Bash: source the installed shell/filex.bash.'
