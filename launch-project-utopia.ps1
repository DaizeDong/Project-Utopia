$ErrorActionPreference = 'Stop'

function Show-LauncherError($Message) {
  Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
  try {
    [System.Windows.MessageBox]::Show($Message, 'Project Utopia Launcher', 'OK', 'Error') | Out-Null
  } catch {
    Write-Error $Message
  }
}

function Get-BrowserExecutable {
  $candidates = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  throw 'Neither Microsoft Edge nor Google Chrome was found on this machine.'
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = Join-Path $Root 'runtime\node.exe'
$ServerScript = Join-Path $Root 'desktop\serve-app.mjs'
$UrlFile = Join-Path $env:TEMP ("project-utopia-url-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
$ServerStdout = Join-Path $env:TEMP ("project-utopia-server-{0}.out.log" -f ([guid]::NewGuid().ToString('N')))
$ServerStderr = Join-Path $env:TEMP ("project-utopia-server-{0}.err.log" -f ([guid]::NewGuid().ToString('N')))
$serverProc = $null
$browserProc = $null
$browserProfileDir = $null

try {
  if (-not (Test-Path $NodeExe)) {
    throw "Bundled Node runtime not found: $NodeExe"
  }
  $serverArgs = "`"$ServerScript`" --url-file `"$UrlFile`""
  $serverProc = Start-Process -FilePath $NodeExe -ArgumentList $serverArgs -WorkingDirectory $Root -PassThru -WindowStyle Hidden -RedirectStandardOutput $ServerStdout -RedirectStandardError $ServerStderr

  for ($i = 0; $i -lt 100; $i += 1) {
    if (Test-Path $UrlFile) { break }
    Start-Sleep -Milliseconds 100
  }

  if (-not (Test-Path $UrlFile)) {
    $stdoutDetails = if (Test-Path $ServerStdout) { Get-Content -Raw $ServerStdout } else { '' }
    $stderrDetails = if (Test-Path $ServerStderr) { Get-Content -Raw $ServerStderr } else { '' }
    $details = ($stdoutDetails + "`n" + $stderrDetails).Trim()
    if (-not $details) { $details = 'No launcher log available.' }
    throw "Local app server did not start in time.`n`n$details"
  }

  $url = (Get-Content -Raw $UrlFile).Trim()
  if (-not $url) {
    throw 'Launcher received an empty app URL from the local server.'
  }

  $browserExe = Get-BrowserExecutable
  $browserProfileDir = Join-Path $env:TEMP ("ProjectUtopiaBrowserApp-{0}" -f ([guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Force $browserProfileDir | Out-Null

  $browserArgs = "--app=$url --user-data-dir=`"$browserProfileDir`""
  $browserProc = Start-Process -FilePath $browserExe -ArgumentList $browserArgs -WorkingDirectory $Root -PassThru

  $browserStarted = $false
  for ($i = 0; $i -lt 100; $i += 1) {
    $browserCount = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      ($_.Name -eq "msedge.exe" -or $_.Name -eq "chrome.exe") -and $_.CommandLine -like "*$browserProfileDir*"
    }).Count
    if ($browserCount -gt 0) {
      $browserStarted = $true
      break
    }
    Start-Sleep -Milliseconds 100
  }

  if (-not $browserStarted) {
    throw "Browser app window did not start."
  }

  while (@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.Name -eq "msedge.exe" -or $_.Name -eq "chrome.exe") -and $_.CommandLine -like "*$browserProfileDir*"
  }).Count -gt 0) {
    Start-Sleep -Seconds 1
  }
} catch {
  Show-LauncherError ([string]$_)
} finally {
  if ($browserProc -and -not $browserProc.HasExited) {
    Stop-Process -Id $browserProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($serverProc -and -not $serverProc.HasExited) {
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $UrlFile -Force -ErrorAction SilentlyContinue
}

