<#
.SYNOPSIS
  Fire a fake transaction at /api/ingest - test the ingestion feature without using Apple Pay.

.DESCRIPTION
  The iOS Shortcut is just an HTTP POST, so "does tapping my card create an entry?" is the same
  as "does POST /api/ingest with this body create an entry?". This script sends that POST so you
  can test end-to-end (local `netlify dev` or production) with no phone and no real purchase.

.PARAMETER Url
  Base site URL. Default http://localhost:8888 (netlify dev). For prod pass
  https://your-site.netlify.app

.PARAMETER Token
  INGEST_TOKEN. Defaults to $env:INGEST_TOKEN, then "devtoken".

.PARAMETER Kind
  apple_pay (default) or dbs_email.

.PARAMETER Amount
  Transaction amount for apple_pay. Default 12.50.

.PARAMETER Merchant
  Merchant name for apple_pay. Default "Test Cafe".

.PARAMETER RawBody
  Raw email text for dbs_email (ignored for apple_pay).

.PARAMETER Currency
  ISO currency. Default SGD.

.PARAMETER IdempotencyKey
  Stable key reused when testing Apple Pay retries. Change it to simulate a distinct transaction.

.EXAMPLE
  ./scripts/test-ingest.ps1
  # fires a 12.50 apple_pay "Test Cafe" at local netlify dev

.EXAMPLE
  ./scripts/test-ingest.ps1 -Amount 4.50 -Merchant "Ya Kun"

.EXAMPLE
  ./scripts/test-ingest.ps1 -Url https://your-site.netlify.app -Token $env:INGEST_TOKEN

.EXAMPLE
  ./scripts/test-ingest.ps1 -Kind dbs_email -RawBody "Amount: SGD 12.00`nTo: NTUC FAIRPRICE"
#>
[CmdletBinding()]
param(
  [string]$Url = 'http://localhost:8888',
  [string]$Token = $(if ($env:INGEST_TOKEN) { $env:INGEST_TOKEN } else { 'devtoken' }),
  [ValidateSet('apple_pay', 'dbs_email')]
  [string]$Kind = 'apple_pay',
  [double]$Amount = 12.50,
  [string]$Merchant = 'Test Cafe',
  [string]$RawBody = "Amount: SGD 12.00`nTo: NTUC FAIRPRICE",
  [string]$Currency = 'SGD',
  [string]$IdempotencyKey = 'test-apple-pay-transaction'
)

$baseUrl = $Url.TrimEnd('/')
if ($baseUrl -match '/(api/ingest|functions/v1/ingest)$') {
  $endpoint = $baseUrl
}
elseif ($baseUrl -match '\.supabase\.co$') {
  $endpoint = "$baseUrl/functions/v1/ingest"
}
else {
  $endpoint = "$baseUrl/api/ingest"
}
$occurredAt = (Get-Date).ToString('o')  # ISO 8601 with offset, like the Shortcut sends

if ($Kind -eq 'apple_pay') {
  $payload = [ordered]@{
    sourceKind = 'apple_pay'
    amount     = $Amount
    merchant   = $Merchant
    occurredAt = $occurredAt
    currency   = $Currency
    idempotencyKey = $IdempotencyKey
  }
} else {
  $payload = [ordered]@{
    sourceKind = 'dbs_email'
    rawBody    = $RawBody
    occurredAt = $occurredAt
    currency   = $Currency
  }
}

$body = $payload | ConvertTo-Json -Depth 5

Write-Host "POST $endpoint" -ForegroundColor Cyan
Write-Host $body -ForegroundColor DarkGray

try {
  $res = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -Headers @{
    Authorization  = "Bearer $Token"
    'Content-Type' = 'application/json'
  }
  Write-Host "`n-> $($res.status)" -ForegroundColor Green
  $res | ConvertTo-Json -Depth 5
}
catch {
  $resp = $_.Exception.Response
  if ($resp) {
    $status = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    Write-Host "`n-> HTTP $status" -ForegroundColor Red
    if ($text) { Write-Host $text }
    if ($status -eq 401) { Write-Host "Token mismatch - pass -Token or set `$env:INGEST_TOKEN to match the server." -ForegroundColor Yellow }
  }
  else {
    Write-Host "`n-> request failed (no HTTP response)" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host "Is the server running? Start it with: npx netlify dev (and set `$env:INGEST_TOKEN first)." -ForegroundColor Yellow
  }
  exit 1
}
