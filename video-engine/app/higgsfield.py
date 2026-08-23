"""Higgsfield CLI executor.

The Higgsfield REST gateway sanitizes the `X-Fnf-*` headers it requires, so the
official CLI is the only supported way to drive generations. The CLI stores its
OAuth credentials under the user profile and refreshes them on its own, which
means this module only has to translate JSON payloads into CLI arguments.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any


class HiggsfieldError(RuntimeError):
    """Raised when the CLI is missing or returns a non-zero exit code."""


DEFAULT_WINDOWS_CLI = (
    Path(os.environ.get("APPDATA", ""))
    / "npm"
    / "node_modules"
    / "@higgsfield"
    / "cli"
    / "vendor"
    / "hf.exe"
)
DEFAULT_TIMEOUT_SEC = 120


def resolve_cli_path() -> str:
    """Locate the `hf` binary, preferring an explicit override."""
    explicit = os.getenv("HIGGSFIELD_CLI_PATH", "").strip()
    if explicit:
        if not Path(explicit).exists():
            raise HiggsfieldError(f"HIGGSFIELD_CLI_PATH does not exist: {explicit}")
        return explicit

    for candidate in ("hf", "higgsfield", "higgs"):
        found = shutil.which(candidate)
        if found:
            return found

    if DEFAULT_WINDOWS_CLI.exists():
        return str(DEFAULT_WINDOWS_CLI)

    raise HiggsfieldError(
        "Higgsfield CLI not found. Install it with `npm i -g @higgsfield/cli` "
        "or set HIGGSFIELD_CLI_PATH."
    )


def _run(args: list[str], timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> Any:
    cli = resolve_cli_path()
    command = [cli, "--json", *args]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            # The CLI emits UTF-8; on Windows the default locale codec (cp949)
            # chokes on it and kills the reader thread mid-response.
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise HiggsfieldError(f"Higgsfield CLI timed out after {timeout_sec}s") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        raise HiggsfieldError(detail or f"Higgsfield CLI exited with {completed.returncode}")

    stdout = (completed.stdout or "").strip()
    if not stdout:
        return None
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise HiggsfieldError(f"Higgsfield CLI returned non-JSON output: {stdout[:400]}") from exc


def _flag_name(param: str) -> str:
    return "--" + param.strip().replace("_", "-")


def _scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


MEDIA_PARAMS = {
    "start_image": "--start-image",
    "end_image": "--end-image",
    "image_references": "--image-references",
    "video_references": "--video-references",
    "audio_references": "--audio-references",
}

MIN_CLIP_DURATION_SEC = 4

# A prompt containing newlines is read as a multi-shot request and billed per
# shot, so prompts are always collapsed onto one line before they are sent.
PROMPT_PARAMS = ("prompt", "negative_prompt")


def flatten_prompt(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    return " ".join(value.split())

_MODEL_PARAM_CACHE: dict[str, list[dict[str, Any]]] = {}


def _model_param_specs(job_type: str) -> list[dict[str, Any]]:
    """Fetch and cache a model's declared parameters."""
    if job_type not in _MODEL_PARAM_CACHE:
        spec = model_params(job_type)
        raw = spec.get("params") if isinstance(spec, dict) else None
        if raw is None and isinstance(spec, list):
            raw = spec
        _MODEL_PARAM_CACHE[job_type] = [item for item in (raw or []) if isinstance(item, dict)]
    return _MODEL_PARAM_CACHE[job_type]


def _nearest_allowed(value: Any, options: list[str]) -> Any:
    """Snap a numeric value to the closest allowed enum entry."""
    numeric: list[float] = []
    for option in options:
        try:
            numeric.append(float(option))
        except (TypeError, ValueError):
            return value
    try:
        target = float(value)
    except (TypeError, ValueError):
        return value
    best = min(numeric, key=lambda candidate: abs(candidate - target))
    return int(best) if best.is_integer() else best


def normalize_params(job_type: str, params: dict[str, Any]) -> dict[str, Any]:
    """Drop params a model does not accept and snap enums to allowed values.

    Models differ widely — Veo 3.1 Lite takes no `resolution` and only 4/6/8
    second durations, while Seedance takes both — and the API rejects unknown
    params outright, so filtering here keeps one caller shape working for all.
    """
    try:
        specs = _model_param_specs(job_type)
    except HiggsfieldError:
        return params
    if not specs:
        return params

    allowed = {str(spec.get("name")): spec for spec in specs if spec.get("name")}
    normalized: dict[str, Any] = {}
    for key, value in params.items():
        spec = allowed.get(key)
        if spec is None:
            continue
        options = spec.get("enum")
        if isinstance(options, list) and options:
            options = [str(option) for option in options]
            if str(value) not in options:
                value = _nearest_allowed(value, options)
        elif key in PROMPT_PARAMS:
            value = flatten_prompt(value)
        elif key == "duration":
            # No model sells clips shorter than this, and the enum-free models
            # only surface the floor as a server-side validation error.
            try:
                value = max(MIN_CLIP_DURATION_SEC, int(value))
            except (TypeError, ValueError):
                pass
        normalized[key] = value
    return normalized


def build_generate_args(job_type: str, params: dict[str, Any]) -> list[str]:
    """Translate a params object into CLI flags.

    Media params accept a local path, an http(s) URL, or an existing upload id;
    list-valued media params are emitted as repeated flags.
    """
    args: list[str] = [job_type]
    for key, value in params.items():
        if value is None or value == "":
            continue
        media_flag = MEDIA_PARAMS.get(key)
        if media_flag:
            items = value if isinstance(value, list) else [value]
            for item in items:
                if item in (None, ""):
                    continue
                args.extend([media_flag, _scalar(item)])
            continue
        if isinstance(value, (list, dict)):
            args.extend([_flag_name(key), json.dumps(value, ensure_ascii=False)])
            continue
        args.extend([_flag_name(key), _scalar(value)])
    return args


def account_status() -> dict[str, Any]:
    return _run(["account", "status"], timeout_sec=30) or {}


def list_models(media_type: str | None = None) -> list[dict[str, Any]]:
    args = ["model", "list"]
    if media_type in {"image", "video", "audio", "text"}:
        args.append(f"--{media_type}")
    result = _run(args, timeout_sec=30)
    return result if isinstance(result, list) else []


def model_params(job_type: str) -> dict[str, Any]:
    return _run(["model", "get", job_type], timeout_sec=30) or {}


def estimate_cost(job_type: str, params: dict[str, Any]) -> dict[str, Any]:
    safe = normalize_params(job_type, params)
    result = _run(["generate", "cost", *build_generate_args(job_type, safe)], timeout_sec=60)
    return result if isinstance(result, dict) else {"credits": None}


def create_job(job_type: str, params: dict[str, Any]) -> list[str]:
    safe = normalize_params(job_type, params)
    result = _run(
        ["generate", "create", *build_generate_args(job_type, safe)],
        timeout_sec=int(os.getenv("HIGGSFIELD_CREATE_TIMEOUT_SEC", "300")),
    )
    if isinstance(result, list):
        return [str(item) for item in result]
    if isinstance(result, dict) and result.get("id"):
        return [str(result["id"])]
    raise HiggsfieldError(f"Unexpected create response: {json.dumps(result)[:400]}")


def get_job(job_id: str) -> dict[str, Any]:
    result = _run(["generate", "get", job_id], timeout_sec=60)
    if not isinstance(result, dict):
        raise HiggsfieldError(f"Unexpected job response for {job_id}")
    return result


def upload_media(source: str) -> dict[str, Any]:
    result = _run(["upload", "create", source], timeout_sec=int(os.getenv("HIGGSFIELD_UPLOAD_TIMEOUT_SEC", "300")))
    if isinstance(result, dict):
        return result
    if isinstance(result, list) and result:
        first = result[0]
        return first if isinstance(first, dict) else {"id": str(first)}
    raise HiggsfieldError("Unexpected upload response")
