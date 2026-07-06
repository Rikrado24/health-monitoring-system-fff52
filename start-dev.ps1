$ErrorActionPreference = "Stop"

$nodeDir = Join-Path $env:ProgramFiles "nodejs"
$npmCmd = Join-Path $nodeDir "npm.cmd"

if (-not (Test-Path $npmCmd)) {
  Write-Error "Node.js tidak ditemukan di '$npmCmd'. Install Node.js LTS lalu coba lagi."
}

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = @($nodeDir)

foreach ($pathValue in @($machinePath, $userPath, $env:Path)) {
  if (-not $pathValue) {
    continue
  }

  foreach ($part in $pathValue -split ";") {
    $trimmed = $part.Trim()
    if (-not $trimmed) {
      continue
    }
    if ($pathParts -notcontains $trimmed) {
      $pathParts += $trimmed
    }
  }
}

$env:Path = $pathParts -join ";"

& $npmCmd run dev
