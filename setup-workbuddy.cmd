@echo off
net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $f=Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'; Copy-Item $f ($f+'.workbuddy-backup') -Force; $lines=@(Get-Content $f | Where-Object { $_ -notmatch '^\s*[^#\s]+\s+(www\.)?workbuddy\.ai(\s|$)' }); $lines += '43.169.32.91 workbuddy.ai'; $lines += '43.169.32.91 www.workbuddy.ai'; Set-Content -Path $f -Value $lines -Encoding ASCII; $adapters=@(Get-NetAdapter -Physical | Where-Object Status -eq 'Up'); if ($adapters.Count -eq 0) { Write-Warning 'No active physical adapter found. Connect to Wi-Fi or Ethernet and run again.' } else { $adapters | Set-DnsClientServerAddress -ServerAddresses ('1.1.1.1','1.0.0.1') }; Clear-DnsClientCache; Write-Host 'WorkBuddy hosts entries:'; Select-String -Path $f -Pattern 'workbuddy\.ai'; Write-Host 'DNS settings:'; $adapters | Get-DnsClientServerAddress -AddressFamily IPv4 | Format-Table InterfaceAlias,ServerAddresses"
if errorlevel 1 echo Setup failed. Check the error above.
echo.
pause
