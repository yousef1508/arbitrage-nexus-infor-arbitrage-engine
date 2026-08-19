param(
  [string]$Environment = "",
  [switch]$SkipBuild,
  [switch]$SkipTypecheck,
  [switch]$SkipSecretList,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "===============================================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "===============================================================================" -ForegroundColor DarkGray
}

function Test-CommandExists {
  param([string]$Name)

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-ProjectCommand {
  param([string[]]$Arguments)

  Write-Host "> $($Arguments -join ' ')" -ForegroundColor DarkGray

  if ($DryRun) {
    return
  }

  & $Arguments[0] $Arguments[1..($Arguments.Length - 1)]

  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $($Arguments -join ' ')"
  }
}

function Invoke-BunRun {
  param([string]$ScriptName)

  if (Test-CommandExists "bun") {
    Invoke-ProjectCommand @("bun", "run", $ScriptName)
    return
  }

  if (Test-CommandExists "npm") {
    Invoke-ProjectCommand @("npm", "run", $ScriptName)
    return
  }

  throw "Neither bun nor npm was found."
}

function Get-WranglerRunner {
  if (Test-CommandExists "bunx") {
    return @{
      Command = "bunx"
      Prefix = @("wrangler")
    }
  }

  if (Test-CommandExists "npx") {
    return @{
      Command = "npx"
      Prefix = @("wrangler")
    }
  }

  if (Test-CommandExists "wrangler") {
    return @{
      Command = "wrangler"
      Prefix = @()
    }
  }

  throw "Could not find bunx, npx, or wrangler. Install dependencies first."
}

function Get-EnvArgs {
  if ([string]::IsNullOrWhiteSpace($Environment)) {
    return @()
  }

  return @("--env", $Environment)
}

function Invoke-Wrangler {
  param([string[]]$Arguments)

  $runner = Get-WranglerRunner
  $envArgs = Get-EnvArgs
  $runnerArgs = @($runner.Prefix + $Arguments + $envArgs)

  Write-Host "> $($runner.Command) $($runnerArgs -join ' ')" -ForegroundColor DarkGray

  if ($DryRun) {
    return
  }

  & $runner.Command @runnerArgs

  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler command failed: $($Arguments -join ' ')"
  }
}

Write-Section "Production Deploy Preflight"

Write-Host "Environment: $(if ($Environment) { $Environment } else { 'default' })" -ForegroundColor Cyan
Write-Host "Dry run: $DryRun" -ForegroundColor Cyan

if (-not $SkipSecretList) {
  Write-Section "Configured Cloudflare Secret Names"
  Write-Host "This lists names only, never secret values." -ForegroundColor DarkGray
  Invoke-Wrangler @("secret", "list")
}

if (-not $SkipTypecheck) {
  Write-Section "Typecheck"
  Invoke-BunRun "typecheck"
}

if (-not $SkipBuild) {
  Write-Section "Build"
  Invoke-BunRun "build"
}

Write-Section "Deploy Worker"

Invoke-Wrangler @("deploy")

Write-Section "Deploy Complete"

Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  bun run check:prod -- -BaseUrl `"https://your-production-domain.example`" -AdminToken `"your-admin-token`"" -ForegroundColor White