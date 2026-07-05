param(
    [Parameter(Position = 0)]
    [ValidateSet("status", "loop0", "loop1", "loop2", "loop3", "loop4", "loop5", "quick", "release", "all")]
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

function Invoke-RgNoMatch {
    param(
        [string]$Pattern,
        [string[]]$Paths
    )

    $matches = @(rg --fixed-strings --line-number $Pattern @Paths 2>$null)
    if ($matches.Count -gt 0) {
        $matches | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
        throw "Legacy pattern still present: $Pattern"
    }
}

function Assert-FileContains {
    param(
        [string]$Path,
        [string]$Pattern
    )

    $matches = @(Select-String -Path $Path -Pattern $Pattern -SimpleMatch)
    if ($matches.Count -eq 0) {
        throw "Expected pattern not found in ${Path}: ${Pattern}"
    }
}

function Show-Status {
    Write-Step "P14 Git/Baseline loop context"
    $commit = git log -1 --oneline
    Write-Host "Latest commit: $commit"

    $statusLines = @(git -c core.quotepath=false status --short)
    if ($statusLines.Count -eq 0) {
        Write-Host "Working tree: clean"
    }
    else {
        Write-Host "Working tree:"
        $statusLines | ForEach-Object { Write-Host "  $_" }
    }

    $dirtyExamples = @($statusLines | Where-Object { $_ -match "^(..)\s+examples/" -or $_ -match "^\?\?\s+examples/" })
    if ($dirtyExamples.Count -gt 0) {
        Write-Host "WARN: examples/ has local changes. Preserve them unless this loop explicitly owns them." -ForegroundColor Yellow
    }

    $untrackedTmp = @($statusLines | Where-Object { $_ -match "\.tmp$" })
    if ($untrackedTmp.Count -gt 0) {
        Write-Host "WARN: temporary files are present. Do not stage them accidentally." -ForegroundColor Yellow
    }
}

function Invoke-Loop0 {
    Write-Step "Loop 0 / terminology and plan"
    $p14Matches = @(rg --fixed-strings "P14" "doc" 2>$null)
    if ($p14Matches.Count -eq 0) {
        throw "Expected P14 documentation updates under doc/."
    }
    $gitMatches = @(rg --fixed-strings "Git" "doc" 2>$null)
    if ($gitMatches.Count -eq 0) {
        throw "Expected Git documentation updates under doc/."
    }
}

function Invoke-Loop1 {
    Write-Step "Loop 1 / contracts and API surface"
    Invoke-Checked "pnpm" @("--filter", "@protovault/contracts", "test")
    Invoke-Checked "pnpm" @("--filter", "@protovault/desktop", "typecheck")
}

function Invoke-Loop2 {
    Write-Step "Loop 2 / Git CLI service and baseline diff"
    Invoke-Checked "pnpm" @("--filter", "@protovault/desktop", "test")
}

function Invoke-Loop3 {
    Write-Step "Loop 3 / UI replacement guard"
    $paths = @("apps/desktop/src/preload", "apps/desktop/src/renderer", "apps/desktop/tests")
    Invoke-RgNoMatch "createSnapshot" $paths
    Invoke-RgNoMatch "diffSnapshot" $paths
    Invoke-RgNoMatch "protocol:create-snapshot" $paths
    Invoke-RgNoMatch "protocol:diff" $paths
    Invoke-RgNoMatch ".protocol/snapshots" $paths
}

function Invoke-Loop4 {
    Write-Step "Loop 4 / build and automation script"
    Invoke-Checked "pnpm" @("--filter", "@protovault/desktop", "build")
}

function Invoke-Loop5 {
    Write-Step "Loop 5 / release gate"
    Invoke-Checked "pnpm" @("release:check")
}

Show-Status

switch ($Mode) {
    "status" {
        Write-Host "Status-only P14 loop finished."
    }
    "loop0" { Invoke-Loop0 }
    "loop1" { Invoke-Loop1 }
    "loop2" { Invoke-Loop2 }
    "loop3" { Invoke-Loop3 }
    "loop4" { Invoke-Loop4 }
    "loop5" { Invoke-Loop5 }
    "quick" {
        Invoke-Loop0
        Invoke-Loop1
        Invoke-Loop2
        Invoke-Loop3
    }
    "release" {
        Invoke-Loop5
    }
    "all" {
        Invoke-Loop0
        Invoke-Loop1
        Invoke-Loop2
        Invoke-Loop3
        Invoke-Loop4
        Invoke-Loop5
    }
}

Write-Step "P14 handoff"
Write-Host "Record verification output in the development changelog before committing material work."
