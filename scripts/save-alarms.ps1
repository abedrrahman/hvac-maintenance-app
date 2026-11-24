# Saves the website's alarm list into the app (assets/data/alarms.json), so a new install has it with no internet.
# Run it yourself: it asks for the password on screen and never stores it.
# Note: signing in gives this user a new token, so the same user is signed out on their phone.
param([string]$Site = (Read-Host 'Website address (https://...)'))

$ErrorActionPreference = 'Stop'
$Site = $Site.Trim().TrimEnd('/')
if ($Site -notmatch '^https?://') { $Site = "https://$Site" }
$user = Read-Host 'Username'
$secret = Read-Host 'Password' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret))

$login = Invoke-RestMethod -Method Post -Uri "$Site/api/login/" -ContentType 'application/json' `
  -Body (@{ username = $user; password = $password } | ConvertTo-Json)
$password = $null
$response = Invoke-WebRequest -UseBasicParsing -Uri "$Site/api/alarms/?have=" -Headers @{ Authorization = "Token $($login.token)" }

$out = Join-Path $PSScriptRoot '..\assets\data\alarms.json'
# raw bytes: the Arabic text must stay exactly as the website sent it
[IO.File]::WriteAllBytes($out, $response.RawContentStream.ToArray())
$data = Get-Content $out -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "Saved $($data.alarms.Count) alarms (version $($data.version)) to $out"
