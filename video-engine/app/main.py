from __future__ import annotations

import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.ffmpeg_builder import (
    compose_page_video_with_layers,
    mux_video_with_audio,
    probe_audio_duration,
    render_short_video,
)
from app.models import (
    BuildVideoRequest,
    BuildVideoResponse,
    ComposePageVideoRequest,
    ComposePageVideoResponse,
    MuxVideoAudioRequest,
    MuxVideoAudioResponse,
)
from app.subtitles import build_srt_from_cues, build_srt_from_text


BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUTS_DIR = BASE_DIR / "outputs"

app = FastAPI(title="Shorts Video Engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")


def _download_to_path(source: str, destination: Path) -> None:
    if source.startswith("http://") or source.startswith("https://"):
        response = requests.get(source, timeout=60)
        if response.status_code >= 400:
            raise RuntimeError(f"Failed to download asset: {source}")
        destination.write_bytes(response.content)
        return

    parsed = urlparse(source)
    local_candidate = Path(parsed.path if parsed.scheme == "file" else source)
    if not local_candidate.exists():
        raise RuntimeError(f"Local asset does not exist: {source}")
    shutil.copy(local_candidate, destination)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/build-video", response_model=BuildVideoResponse)
def build_video(
    payload: BuildVideoRequest,
    request: Request,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> BuildVideoResponse:
    expected_secret = os.getenv("VIDEO_ENGINE_SHARED_SECRET", "").strip()
    if expected_secret and x_video_engine_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized video engine request")

    job_dir = OUTPUTS_DIR / payload.jobId
    assets_dir = job_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    try:
        local_images: list[Path] = []
        for idx, image_url in enumerate(payload.imageUrls, start=1):
            image_ext = Path(urlparse(image_url).path).suffix or ".png"
            image_path = assets_dir / f"image-{idx}{image_ext}"
            _download_to_path(image_url, image_path)
            local_images.append(image_path)

        tts_ext = Path(urlparse(payload.ttsPath).path).suffix or ".mp3"
        tts_path = assets_dir / f"tts{tts_ext}"
        _download_to_path(payload.ttsPath, tts_path)

        # Keep subtitles and video synced to the actual narration audio duration.
        duration = probe_audio_duration(tts_path)
        words_per_caption = (
            payload.renderOptions.subtitle.wordsPerCaption
            if payload.renderOptions is not None
            else 5
        )
        max_chars_per_caption = (
            payload.renderOptions.subtitle.maxCharsPerCaption
            if payload.renderOptions is not None
            else 18
        )
        subtitle_delay_ms = (
            payload.renderOptions.subtitle.subtitleDelayMs
            if payload.renderOptions is not None
            else 180
        )
        manual_cues = (
            payload.renderOptions.subtitle.manualCues
            if payload.renderOptions is not None
            else []
        )
        if manual_cues:
            srt_text = build_srt_from_cues(
                [cue.model_dump() for cue in manual_cues],
                duration,
            )
        else:
            srt_text = build_srt_from_text(
                payload.subtitlesText,
                duration,
                words_per_caption=words_per_caption,
                max_chars_per_caption=max_chars_per_caption,
                subtitle_delay_ms=subtitle_delay_ms,
            )
        srt_path: Path | None = None
        if srt_text.strip():
            srt_path = assets_dir / "subtitles.srt"
            srt_path.write_text(srt_text, encoding="utf-8")

        output_path, ffmpeg_steps = render_short_video(
            image_paths=local_images,
            tts_path=tts_path,
            subtitle_path=srt_path,
            output_dir=job_dir,
            use_sfx=payload.useSfx,
            target_duration_sec=duration,
            subtitle_options=(
                payload.renderOptions.subtitle.model_dump()
                if payload.renderOptions is not None
                else None
            ),
            overlay_options=(
                payload.renderOptions.overlay.model_dump()
                if payload.renderOptions is not None
                else None
            ),
            title_text=payload.titleText,
        )

        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        output_url = f"{base_url}/outputs/{payload.jobId}/{output_path.name}"
        return BuildVideoResponse(
            outputPath=str(output_path),
            outputUrl=output_url,
            srtPath=str(srt_path) if srt_path is not None else "",
            ffmpegSteps=ffmpeg_steps,
        )
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/mux-video-audio", response_model=MuxVideoAudioResponse)
def mux_video_audio(
    payload: MuxVideoAudioRequest,
    request: Request,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> MuxVideoAudioResponse:
    expected_secret = os.getenv("VIDEO_ENGINE_SHARED_SECRET", "").strip()
    if expected_secret and x_video_engine_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized video engine request")

    job_dir = OUTPUTS_DIR / payload.jobId
    assets_dir = job_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    try:
        video_ext = Path(urlparse(payload.videoPath).path).suffix or ".mp4"
        video_path = assets_dir / f"source-video{video_ext}"
        _download_to_path(payload.videoPath, video_path)

        audio_ext = Path(urlparse(payload.audioPath).path).suffix or ".mp3"
        audio_path = assets_dir / f"source-audio{audio_ext}"
        _download_to_path(payload.audioPath, audio_path)

        output_path, ffmpeg_steps = mux_video_with_audio(
            video_path=video_path,
            audio_path=audio_path,
            output_dir=job_dir,
            duration_sec=payload.durationSec,
        )

        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        output_url = f"{base_url}/outputs/{payload.jobId}/{output_path.name}"
        return MuxVideoAudioResponse(
            outputPath=str(output_path),
            outputUrl=output_url,
            ffmpegSteps=ffmpeg_steps,
        )
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/compose-page-video", response_model=ComposePageVideoResponse)
def compose_page_video(
    payload: ComposePageVideoRequest,
    request: Request,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> ComposePageVideoResponse:
    expected_secret = os.getenv("VIDEO_ENGINE_SHARED_SECRET", "").strip()
    if expected_secret and x_video_engine_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized video engine request")

    job_dir = OUTPUTS_DIR / payload.jobId
    assets_dir = job_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    try:
        video_ext = Path(urlparse(payload.videoPath).path).suffix or ".mp4"
        video_path = assets_dir / f"source-video{video_ext}"
        _download_to_path(payload.videoPath, video_path)

        underlay_path = assets_dir / "underlay.png"
        _download_to_path(payload.underlayPath, underlay_path)

        overlay_path = assets_dir / "overlay.png"
        _download_to_path(payload.overlayPath, overlay_path)

        output_path, ffmpeg_steps = compose_page_video_with_layers(
            video_path=video_path,
            underlay_path=underlay_path,
            overlay_path=overlay_path,
            output_dir=job_dir,
            x=payload.x,
            y=payload.y,
            width=payload.width,
            height=payload.height,
            output_width=payload.outputWidth,
            output_height=payload.outputHeight,
            fit=payload.fit,
            duration_sec=payload.durationSec,
        )

        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        output_url = f"{base_url}/outputs/{payload.jobId}/{output_path.name}"
        return ComposePageVideoResponse(
            outputPath=str(output_path),
            outputUrl=output_url,
            ffmpegSteps=ffmpeg_steps,
        )
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(exc)) from exc
