# Signs the built release app with the company's own key and puts it on the Desktop.
# Run after:  cd android; .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
# The key lives outside the project (the android folder is regenerated). Losing the key or its password
# means phones can no longer be updated without uninstalling the app first: keep a backup of both files.
$keys = "$env:USERPROFILE\asee-signing"
$tools = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" | Sort-Object Name | Select-Object -Last 1
$out = "$env:USERPROFILE\Desktop\ASEE-HVAC-Reports-1.0.0.apk"
& "$($tools.FullName)\apksigner.bat" sign --ks "$keys\asee-release.keystore" --ks-pass "file:$keys\asee-release-password.txt" `
  --out $out "$PSScriptRoot\..\android\app\build\outputs\apk\release\app-release.apk"
if ($LASTEXITCODE -ne 0) { throw 'Signing failed' }
Remove-Item "$out.idsig" -ErrorAction SilentlyContinue
& "$($tools.FullName)\apksigner.bat" verify --print-certs $out | Select-String 'SHA-256'
