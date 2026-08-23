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
    render_clip_sequence,
    render_short_video,
)
from app import higgsfield
from app.models import (
    BuildClipVideoRequest,
    BuildClipVideoResponse,
    BuildVideoRequest,
    BuildVideoResponse,
    ComposePageVideoRequest,
    ComposePageVideoResponse,
    HiggsfieldCostResponse,
    HiggsfieldGenerateRequest,
    HiggsfieldGenerateResponse,
    HiggsfieldJobResponse,
    HiggsfieldUploadRequest,
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

        bgm_path = None
        if payload.bgmPath:
            bgm_ext = Path(urlparse(payload.bgmPath).path).suffix or ".mp3"
            bgm_path = assets_dir / f"source-bgm{bgm_ext}"
            _download_to_path(payload.bgmPath, bgm_path)

        output_path, ffmpeg_steps = mux_video_with_audio(
            video_path=video_path,
            audio_path=audio_path,
            bgm_path=bgm_path,
            audio_volume=payload.audioVolume,
            bgm_volume=payload.bgmVolume,
            mix_with_video_audio=payload.mixWithVideoAudio,
            video_audio_volume=payload.videoAudioVolume,
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


def _require_engine_secret(secret: str | None) -> None:
    expected_secret = os.getenv("VIDEO_ENGINE_SHARED_SECRET", "").strip()
    if expected_secret and secret != expected_secret:
        raise HTTPException(status_code=401, detail="Unauthorized video engine request")


def _higgsfield_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except higgsfield.HiggsfieldError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/higgsfield/status")
def higgsfield_status(
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> dict[str, object]:
    _require_engine_secret(x_video_engine_secret)
    try:
        cli_path = higgsfield.resolve_cli_path()
    except higgsfield.HiggsfieldError as exc:
        return {"available": False, "error": str(exc)}

    try:
        account = higgsfield.account_status()
    except higgsfield.HiggsfieldError as exc:
        return {"available": False, "cliPath": cli_path, "error": str(exc)}

    return {
        "available": True,
        "cliPath": cli_path,
        "email": account.get("email", ""),
        "plan": account.get("subscription_plan_type", ""),
        "credits": account.get("credits"),
    }


@app.get("/higgsfield/models")
def higgsfield_models(
    mediaType: str = "video",
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> dict[str, object]:
    _require_engine_secret(x_video_engine_secret)
    return {"models": _higgsfield_call(higgsfield.list_models, mediaType)}


@app.get("/higgsfield/models/{job_type}")
def higgsfield_model_params(
    job_type: str,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> dict[str, object]:
    _require_engine_secret(x_video_engine_secret)
    return {"model": _higgsfield_call(higgsfield.model_params, job_type)}


@app.post("/higgsfield/cost", response_model=HiggsfieldCostResponse)
def higgsfield_cost(
    payload: HiggsfieldGenerateRequest,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> HiggsfieldCostResponse:
    _require_engine_secret(x_video_engine_secret)
    result = _higgsfield_call(higgsfield.estimate_cost, payload.jobType, payload.params)
    credits = result.get("credits")
    return HiggsfieldCostResponse(credits=float(credits) if credits is not None else None)


@app.post("/higgsfield/generate", response_model=HiggsfieldGenerateResponse)
def higgsfield_generate(
    payload: HiggsfieldGenerateRequest,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> HiggsfieldGenerateResponse:
    _require_engine_secret(x_video_engine_secret)
    job_ids = _higgsfield_call(higgsfield.create_job, payload.jobType, payload.params)
    return HiggsfieldGenerateResponse(jobIds=job_ids)


@app.get("/higgsfield/jobs/{job_id}", response_model=HiggsfieldJobResponse)
def higgsfield_job(
    job_id: str,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> HiggsfieldJobResponse:
    _require_engine_secret(x_video_engine_secret)
    job = _higgsfield_call(higgsfield.get_job, job_id)
    return HiggsfieldJobResponse(
        id=str(job.get("id", job_id)),
        status=str(job.get("status", "unknown")),
        jobType=str(job.get("job_type", "")),
        displayName=str(job.get("display_name", "")),
        resultUrl=job.get("result_url"),
        previewUrl=job.get("min_result_url"),
        error=job.get("error"),
    )


@app.post("/higgsfield/upload")
def higgsfield_upload(
    payload: HiggsfieldUploadRequest,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> dict[str, object]:
    _require_engine_secret(x_video_engine_secret)
    return {"media": _higgsfield_call(higgsfield.upload_media, payload.source)}


@app.post("/build-clip-video", response_model=BuildClipVideoResponse)
def build_clip_video(
    payload: BuildClipVideoRequest,
    request: Request,
    x_video_engine_secret: str | None = Header(default=None, alias="X-Video-Engine-Secret"),
) -> BuildClipVideoResponse:
    """Assemble AI-generated clips + narration + subtitles into a final short."""
    _require_engine_secret(x_video_engine_secret)

    job_dir = OUTPUTS_DIR / payload.jobId
    assets_dir = job_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    try:
        local_clips: list[Path] = []
        weights: list[float] = []
        clip_sfx: list[dict[str, object]] = []
        for idx, clip in enumerate(payload.clips, start=1):
            clip_ext = Path(urlparse(clip.videoUrl).path).suffix or ".mp4"
            clip_path = assets_dir / f"clip-{idx}{clip_ext}"
            _download_to_path(clip.videoUrl, clip_path)
            local_clips.append(clip_path)
            weights.append(clip.weight)

            if clip.sfxUrl:
                sfx_ext = Path(urlparse(clip.sfxUrl).path).suffix or ".mp3"
                sfx_path = assets_dir / f"sfx-{idx}{sfx_ext}"
                _download_to_path(clip.sfxUrl, sfx_path)
                clip_sfx.append({"path": str(sfx_path), "gain": clip.sfxGain})
            else:
                clip_sfx.append({})

        bgm_path: Path | None = None
        if payload.bgmUrl:
            bgm_ext = Path(urlparse(payload.bgmUrl).path).suffix or ".mp3"
            bgm_path = assets_dir / f"bgm{bgm_ext}"
            _download_to_path(payload.bgmUrl, bgm_path)

        tts_ext = Path(urlparse(payload.ttsPath).path).suffix or ".mp3"
        tts_path = assets_dir / f"tts{tts_ext}"
        _download_to_path(payload.ttsPath, tts_path)

        duration = probe_audio_duration(tts_path)
        subtitle = payload.renderOptions.subtitle if payload.renderOptions is not None else None
        manual_cues = subtitle.manualCues if subtitle is not None else []
        if manual_cues:
            srt_text = build_srt_from_cues([cue.model_dump() for cue in manual_cues], duration)
        else:
            srt_text = build_srt_from_text(
                payload.subtitlesText,
                duration,
                words_per_caption=subtitle.wordsPerCaption if subtitle else 5,
                max_chars_per_caption=subtitle.maxCharsPerCaption if subtitle else 18,
                subtitle_delay_ms=subtitle.subtitleDelayMs if subtitle else 180,
            )

        srt_path: Path | None = None
        if srt_text.strip():
            srt_path = assets_dir / "subtitles.srt"
            srt_path.write_text(srt_text, encoding="utf-8")

        output_path, ffmpeg_steps = render_clip_sequence(
            clip_paths=local_clips,
            clip_weights=weights,
            tts_path=tts_path,
            subtitle_path=srt_path,
            output_dir=job_dir,
            use_sfx=payload.useSfx,
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
            bgm_path=bgm_path,
            bgm_gain=payload.bgmGain,
            clip_sfx=clip_sfx,
        )

        base_url = os.getenv("PUBLIC_BASE_URL", str(request.base_url).rstrip("/"))
        return BuildClipVideoResponse(
            outputPath=str(output_path),
            outputUrl=f"{base_url}/outputs/{payload.jobId}/{output_path.name}",
            srtPath=str(srt_path) if srt_path is not None else "",
            ffmpegSteps=ffmpeg_steps,
        )
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=str(exc)) from exc
