param(
  [string]$EnvFile = ".dev.vars",
  [string]$Environment = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info($Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Resolve-WranglerRunner {
  if (Test-Path ".\node_modules\.bin\wrangler.cmd") {
    return @{
      Exe = (Resolve-Path ".\node_modules\.bin\wrangler.cmd").Path
      Pre = @()
    }
  }

  $bun = Get-Command bun -ErrorAction SilentlyContinue
  if ($bun) {
    return @{
      Exe = $bun.Source
      Pre = @("x", "wrangler")
    }
  }

  $npx = Get-Command npx -ErrorAction SilentlyContinue
  if ($npx) {
    return @{
      Exe = $npx.Source
      Pre = @("wrangler")
    }
  }

  $wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if ($wrangler) {
    return @{
      Exe = $wrangler.Source
      Pre = @()
    }
  }

  throw "Wrangler runner not found. Install dependencies with bun install, or install Wrangler globally."
}

function Parse-EnvFile($Path) {
  if (!(Test-Path $Path)) {
    throw "Env file not found: $Path"
  }

  $entries = @()

  Get-Content $Path | ForEach-Object {
    $rawLine = $_
    $line = $rawLine.Trim()

    if (!$line) { return }
    if ($line.StartsWith("#")) { return }

    $match = [regex]::Match($rawLine, "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")

    if (!$match.Success) {
      Write-Warn "Skipping invalid env line: $line"
      return
    }

    $key = $match.Groups[1].Value.Trim()
    $value = $match.Groups[2].Value.Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $entries += [PSCustomObject]@{
      Key = $key
      Value = $value
    }
  }

  return $entries
}

function Set-WranglerSecret($Key, $Value, $Environment) {
  $argsList = @()

  if ($Runner.Pre -and $Runner.Pre.Count -gt 0) {
    $argsList += $Runner.Pre
  }

  $argsList += @("secret", "put", $Key)

  if ($Environment -and $Environment.Trim().Length -gt 0) {
    $argsList += @("--env", $Environment.Trim())
  }

  $maxAttempts = 5

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      $output = $Value | & $Runner.Exe @argsList 2>&1
      $exitCode = $LASTEXITCODE
      $text = ($output | Out-String).Trim()

      if ($exitCode -eq 0) {
        return
      }

      $retryable =
        $text -match "fetch failed" -or
        $text -match "ETIMEDOUT" -or
        $text -match "ECONNRESET" -or
        $text -match "EAI_AGAIN" -or
        $text -match "429" -or
        $text -match "5\d\d"

      if ($retryable -and $attempt -lt $maxAttempts) {
        $delay = [Math]::Min(30, 2 * $attempt)
        Write-Warn "Retryable Wrangler failure setting $Key. Attempt $attempt/$maxAttempts. Waiting ${delay}s..."
        Start-Sleep -Seconds $delay
        continue
      }

      throw "Failed setting secret $Key. $text"
    } catch {
      if ($attempt -lt $maxAttempts) {
        $delay = [Math]::Min(30, 2 * $attempt)
        Write-Warn "Exception setting $Key. Attempt $attempt/$maxAttempts. Waiting ${delay}s... $($_.Exception.Message)"
        Start-Sleep -Seconds $delay
        continue
      }

      throw
    }
  }
}

$runner = Resolve-WranglerRunner

Write-Info "Using Wrangler runner: $($runner.Exe) $($runner.Pre -join ' ')"
Write-Info "Reading secrets from: $EnvFile"

$entries = Parse-EnvFile $EnvFile

if ($entries.Count -eq 0) {
  throw "No env entries found in $EnvFile"
}

Write-Info "Found $($entries.Count) entries."

if ($Environment) {
  Write-Info "Target Wrangler environment: $Environment"
} else {
  Write-Info "Target Wrangler environment: default"
}

foreach ($entry in $entries) {
  if ([string]::IsNullOrWhiteSpace($entry.Key)) {
    continue
  }

  if ([string]::IsNullOrWhiteSpace([string]$entry.Value)) {
    Write-Warn "Skipping $($entry.Key): empty value"
    continue
  }

  if ($DryRun) {
    Write-Info "DRY RUN: would set $($entry.Key)"
    continue
  }

  Write-Info "Setting Cloudflare secret: $($entry.Key)"
  Set-WranglerSecret -Runner $runner -Key $entry.Key -Value $entry.Value -Environment $Environment
  Write-Ok "Set $($entry.Key)"
}

Write-Ok "Cloudflare secrets sync complete."