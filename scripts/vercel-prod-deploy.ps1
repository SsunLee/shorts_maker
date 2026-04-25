param(
  [switch]$Inspect
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  if (-not (Test-Path ".vercel/project.json")) {
    throw "루트(.vercel/project.json)에서 Vercel 프로젝트 링크를 찾을 수 없습니다."
  }

  $project = Get-Content -Raw ".vercel/project.json" | ConvertFrom-Json
  if ($project.projectName -ne "shorts-maker-icux") {
    Write-Warning "현재 링크된 프로젝트가 예상과 다릅니다: $($project.projectName)"
  }

  Write-Host "[deploy] repo root: $repoRoot"
  Write-Host "[deploy] project: $($project.projectName)"
  Write-Host "[deploy] running: npx vercel deploy --prod --yes --scope sunbaelees-projects"

  npx vercel deploy --prod --yes --scope sunbaelees-projects
  if ($LASTEXITCODE -ne 0) {
    throw "Vercel 배포 실패 (exit code: $LASTEXITCODE)"
  }

  if ($Inspect) {
    Write-Host "[deploy] 최근 배포 상태 확인: npx vercel ls --scope sunbaelees-projects"
    npx vercel ls --scope sunbaelees-projects
  }
} finally {
  Pop-Location
}
