param(
  [string]$BaseUrl = "https://arbitragenexus.net",
  [string]$AdminToken = "",
  [switch]$RequirePublicInventory
)

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "https://arbitragenexus.net"
  }

  return $Value.Trim().TrimEnd("/")
}

function Join-Url {
  param(
    [string]$Base,
    [string]$Path
  )

  $cleanBase = Normalize-BaseUrl $Base

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $cleanBase
  }

  if ($Path.StartsWith("http://") -or $Path.StartsWith("https://")) {
    return $Path
  }

  if ($Path.StartsWith("/")) {
    return "$cleanBase$Path"
  }

  return "$cleanBase/$Path"
}

function New-Result {
  param(
    [string]$Name,
    [string]$Url,
    [bool]$Ok,
    [string]$Status,
    [string]$Details
  )

  [pscustomobject]@{
    name    = $Name
    url     = $Url
    ok      = $Ok
    status  = $Status
    details = $Details
  }
}

function Invoke-SmokeRequest {
  param(
    [string]$Name,
    [string]$Path,
    [string]$Method = "GET",
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $url = Join-Url $script:BaseUrlNormalized $Path

  $requestHeaders = @{
    "Accept" = "application/json,text/html,application/xml,text/plain,*/*"
    "User-Agent" = "ArbitrageNexusSmokeTest/1.0"
  }

  foreach ($key in $Headers.Keys) {
    $requestHeaders[$key] = $Headers[$key]
  }

  $params = @{
    Uri = $url
    Method = $Method
    Headers = $requestHeaders
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
  }

  try {
    $response = Invoke-WebRequest @params

    return [pscustomobject]@{
      name        = $Name
      url         = $url
      ok          = $true
      status_code = [int]$response.StatusCode
      content     = [string]$response.Content
      headers     = $response.Headers
      error       = $null
    }
  } catch {
    $statusCode = 0
    $content = ""
    $headers = $null

    if ($_.Exception.Response) {
      try {
        $statusCode = [int]$_.Exception.Response.StatusCode
      } catch {
        $statusCode = 0
      }

      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $content = $reader.ReadToEnd()
        }
      } catch {
        $content = ""
      }

      try {
        $headers = $_.Exception.Response.Headers
      } catch {
        $headers = $null
      }
    }

    return [pscustomobject]@{
      name        = $Name
      url         = $url
      ok          = $false
      status_code = $statusCode
      content     = $content
      headers     = $headers
      error       = $_.Exception.Message
    }
  }
}

function Try-ParseJson {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Assert-Status {
  param(
    [string]$Name,
    [string]$Path,
    [int[]]$ExpectedStatus,
    [string]$Method = "GET",
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $res = Invoke-SmokeRequest -Name $Name -Path $Path -Method $Method -Body $Body -Headers $Headers
  $ok = $ExpectedStatus -contains $res.status_code

  $expectedText = ($ExpectedStatus -join ",")
  $details = "HTTP $($res.status_code), expected $expectedText"

  return New-Result -Name $Name -Url $res.url -Ok $ok -Status $res.status_code -Details $details
}

function Assert-JsonKind {
  param(
    [string]$Name,
    [string]$Path,
    [string]$ExpectedKind,
    [switch]$RequireNonEmpty
  )

  $res = Invoke-SmokeRequest -Name $Name -Path $Path
  $data = Try-ParseJson $res.content

  if ($res.status_code -ne 200) {
    return New-Result -Name $Name -Url $res.url -Ok $false -Status $res.status_code -Details "Expected HTTP 200 JSON; got HTTP $($res.status_code)"
  }

  if ($null -eq $data) {
    return New-Result -Name $Name -Url $res.url -Ok $false -Status $res.status_code -Details "Response was not valid JSON"
  }

  $kind = ""
  if ($data.PSObject.Properties.Name -contains "kind") {
    $kind = [string]$data.kind
  }

  if ($kind -ne $ExpectedKind) {
    return New-Result -Name $Name -Url $res.url -Ok $false -Status $res.status_code -Details "Expected kind=$ExpectedKind; got kind=$kind"
  }

  if ($RequireNonEmpty) {
    $countValue = 0

    if ($data.PSObject.Properties.Name -contains "count") {
      $countValue = [int]$data.count
    }

    if ($countValue -le 0) {
      return New-Result -Name $Name -Url $res.url -Ok $false -Status $res.status_code -Details "JSON kind ok but count is empty"
    }
  }

  return New-Result -Name $Name -Url $res.url -Ok $true -Status $res.status_code -Details "JSON kind ok: $ExpectedKind"
}

function Get-FirstReport {
  $res = Invoke-SmokeRequest -Name "reports catalog lookup" -Path "/reports.json"
  $data = Try-ParseJson $res.content

  if ($null -eq $data) {
    return $null
  }

  if (-not ($data.PSObject.Properties.Name -contains "reports")) {
    return $null
  }

  if ($null -eq $data.reports) {
    return $null
  }

  if ($data.reports.Count -lt 1) {
    return $null
  }

  return $data.reports[0]
}

function Get-ReportPath {
  param(
    [object]$Report,
    [string]$FieldName,
    [string]$FallbackSuffix
  )

  if ($null -eq $Report) {
    return ""
  }

  if ($Report.PSObject.Properties.Name -contains "urls") {
    $urls = $Report.urls

    if ($null -ne $urls -and $urls.PSObject.Properties.Name -contains $FieldName) {
      $value = [string]$urls.$FieldName
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        return $value
      }
    }
  }

  $slug = ""
  if ($Report.PSObject.Properties.Name -contains "slug") {
    $slug = [string]$Report.slug
  }

  if (-not [string]::IsNullOrWhiteSpace($slug)) {
    return "/reports/$slug/$FallbackSuffix"
  }

  return ""
}

$script:BaseUrlNormalized = Normalize-BaseUrl $BaseUrl

Write-Host ""
Write-Host "=== Arbitrage Nexus smoke test ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $script:BaseUrlNormalized" -ForegroundColor DarkCyan
Write-Host ""

$results = New-Object System.Collections.Generic.List[object]

$results.Add((Assert-Status -Name "home page" -Path "/" -ExpectedStatus @(200)))
$results.Add((Assert-Status -Name "reports page" -Path "/reports" -ExpectedStatus @(200)))
$results.Add((Assert-JsonKind -Name "reports.json" -Path "/reports.json" -ExpectedKind "arbitrage_nexus_public_report_catalog" -RequireNonEmpty:$RequirePublicInventory))
$results.Add((Assert-JsonKind -Name "signals.json" -Path "/signals.json" -ExpectedKind "arbitrage_nexus_public_signal_feed"))
$results.Add((Assert-JsonKind -Name "opportunities.json" -Path "/opportunities.json" -ExpectedKind "arbitrage_nexus_public_opportunity_feed"))
$results.Add((Assert-Status -Name "feed.xml" -Path "/feed.xml" -ExpectedStatus @(200)))
$results.Add((Assert-Status -Name "sitemap.xml" -Path "/sitemap.xml" -ExpectedStatus @(200)))
$results.Add((Assert-Status -Name "robots.txt" -Path "/robots.txt" -ExpectedStatus @(200)))

$firstReport = Get-FirstReport

if ($null -ne $firstReport) {
  $fullJsonPath = Get-ReportPath -Report $firstReport -FieldName "full_json" -FallbackSuffix "full.json"
  $verifyPath = Get-ReportPath -Report $firstReport -FieldName "verify_payment" -FallbackSuffix "verify-payment"

  if (-not [string]::IsNullOrWhiteSpace($fullJsonPath)) {
    $results.Add((Assert-Status -Name "locked full.json payment boundary" -Path $fullJsonPath -ExpectedStatus @(200,402)))
  }

  if (-not [string]::IsNullOrWhiteSpace($verifyPath)) {
    $results.Add((Assert-Status -Name "verify-payment requires tx hash" -Path $verifyPath -Method "POST" -Body @{} -ExpectedStatus @(400)))
  }
} else {
  $results.Add((New-Result -Name "report-specific payment checks" -Url "$script:BaseUrlNormalized/reports.json" -Ok $true -Status "SKIP" -Details "No reports found; skipped full.json and verify-payment checks"))
}

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  $results.Add((Assert-Status -Name "admin auth check protected" -Path "/api/admin/auth/check" -ExpectedStatus @(401,403)))
} else {
  $headers = @{
    "Authorization" = "Bearer $AdminToken"
    "x-admin-api-token" = $AdminToken
  }

  $results.Add((Assert-Status -Name "admin auth check with token" -Path "/api/admin/auth/check" -ExpectedStatus @(200) -Headers $headers))
  $results.Add((Assert-Status -Name "admin patch plan" -Path "/api/admin/patch-plan.json" -ExpectedStatus @(200) -Headers $headers))
}

$passed = @($results | Where-Object { $_.ok }).Count
$failed = @($results | Where-Object { -not $_.ok }).Count

foreach ($item in $results) {
  if ($item.ok) {
    Write-Host ("[PASS] {0} :: {1} :: {2}" -f $item.name, $item.status, $item.details) -ForegroundColor Green
  } else {
    Write-Host ("[FAIL] {0} :: {1} :: {2}" -f $item.name, $item.status, $item.details) -ForegroundColor Red
    Write-Host ("       {0}" -f $item.url) -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "=== Smoke summary ===" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
  exit 1
}

exit 0
