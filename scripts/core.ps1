param(
  [ValidateSet("configure", "build", "test")]
  [string]$Action = "configure"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "services\protocol-core"
$build = Join-Path $source "build-vs2022"

# Some Windows development machines retain Visual Studio 2015 variables in
# their global environment. They override CMake's selected VS2022 generator.
Remove-Item Env:VCTargetsPath -ErrorAction SilentlyContinue
Remove-Item Env:VisualStudioVersion -ErrorAction SilentlyContinue

switch ($Action) {
  "configure" {
    cmake -S $source -B $build -G "Visual Studio 17 2022" -A x64
  }
  "build" {
    cmake --build $build --config Debug
  }
  "test" {
    ctest --test-dir $build -C Debug --output-on-failure
  }
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
