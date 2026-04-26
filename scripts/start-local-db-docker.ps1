$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\tnsqo\sunbae\shorts_maker"
$WebDir = Join-Path $ProjectRoot "web"
$ContainerName = "shorts-maker-postgres"
$VolumeName = "shorts-maker-postgres-data"
$DbPort = "55432"
$DatabaseUrl = "postgresql://postgres:postgres@localhost:$DbPort/shorts_maker?schema=public"

function Wait-Docker {
  $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

  docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  if (Test-Path $dockerDesktop) {
    Write-Host "Starting Docker Desktop..."
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  Write-Host "Waiting for Docker engine..."
  for ($i = 1; $i -le 90; $i++) {
    Start-Sleep -Seconds 2
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
  }

  throw "Docker engine is not ready. Open Docker Desktop, wait until it finishes starting, then run this script again."
}

function Test-ContainerExists {
  $id = docker ps -a --filter "name=^/$ContainerName$" --format "{{.ID}}"
  return -not [string]::IsNullOrWhiteSpace($id)
}

function Test-ContainerRunning {
  $id = docker ps --filter "name=^/$ContainerName$" --format "{{.ID}}"
  return -not [string]::IsNullOrWhiteSpace($id)
}

Wait-Docker

if (Test-ContainerExists) {
  if (Test-ContainerRunning) {
    Write-Host "Postgres container is already running: $ContainerName"
  } else {
    Write-Host "Starting existing Postgres container: $ContainerName"
    docker start $ContainerName | Out-Host
  }
} else {
  Write-Host "Creating Postgres container: $ContainerName"
  docker run -d `
    --name $ContainerName `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=postgres `
    -e POSTGRES_DB=shorts_maker `
    -p "${DbPort}:5432" `
    -v "${VolumeName}:/var/lib/postgresql/data" `
    postgres:16-alpine | Out-Host
}

Write-Host "Waiting for Postgres readiness..."
for ($i = 1; $i -le 60; $i++) {
  $ready = docker exec $ContainerName pg_isready -U postgres -d shorts_maker 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host $ready
    break
  }
  if ($i -eq 60) {
    throw "Postgres did not become ready in time."
  }
  Start-Sleep -Seconds 1
}

if (Test-Path (Join-Path $WebDir "package.json")) {
  Write-Host "Applying Prisma schema to local DB..."
  Push-Location $WebDir
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npx prisma db push
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Local Postgres is ready."
Write-Host "DATABASE_URL=$DatabaseUrl"
Write-Host ""
Write-Host "Container: $ContainerName"
Write-Host "Stop command: docker stop $ContainerName"
