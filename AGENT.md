# AGENT Rules (Production Safety)

이 문서는 `shorts_maker` 저장소에서 운영 사고를 방지하기 위한 필수 규칙입니다.

## UI/UX 품질 원칙

- 프런트엔드 작업 시 기능 구현만 완료하지 말고, **shadcn/ui 기반의 일관된 최신 UI/UX**를 함께 반영한다.
- 모든 신규/수정 UI는 반응형(모바일/데스크톱), 가독성(간격/타이포), 상호작용 상태(hover/active/disabled), 접근성(명확한 라벨/버튼 의미)을 기본 점검한다.
- "동작함"보다 "사용자가 즉시 이해하고 실수 없이 쓸 수 있음"을 우선 기준으로 삼는다.

## 1) Vercel 프로젝트 생성/링크

- 운영 웹 프로젝트는 **오직** `sunbaelees-projects/shorts-maker-icux`만 사용한다.
- 사용자의 명시적 요청 없이 새로운 Vercel 프로젝트를 생성하지 않는다.
- `vercel link` 실행 시 반드시 프로젝트/스코프를 명시한다.
  - `npx vercel link --yes --project shorts-maker-icux --scope sunbaelees-projects`
- `--project`를 명시하지 않은 `vercel link --yes`는 금지한다.

## 2) Production 배포 원칙

- 기본 원칙: `main` 기준 배포만 진행한다.
- 가능하면 CI 배포를 우선 사용하고, 수동 CLI 배포는 예외 상황에서만 사용한다.
- 수동 CLI 배포 시 아래 순서를 반드시 지킨다.
  1. 현재 브랜치 확인: `main`
  2. 링크 확인: `.vercel/project.json`이 `shorts-maker-icux`인지 확인
  3. 배포 실행(레포 루트): `npx vercel deploy --prod --yes --scope sunbaelees-projects`
  4. 배포 확인: `npx vercel inspect <deployment-url> --scope sunbaelees-projects`

## 3) Root Directory 규칙

- 현재 Vercel 프로젝트의 Root Directory는 `web`이다.
- 따라서 `web/` 디렉터리에서 `vercel deploy`를 실행하면 `web/web` 경로 오류가 날 수 있다.
- 배포는 **레포 루트**(`shorts_maker/`)에서 실행한다.
- 재발 방지를 위해 배포는 아래 스크립트를 우선 사용한다.
  - `powershell -ExecutionPolicy Bypass -File scripts/vercel-prod-deploy.ps1`

## 4) 사고 대응 규칙

- 잘못 생성된 프로젝트가 생기면 즉시 목록 확인 후 제거한다.
  - `npx vercel projects ls --scope sunbaelees-projects`
  - `npx vercel project rm <project-name> --scope sunbaelees-projects`
- 사용자 요청이 없는 임의 롤백/리셋은 금지한다.

## 5) 변경/보고 규칙

- 배포 후 아래를 반드시 공유한다.
  - deployment id
  - production URL
  - alias 연결 상태
  - 빌드/런타임 경고 여부
