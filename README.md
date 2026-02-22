# Shorts Maker

Full-stack short-video generator with:
- `web/`: Next.js 15 + React + TypeScript + TailwindCSS + shadcn/ui
- `video-engine/`: FastAPI + FFmpeg render service

## 1) Folder Structure

```text
shorts_maker/
  web/
    app/
      api/
        generate-video/route.ts
        rows/route.ts
        rows/[id]/route.ts
        sheet-rows/route.ts
        settings/route.ts
        status/[id]/route.ts
        upload-youtube/route.ts
        voice-preview/route.ts
        workflow/start/route.ts
        workflow/[id]/route.ts
        workflow/[id]/next/route.ts
        workflows/route.ts
      create/page.tsx
      dashboard/page.tsx
      ideas/page.tsx
      settings/page.tsx
      globals.css
      layout.tsx
      page.tsx
    components/
      ui/
        badge.tsx
        button.tsx
        card.tsx
        dialog.tsx
        input.tsx
        label.tsx
        progress.tsx
        select.tsx
        switch.tsx
        textarea.tsx
      app-nav.tsx
      create-video-form.tsx
      dashboard-client.tsx
      ideas-client.tsx
      progress-indicator.tsx
      settings-form.tsx
      upload-modal.tsx
      video-card.tsx
      video-list.tsx
    lib/
      generation-worker.ts
      staged-workflow.ts
      workflow-store.ts
      openai-service.ts
      google-sheets-client.ts
      repository.ts
      sheet-content.ts
      ideas-sheet.ts
      idea-generator.ts
      settings-store.ts
      status.ts
      types.ts
      utils.ts
      video-engine-service.ts
      youtube-service.ts
    data/.gitkeep
    public/generated/.gitkeep
    .env.example
    components.json
    next.config.js
    package.json
    postcss.config.js
    tailwind.config.ts
    tsconfig.json
  video-engine/
    app/
      __init__.py
      ffmpeg_builder.py
      main.py
      models.py
      subtitles.py
    assets/.gitkeep
    outputs/.gitkeep
    .env.example
    Dockerfile
    requirements.txt
  .env.example
  .gitignore
  README.md
```

## 2) Web Setup (Next.js)

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Runs at `http://localhost:3000`.

## 3) Video Engine Setup (FastAPI + FFmpeg)

Install FFmpeg first and ensure `ffmpeg`/`ffprobe` are in PATH.

```bash
cd video-engine
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env   # Windows
uvicorn app.main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

## 4) API Key Configuration

Use `/settings` in the UI or `.env.local`.

### OpenAI
- Set `OPENAI_API_KEY`
- Optional models: `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_TTS_MODEL`

### Google Sheets
- Create a Google Cloud service account
- Enable Google Sheets API
- Share the spreadsheet with service account email
- Set:
  - `GSHEETS_SPREADSHEET_ID`
  - `GSHEETS_CLIENT_EMAIL`
  - `GSHEETS_PRIVATE_KEY` (with `\n` line breaks or real multi-line)
  - `GSHEETS_SHEET_NAME` (default `Shorts`)

Required columns synced by app:
`id, title, narration, imagePrompts, status, videoUrl, youtubeUrl, tags, createdAt, updatedAt`

Content-row fetch (`/api/sheet-rows`) required columns:
- `id`
- `status` (must be `준비`)
- `keyword`
- `subject`
- `description`
- `narration`

### YouTube Data API OAuth
1. Create OAuth client in Google Cloud Console.
2. Enable YouTube Data API v3.
3. Add redirect URI (`http://localhost:3000/oauth2callback`).
4. Generate refresh token with `youtube.upload` scope.
5. Set:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REDIRECT_URI`
   - `YOUTUBE_REFRESH_TOKEN`

## 5) Vercel + Local Engine Deployment

### Deploy web to Vercel
1. Import `web/` as a Vercel project.
2. Add environment variables from `web/.env.example`.
3. Set `VIDEO_ENGINE_URL` to a reachable public URL for your FastAPI engine.

### Expose local engine securely
- ngrok:
  ```bash
  ngrok http 8000
  ```
  Use generated HTTPS URL as `VIDEO_ENGINE_URL`.

- Tailscale Funnel:
  ```bash
  tailscale funnel 8000
  ```
  Use your Funnel URL as `VIDEO_ENGINE_URL`.

## 6) API Summary

- `POST /api/generate-video`
  - Input: title/topic/narration/image style/voice/sfx/length
  - Flow: script -> image prompts -> 5 images -> TTS -> `/build-video`
- `GET /api/status/:id`
  - Returns row with current status + progress.
- `POST /api/upload-youtube`
  - Upload final video URL to YouTube.
- `POST /api/voice-preview`
  - Generate short MP3 preview for selected TTS voice.
- `GET /api/rows`
  - Dashboard polling endpoint.
- `DELETE /api/rows/:id`
  - Delete one dashboard item (row + workflow + local generated assets).
- `GET /api/sheet-rows`
  - Google Sheet content row endpoint (`id`, `status`, `keyword`, `subject`, `description`, `narration`).
  - Returns only rows where `status` is exactly `준비`.
  - Query: `sheetName` (optional tab name override)
- `GET/POST /api/settings`
  - Local integration settings storage.
- `GET/POST/DELETE /api/automation`
  - `POST`: 준비 row 자동 배치 시작 (최근 워크플로우 옵션/템플릿 기준 렌더 + 기본 YouTube 업로드 반복)
    - `uploadMode`: `youtube`(기본) | `pre_upload`(업로드 전 단계까지)
  - `GET`: 자동화 실행 상태/로그 조회
  - `DELETE`: 실행 중 자동화 중지 요청
- `GET/POST/DELETE /api/automation/schedule`
  - 주기 업로드 스케줄 설정
  - `cadence`: `interval_hours` | `daily`
  - `itemsPerRun`: 회차당 직렬 처리 개수 (예: 하루 2개)
  - `uploadMode`: `youtube` | `pre_upload`
- `GET/POST /api/automation-template`
  - `POST`: Create 화면 `[템플릿 적용]` 시 자동화 기본 템플릿 스냅샷 저장
  - `GET`: 현재 자동화 기본 템플릿 스냅샷 조회
- `GET /api/ideas/sheet`
  - 시트 헤더/행 구조를 그대로 반환(아이디어 테이블 뷰)
- `POST /api/ideas/generate`
  - 주제 + 개수(1~10)로 아이디어 JSON 배열 생성
- `POST /api/ideas/apply`
  - 생성된 아이디어를 시트 row로 append 반영
  - `idBase`를 주면 `{idBase}-001` 형식으로 `id`를 순번 발급
- `POST /api/workflow/start`
  - Start staged flow and return scene split(5) for review.
- `GET /api/workflow/:id`
  - Get current staged workflow state.
- `PATCH /api/workflow/:id`
  - Update narration/scenes during scene split review step.
- `POST /api/workflow/:id/next`
  - Run exactly one next step.
- `GET /api/workflows?activeOnly=1`
  - List resumable workflows for Create page.

### Staged Workflow Steps
1. Scene split review
2. Audio/Image review
3. Subtitle/Video validation
4. Final render ready

## 7) Progress Tracking

Statuses emitted:
- `queued`
- `generating_script`
- `generating_images`
- `generating_tts`
- `video_rendering`
- `ready`
- `uploading`
- `uploaded`
- `failed`

Dashboard and Create pages render progress bars from status.

## 8) FFmpeg Pipeline

FastAPI engine performs:
1. Download 5 images + TTS audio
2. Build SRT subtitles from narration
3. Render 9:16 Ken Burns slideshow
4. Overlay narration audio
5. Optional SFX mix (`assets/sfx.mp3` when available)
6. Burn subtitles and encode final MP4 (`libx264 + aac`)

Output files are served from `video-engine/outputs/`.
