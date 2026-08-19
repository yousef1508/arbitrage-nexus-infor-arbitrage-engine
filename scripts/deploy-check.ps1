param(
  [string]$BaseUrl = "https://arbitragenexus.net",
  [string]$AdminToken = $env:ADMIN_API_TOKEN,
  [switch]$Deploy,
  [switch]$SkipBuild,
  [switch]$SkipSmoke,
  [switch]$RequirePublicReports
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "=== $Name ==="

  $started = Get-Date

  try {
    & $Command
    $elapsed = [Math]::Round(((Get-Date) - $started).TotalSeconds, 2)
    Write-Host "OK: $Name ($elapsed sec)"
  }
  catch {
    Write-Host "FAILED: $Name"
    Write-Host $_.Exception.Message
    throw
  }
}

function Assert-CommandExists {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Get-PackageScriptNames {
  if (-not (Test-Path "package.json")) {
    return @()
  }

  $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
  $scripts = $pkg.scripts

  if (-not $scripts) {
    return @()
  }

  return @($scripts.PSObject.Properties.Name)
}

Assert-CommandExists "bun"

$scriptNames = Get-PackageScriptNames

Invoke-Step "TypeScript check" {
  bun x tsc --noEmit
}

if (-not $SkipBuild) {
  Invoke-Step "Frontend/worker build" {
    if ($scriptNames -contains "build") {
      bun run build
    } else {
      bun x vite build
    }
  }

  Invoke-Step "Dist verification" {
    if (-not (Test-Path "dist")) {
      throw "dist folder was not generated"
    }

    $files = @(Get-ChildItem "dist" -Recurse -File -ErrorAction Stop)

    if ($files.Count -eq 0) {
      throw "dist folder is empty"
    }

    Write-Host "dist_files=$($files.Count)"
  }
}

Invoke-Step "Wrangler deploy validation" {
  Assert-CommandExists "wrangler"

  if ($Deploy) {
    wrangler deploy
  } else {
    wrangler deploy --dry-run
  }
}

if (-not $SkipSmoke) {
  Invoke-Step "Post-build smoke test" {
    $args = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", "scripts\smoke-test.ps1",
      "-BaseUrl", $BaseUrl
    )

    if (-not [string]::IsNullOrWhiteSpace($AdminToken)) {
      $args += @("-AdminToken", $AdminToken)
    }

    if ($RequirePublicReports) {
      $args += "-RequirePublicReports"
    }

    & powershell @args
  }
}

Write-Host ""
Write-Host "=== Deploy check complete ==="
Write-Host "deploy_mode=$($Deploy.IsPresent)"
Write-Host "base_url=$BaseUrl"
