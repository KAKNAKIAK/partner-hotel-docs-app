param(
  [ValidateSet("dev", "build", "preview")]
  [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$depsRoot = Join-Path $env:LOCALAPPDATA "partner-hotel-docs-deps"
$depsNodeModules = Join-Path $depsRoot "node_modules"

New-Item -ItemType Directory -Force -Path $depsRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "package.json") -Destination (Join-Path $depsRoot "package.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "vite.config.js") -Destination (Join-Path $depsRoot "vite.config.js") -Force

Push-Location $depsRoot
try {
  npm install
} finally {
  Pop-Location
}

$env:NODE_PATH = $depsNodeModules
$vite = Join-Path $depsNodeModules ".bin\vite.cmd"
$config = Join-Path $depsRoot "vite.config.js"

if ($Mode -eq "dev") {
  & $vite --host 127.0.0.1 --port 5173 --config $config
} elseif ($Mode -eq "preview") {
  & $vite preview --host 127.0.0.1 --port 4173 --config $config
} else {
  & $vite build --config $config
}
