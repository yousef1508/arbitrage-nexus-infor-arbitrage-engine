param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [string]$AdminToken = "",

  [switch]$TriggerIngest,

  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "===============================================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "===============================================================================" -ForegroundColor DarkGray
}

function Join-Url {
  param(
    [string]$Base,
    [string]$Path
  )

  return "$($Base.TrimEnd('/'))/$($Path.TrimStart('/'))"
}

function Invoke-Check {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [int[]]$ExpectedStatuses = @(200),
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $url = Join-Url $BaseUrl $Path

  Write-Host ""
  Write-Host "[$Name]" -ForegroundColor Yellow
  Write-Host "$Method $url" -ForegroundColor DarkGray

  try {
    $requestParams = @{
      Uri = $url
      Method = $Method
      TimeoutSec = $TimeoutSec
      Headers = $Headers
      SkipHttpErrorCheck = $true
    }

    if ($null -ne $Body) {
      $requestParams.Body = ($Body | ConvertTo-Json -Depth 8)
      $requestParams.ContentType = "application/json"
    }

    $response = Invoke-WebRequest @requestParams
    $status = [int]$response.StatusCode

    if ($ExpectedStatuses -notcontains $status) {
      Write-Host "FAIL status=$status expected=$($ExpectedStatuses -join ',')" -ForegroundColor Red
      Write-Host $response.Content.Substring(0, [Math]::Min(1000, $response.Content.Length)) -ForegroundColor DarkRed
      return $false
    }

    Write-Host "OK status=$status" -ForegroundColor Green

    if ($response.Content) {
      $preview = $response.Content.Substring(0, [Math]::Min(500, $response.Content.Length))
      Write-Host $preview -ForegroundColor DarkGray
    }

    return $true
  }
  catch {
    Write-Host "ERROR $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

$BaseUrl = $BaseUrl.TrimEnd("/")

Write-Section "Production Check"

Write-Host "Base URL: $BaseUrl" -ForegroundColor Cyan
Write-Host "Admin token provided: $([bool]![string]::IsNullOrWhiteSpace($AdminToken))" -ForegroundColor Cyan

$passed = 0
$failed = 0

function Record-Result {
  param([bool]$Result)

  if ($Result) {
    $script:passed += 1
  }
  else {
    $script:failed += 1
  }
}

Write-Section "Public Health / Market Endpoints"

Record-Result (Invoke-Check `
  -Name "API Health" `
  -Method "GET" `
  -Path "/api/health" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Public Reports Page" `
  -Method "GET" `
  -Path "/reports" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Reports JSON" `
  -Method "GET" `
  -Path "/reports.json" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "API Reports JSON" `
  -Method "GET" `
  -Path "/api/reports.json" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Signals JSON" `
  -Method "GET" `
  -Path "/signals.json" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Opportunities JSON" `
  -Method "GET" `
  -Path "/opportunities.json" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Market Stats JSON" `
  -Method "GET" `
  -Path "/market-stats.json" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Feed XML" `
  -Method "GET" `
  -Path "/feed.xml" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Sitemap XML" `
  -Method "GET" `
  -Path "/sitemap.xml" `
  -ExpectedStatuses @(200))

Record-Result (Invoke-Check `
  -Name "Robots TXT" `
  -Method "GET" `
  -Path "/robots.txt" `
  -ExpectedStatuses @(200))

Write-Section "Owner Guard Checks"

Record-Result (Invoke-Check `
  -Name "Private Stats Without Token Should Be Blocked" `
  -Method "GET" `
  -Path "/api/system/stats" `
  -ExpectedStatuses @(401, 403))

if (![string]::IsNullOrWhiteSpace($AdminToken)) {
  $adminHeaders = @{
    Authorization = "Bearer $AdminToken"
    Accept = "application/json"
  }

  Record-Result (Invoke-Check `
    -Name "Private Stats With Admin Token" `
    -Method "GET" `
    -Path "/api/system/stats" `
    -ExpectedStatuses @(200) `
    -Headers $adminHeaders)

  if ($TriggerIngest) {
    Write-Section "Manual Ingest Trigger"

    Record-Result (Invoke-Check `
      -Name "Trigger Ingest" `
      -Method "POST" `
      -Path "/api/system/ingest" `
      -ExpectedStatuses @(200, 202, 409) `
      -Headers $adminHeaders `
      -Body @{
        trigger = "check-production"
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      })
  }
}
else {
  Write-Host ""
  Write-Host "Admin token not provided. Skipping authenticated stats/ingest checks." -ForegroundColor DarkYellow
}

Write-Section "Summary"

Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -gt 0) {
  exit 1
}

exit 0