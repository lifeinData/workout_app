# Let a REMOTE tester (any Wi-Fi / cellular) use the app in Expo Go.
#
#   1. Start the backend first, in its own terminal:  cd backend; .\run.bat
#   2. Then run:  powershell -ExecutionPolicy Bypass -File .\share.ps1
#   3. Send the tester the QR code / exp:// link Metro prints.
#
# What it does: opens a free Cloudflare quick tunnel to the backend (:8000, no
# account needed), bakes that public URL into the bundle via
# EXPO_PUBLIC_API_BASE_URL, and starts Metro in --tunnel mode. Ctrl+C stops
# Metro and the backend tunnel. The tunnel URL changes on every run, which is
# fine - this script re-bakes it each time (that's why it uses --clear).

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

try {
  Invoke-RestMethod http://localhost:8000/api/v1/health -TimeoutSec 3 | Out-Null
} catch {
  Write-Host "Backend isn't running on :8000. Start it first: cd backend; .\run.bat" -ForegroundColor Red
  exit 1
}

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }

$log = Join-Path $env:TEMP 'workout_app_cloudflared.log'
Remove-Item $log -ErrorAction SilentlyContinue
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:8000' `
  -RedirectStandardError $log -WindowStyle Hidden -PassThru

try {
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { throw "cloudflared didn't report a tunnel URL - see $log" }

  # Check it end-to-end via Cloudflare's resolver: this PC's DNS (VPN) can take
  # minutes to resolve a brand-new hostname, though the tester's phone won't care.
  $hostName = $url -replace '^https://', ''
  $ok = $false
  for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    $ip = (Resolve-DnsName $hostName -Server 1.1.1.1 -Type A -ErrorAction SilentlyContinue |
      Where-Object IPAddress | Select-Object -First 1).IPAddress
    if ($ip) {
      $body = curl.exe -s -m 10 --resolve "${hostName}:443:$ip" "$url/api/v1/health"
      $ok = "$body" -match '"ok"'
    }
  }
  if (-not $ok) { Write-Host "Warning: $url isn't answering yet; it usually does within a minute." -ForegroundColor Yellow }

  Write-Host "Backend tunnel: $url" -ForegroundColor Green
  $env:EXPO_PUBLIC_API_BASE_URL = "$url/api/v1"
  npx expo start --tunnel --clear
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
}
