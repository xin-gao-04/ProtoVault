param(
  [string]$LlvmRoot = $env:PROTOVAULT_LLVM_ROOT,
  [string]$GitRoot = $env:PROTOVAULT_GIT_ROOT,
  [switch]$KeepExisting
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$desktopRoot = Join-Path $repoRoot "apps\desktop"
$vendorRoot = Join-Path $desktopRoot "vendor-tools"

function Assert-ChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Target
  )
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $targetFull = [System.IO.Path]::GetFullPath($Target).TrimEnd('\', '/')
  if (-not ($targetFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
      $targetFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Refusing to modify path outside root. Root=$rootFull Target=$targetFull"
  }
}

function Resolve-LlvmRoot {
  param([string]$ConfiguredRoot)
  $candidates = @()
  if ($ConfiguredRoot) { $candidates += $ConfiguredRoot }
  if ($env:PROTOVAULT_CLANG_PATH) {
    $clang = Get-Item $env:PROTOVAULT_CLANG_PATH -ErrorAction SilentlyContinue
    if ($clang) { $candidates += (Split-Path (Split-Path $clang.FullName -Parent) -Parent) }
  }
  $command = Get-Command clang++.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates += (Split-Path (Split-Path $command.Source -Parent) -Parent) }
  $candidates += "C:\Program Files\LLVM"

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    $root = [System.IO.Path]::GetFullPath($candidate)
    if ((Test-Path (Join-Path $root "bin\clang++.exe")) -and (Test-Path (Join-Path $root "lib\clang"))) {
      return $root
    }
  }
  throw "Unable to locate LLVM. Install LLVM on the build machine, or set PROTOVAULT_LLVM_ROOT."
}

function Resolve-GitRoot {
  param([string]$ConfiguredRoot)
  $candidates = @()
  if ($ConfiguredRoot) { $candidates += $ConfiguredRoot }
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) {
    $gitExe = Get-Item $command.Source
    $parent = Split-Path $gitExe.FullName -Parent
    if ((Split-Path $parent -Leaf) -eq "cmd") {
      $candidates += (Split-Path $parent -Parent)
    } elseif ((Split-Path $parent -Leaf) -eq "bin" -and (Split-Path (Split-Path $parent -Parent) -Leaf) -eq "mingw64") {
      $candidates += (Split-Path (Split-Path $parent -Parent) -Parent)
    }
  }
  $candidates += "C:\Program Files\Git"

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    $root = [System.IO.Path]::GetFullPath($candidate)
    if ((Test-Path (Join-Path $root "cmd\git.exe")) -and (Test-Path (Join-Path $root "mingw64\bin\git.exe"))) {
      return $root
    }
  }
  throw "Unable to locate Git for Windows. Install Git on the build machine, or set PROTOVAULT_GIT_ROOT."
}

function Copy-Directory {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

Assert-ChildPath -Root $desktopRoot -Target $vendorRoot
if ((Test-Path $vendorRoot) -and -not $KeepExisting) {
  Remove-Item -LiteralPath $vendorRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $vendorRoot -Force | Out-Null

$resolvedLlvmRoot = Resolve-LlvmRoot $LlvmRoot
$resolvedGitRoot = Resolve-GitRoot $GitRoot

$llvmTarget = Join-Path $vendorRoot "llvm"
$gitTarget = Join-Path $vendorRoot "git"
New-Item -ItemType Directory -Path (Join-Path $llvmTarget "bin") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $llvmTarget "lib") -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $resolvedLlvmRoot "bin\clang++.exe") -Destination (Join-Path $llvmTarget "bin\clang++.exe") -Force
Copy-Item -LiteralPath (Join-Path $resolvedLlvmRoot "bin\clang.exe") -Destination (Join-Path $llvmTarget "bin\clang.exe") -Force
Copy-Directory -Source (Join-Path $resolvedLlvmRoot "lib\clang") -Destination (Join-Path $llvmTarget "lib\clang")
foreach ($license in @("LICENSE.TXT", "LICENSE.txt", "NOTICE.TXT", "NOTICE.txt")) {
  $path = Join-Path $resolvedLlvmRoot $license
  if (Test-Path $path) { Copy-Item -LiteralPath $path -Destination (Join-Path $llvmTarget $license) -Force }
}

foreach ($item in @("cmd", "mingw64", "usr", "etc", "LICENSE.txt", "ReleaseNotes.html")) {
  $source = Join-Path $resolvedGitRoot $item
  if (Test-Path $source) {
    $destination = Join-Path $gitTarget $item
    if ((Get-Item $source).PSIsContainer) {
      Copy-Directory -Source $source -Destination $destination
    } else {
      New-Item -ItemType Directory -Path $gitTarget -Force | Out-Null
      Copy-Item -LiteralPath $source -Destination $destination -Force
    }
  }
}

$clangExe = Join-Path $llvmTarget "bin\clang++.exe"
$gitExe = Join-Path $gitTarget "cmd\git.exe"
& $clangExe --version | Select-Object -First 1
& $gitExe --version

$totalBytes = (Get-ChildItem $vendorRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
$totalMb = [Math]::Round($totalBytes / 1MB, 1)
Write-Host "Bundled ProtoVault toolchain prepared at $vendorRoot ($totalMb MB)."
