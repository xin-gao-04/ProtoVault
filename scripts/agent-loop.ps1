param(
    [Parameter(Position = 0)]
    [ValidateSet("status", "quick", "release")]
    [string]$Mode = "quick"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Write-Step {
    param([string]$Name)
    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    Write-Host "$Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Command $($Arguments -join ' ')"
    }
}

Write-Step "Loop context"
$Commit = git log -1 --oneline
Write-Host "Latest commit: $Commit"

$StatusLines = @(git -c core.quotepath=false status --short)
if ($StatusLines.Count -eq 0) {
    Write-Host "Working tree: clean"
}
else {
    Write-Host "Working tree:"
    $StatusLines | ForEach-Object { Write-Host "  $_" }
}

Write-Step "Safety guard"
$DirtyExamples = @($StatusLines | Where-Object { $_ -match "^(..)\s+examples/" -or $_ -match "^\?\?\s+examples/" })
if ($DirtyExamples.Count -gt 0) {
    Write-Host "WARN: examples/ has local changes. Preserve them unless this loop explicitly owns them." -ForegroundColor Yellow
}

$UntrackedTmp = @($StatusLines | Where-Object { $_ -match "\.tmp$" })
if ($UntrackedTmp.Count -gt 0) {
    Write-Host "WARN: temporary files are present. Do not stage them accidentally." -ForegroundColor Yellow
}

if ($Mode -eq "status") {
    Write-Host "Status-only loop finished."
    exit 0
}

Write-Step "Verification"
if ($Mode -eq "quick") {
    Invoke-Checked "pnpm" @("--filter", "@protovault/contracts", "test")
    Invoke-Checked "pnpm" @("--filter", "@protovault/desktop", "typecheck")
    Invoke-Checked "pnpm" @("--filter", "@protovault/desktop", "test")
}
elseif ($Mode -eq "release") {
    Invoke-Checked "pnpm" @("release:check")
}

Write-Step "Handoff"
Write-Host "Update the loop run record with objective, checks, risks, and next loop."
Write-Host "Update the development changelog before committing material work."
