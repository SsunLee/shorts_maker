from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path
from typing import Any
import math
import re
import unicodedata


FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.getenv("FFPROBE_BIN", "ffprobe")


def _safe_strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    raw = str(value).strip().lower()
    return raw in {"1", "true", "yes", "on", "y"}


def _decode_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace").strip()
        except Exception:  # pylint: disable=broad-except
            return value.decode(errors="replace").strip()
    return str(value).strip()


def run_cmd(command: list[str]) -> None:
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
        check=False,
    )
    if completed.returncode != 0:
        stderr_text = _decode_output(completed.stderr)
        stdout_text = _decode_output(completed.stdout)
        combined = stderr_text or stdout_text or "(ffmpeg returned non-zero with no output)"
        raise RuntimeError(
            f"Command failed: {' '.join(command)}\n{combined}"
        )


def _to_ffmpeg_command_string(command: list[str]) -> str:
    return " ".join(shlex.quote(arg) for arg in command)


def _resolve_sfx_path(output_dir: Path) -> Path | None:
    configured = Path(os.getenv("DEFAULT_SFX_PATH", "assets/sfx.mp3"))
    if configured.exists():
        return configured

    generated = output_dir / "_default_sfx.mp3"
    if generated.exists():
        return generated

    generate_command = [
        FFMPEG_BIN,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=color=pink:amplitude=0.03:d=30",
        "-af",
        "highpass=f=120,lowpass=f=4500,volume=0.35",
        "-c:a",
        "mp3",
        str(generated),
    ]
    completed = subprocess.run(
        generate_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return generated


def probe_audio_duration(audio_path: Path) -> float:
    command = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return 30.0
    try:
        return max(1.0, float(_safe_strip(completed.stdout)))
    except ValueError:
        return 30.0


def probe_video_dimensions(video_path: Path) -> tuple[int, int] | None:
    command = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        str(video_path),
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    raw = _safe_strip(completed.stdout)
    if "x" not in raw:
        return None
    try:
        width_text, height_text = raw.split("x", maxsplit=1)
        width = int(width_text)
        height = int(height_text)
        return width, height
    except ValueError:
        return None


def _hex_to_ass_color(value: str, fallback: str) -> str:
    raw = (value or "").strip().lstrip("#")
    if len(raw) != 6:
        raw = fallback
    r = raw[0:2]
    g = raw[2:4]
    b = raw[4:6]
    return f"&H{b}{g}{r}&"


def _hex_to_ass_color_alpha(value: str, fallback: str, opacity: float) -> str:
    raw = (value or "").strip().lstrip("#")
    if len(raw) != 6:
        raw = fallback
    opacity = max(0.0, min(1.0, opacity))
    alpha = int(round((1.0 - opacity) * 255.0))
    r = raw[0:2]
    g = raw[2:4]
    b = raw[4:6]
    return f"&H{alpha:02X}{b}{g}{r}&"


def _subtitle_bold_weight(font_thickness: Any) -> int:
    try:
        thickness = float(font_thickness)
    except (TypeError, ValueError):
        thickness = 0.0
    thickness = max(0.0, min(8.0, thickness))
    return int(round(400.0 + (thickness / 8.0) * 500.0))


def _subtitle_layout(position: str, subtitle_y_pct: Any) -> tuple[int, int]:
    # libass style margins are resolved in script PlayRes coordinates (default ~288 high for SRT),
    # not in output pixels (1920). Using output-pixel margins can push subtitles off-screen.
    ass_playres_y = 288
    default_y_pct_map = {"top": 18.0, "middle": 52.0, "bottom": 86.0}
    normalized_position = str(position or "bottom").strip().lower()
    default_y_pct = default_y_pct_map.get(normalized_position, 86.0)

    try:
        y_pct = float(subtitle_y_pct)
    except (TypeError, ValueError):
        y_pct = default_y_pct

    y_pct = max(0.0, min(100.0, y_pct))
    if y_pct < 34.0:
        alignment = 8
        distance_pct = y_pct
    elif y_pct > 67.0:
        alignment = 2
        distance_pct = 100.0 - y_pct
    else:
        # Middle is the safest center anchor for libass with SRT.
        return 5, 0

    margin_v = int(round(ass_playres_y * (distance_pct / 100.0)))
    margin_v = max(4, min(ass_playres_y // 2, margin_v))
    return alignment, margin_v


def _subtitle_filter_value(
    subtitle_path: Path,
    subtitle_options: dict[str, Any] | None = None,
) -> str:
    safe_path = subtitle_path.as_posix()
    # On Windows, ffmpeg filter parser requires escaped drive-colon (C\:/...)
    # and quoted path to avoid treating parts as filter options.
    if len(safe_path) >= 2 and safe_path[1] == ":":
        safe_path = f"{safe_path[0]}\\:{safe_path[2:]}"
    safe_path = safe_path.replace("'", "\\'")
    options = subtitle_options or {}
    font_name = (
        str(options.get("fontName") or "Arial")
        .replace("'", "")
        .replace(",", "")
    )
    font_size = int(options.get("fontSize") or 16)
    outline = int(options.get("outline") or 2)
    shadow = int(options.get("shadow") or 1)
    shadow_opacity = float(options.get("shadowOpacity") or 1.0)
    shadow_opacity = max(0.0, min(1.0, shadow_opacity))
    bold_weight = _subtitle_bold_weight(options.get("fontThickness"))
    primary_color = _hex_to_ass_color(str(options.get("primaryColor") or ""), "FFFFFF")
    outline_color = _hex_to_ass_color(str(options.get("outlineColor") or ""), "000000")
    shadow_color = _hex_to_ass_color_alpha("#000000", "000000", shadow_opacity)
    alignment, margin_v = _subtitle_layout(
        str(options.get("position") or "bottom"),
        options.get("subtitleYPercent"),
    )

    style_parts = [
        f"FontName={font_name}",
        f"FontSize={font_size}",
        f"PrimaryColour={primary_color}",
        f"OutlineColour={outline_color}",
        f"BackColour={shadow_color}",
        "BorderStyle=1",
        f"Bold={bold_weight}",
        f"Outline={outline}",
        f"Shadow={shadow}",
        f"Alignment={alignment}",
    ]
    if margin_v > 0:
        style_parts.append(f"MarginV={margin_v}")

    return (
        f"subtitles='{safe_path}':"
        "charenc=UTF-8:"
        f"force_style='{','.join(style_parts)}'"
    )


def _resolve_scene_motion_preset(
    overlay_options: dict[str, Any] | None,
    scene_index: int,
) -> str:
    options = overlay_options or {}
    raw = str(options.get("sceneMotionPreset") or "gentle_zoom").strip().lower()
    allowed = {"gentle_zoom", "up_down", "left_right", "focus_smooth", "random"}
    if raw not in allowed:
        raw = "gentle_zoom"
    if raw == "random":
        cycle = ["gentle_zoom", "focus_smooth", "up_down", "left_right"]
        return cycle[(scene_index - 1) % len(cycle)]
    return raw


def _resolve_video_layout(overlay_options: dict[str, Any] | None) -> str:
    options = overlay_options or {}
    raw = str(options.get("videoLayout") or "fill_9_16").strip().lower()
    return "panel_16_9" if raw == "panel_16_9" else "fill_9_16"


def _resolve_output_fps(overlay_options: dict[str, Any] | None) -> int:
    options = overlay_options or {}
    try:
        raw_value = int(float(options.get("outputFps")))
    except (TypeError, ValueError):
        raw_value = 30
    return 60 if raw_value >= 60 else 30


def _even(value: int) -> int:
    return value if value % 2 == 0 else value - 1


def _panel_geometry(overlay_options: dict[str, Any] | None) -> tuple[int, int, int, int]:
    options = overlay_options or {}
    try:
        width_pct = float(options.get("panelWidthPercent"))
    except (TypeError, ValueError):
        width_pct = 100.0
    width_pct = max(60.0, min(100.0, width_pct))

    panel_w = _even(int(round(1080.0 * (width_pct / 100.0))))
    panel_w = max(640, min(1080, panel_w))
    panel_h = _even(int(round(panel_w * (9.0 / 16.0))))
    panel_h = max(360, min(1920, panel_h))

    try:
        top_pct = float(options.get("panelTopPercent"))
    except (TypeError, ValueError):
        top_pct = 34.0
    top_pct = max(0.0, min(85.0, top_pct))
    top_px = int(round(1920.0 * (top_pct / 100.0)))
    top_px = max(0, min(1920 - panel_h, top_px))
    left_px = (1080 - panel_w) // 2
    return panel_w, panel_h, left_px, top_px


def _zoompan_motion_filter(
    motion_preset: str,
    frame_count: int,
    fps: int,
    scene_index: int,
    overlay_options: dict[str, Any] | None,
    out_w: int = 1080,
    out_h: int = 1920,
) -> str:
    options = overlay_options or {}
    def _safe_float(value: Any, fallback: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _clamp(value: float, min_value: float, max_value: float) -> float:
        return max(min_value, min(max_value, value))

    frames_minus_one = max(1, frame_count - 1)
    t_expr = f"(on/{frames_minus_one})"
    motion_speed = _clamp(_safe_float(options.get("motionSpeedPercent"), 135.0), 60.0, 220.0) / 100.0
    progress_expr = f"clip({t_expr}*{motion_speed:.2f},0,1)"
    ease_expr = f"(3*{progress_expr}*{progress_expr}-2*{progress_expr}*{progress_expr}*{progress_expr})"
    try:
        configured_zoom = float(options.get("focusZoomPercent"))
    except (TypeError, ValueError):
        configured_zoom = 9.0
    zoom_gain = max(0.03, min(0.2, configured_zoom / 100.0))

    focus_x = _clamp(_safe_float(options.get("focusXPercent"), 50.0), 0.0, 100.0) / 100.0
    focus_y = _clamp(_safe_float(options.get("focusYPercent"), 50.0), 0.0, 100.0) / 100.0
    drift = _clamp(_safe_float(options.get("focusDriftPercent"), 6.0), 0.0, 20.0) / 100.0
    drift_x = drift
    drift_y = drift * 0.72
    direction_x = -1.0 if scene_index % 2 else 1.0
    direction_y = -1.0 if scene_index % 3 else 1.0
    start_fx = _clamp(focus_x - (drift_x * direction_x), 0.06, 0.94)
    end_fx = _clamp(focus_x + (drift_x * direction_x), 0.06, 0.94)
    start_fy = _clamp(focus_y - (drift_y * direction_y), 0.06, 0.94)
    end_fy = _clamp(focus_y + (drift_y * direction_y), 0.06, 0.94)

    zoom_expr = f"'1+({zoom_gain:.4f})*{ease_expr}'"
    focus_zoom_expr = f"'{1.0 + zoom_gain:.4f}'"
    focus_x_expr = f"({start_fx:.4f}+({end_fx - start_fx:.4f})*{ease_expr})"
    focus_y_expr = f"({start_fy:.4f}+({end_fy - start_fy:.4f})*{ease_expr})"
    x_focus_expr = f"'clip(iw*{focus_x_expr}-(iw/zoom/2),0,iw-iw/zoom)'"
    y_focus_expr = f"'clip(ih*{focus_y_expr}-(ih/zoom/2),0,ih-ih/zoom)'"
    x_lr_expr = f"'clip(iw*({start_fx:.4f}+({end_fx - start_fx:.4f})*{ease_expr})-(iw/zoom/2),0,iw-iw/zoom)'"
    y_ud_expr = f"'clip(ih*({start_fy:.4f}+({end_fy - start_fy:.4f})*{ease_expr})-(ih/zoom/2),0,ih-ih/zoom)'"
    x_center_focus_expr = f"'clip(iw*{focus_x:.4f}-(iw/zoom/2),0,iw-iw/zoom)'"
    y_center_focus_expr = f"'clip(ih*{focus_y:.4f}-(ih/zoom/2),0,ih-ih/zoom)'"
    oversample_scale = 2.0 if fps >= 60 else 1.5
    motion_w = _even(int(round(out_w * oversample_scale)))
    motion_h = _even(int(round(out_h * oversample_scale)))
    zoompan_tail = (
        f":d={frame_count}:s={motion_w}x{motion_h}:fps={fps},"
        f"scale={out_w}:{out_h}:flags=lanczos"
    )

    if motion_preset == "focus_smooth":
        return (
            f"zoompan=z={focus_zoom_expr}:"
            f"x={x_focus_expr}:y={y_focus_expr}{zoompan_tail}"
        )

    if motion_preset == "up_down":
        return (
            f"zoompan=z={zoom_expr}:"
            f"x={x_center_focus_expr}:"
            f"y={y_ud_expr}"
            f"{zoompan_tail}"
        )
    if motion_preset == "left_right":
        return (
            f"zoompan=z={zoom_expr}:"
            f"x={x_lr_expr}:"
            f"y={y_center_focus_expr}"
            f"{zoompan_tail}"
        )
    return (
        f"zoompan=z={zoom_expr}:"
        f"x={x_center_focus_expr}:y={y_center_focus_expr}{zoompan_tail}"
    )


def _escape_drawtext(value: str) -> str:
    # ffmpeg drawtext parser can break on ASCII apostrophe (') when complex options
    # and chained filters are used. Normalize to typographic apostrophe to preserve
    # readability while keeping filter parsing stable.
    value = value.replace("'", "’")
    escaped = value.replace("\\", "\\\\")
    escaped = escaped.replace(":", "\\:")
    escaped = escaped.replace(",", "\\,")
    return escaped


def _escape_drawtext_value(value: str) -> str:
    escaped = value.replace("\\", "\\\\")
    escaped = escaped.replace(":", "\\:")
    escaped = escaped.replace("'", "\\'")
    escaped = escaped.replace(",", "\\,")
    return escaped


def _escape_filter_path(path_text: str) -> str:
    safe_path = path_text.replace("\\", "/")
    if len(safe_path) >= 2 and safe_path[1] == ":":
        safe_path = f"{safe_path[0]}\\:{safe_path[2:]}"
    safe_path = safe_path.replace("'", "\\'")
    return safe_path


def _char_visual_units(char: str) -> float:
    if not char:
        return 0.0
    if char.isspace():
        return 0.5

    east_asian = unicodedata.east_asian_width(char)
    if east_asian in {"F", "W"}:
        return 2.0

    if ord(char) < 128:
        if char in "ilI.,'`!|:;":
            return 0.5
        if char in "mwMW@#%&":
            return 1.1
        return 0.8

    return 1.0


def _text_wrap_safety_multiplier(text: str) -> float:
    """
    Return a conservative multiplier for wrapping estimation.
    Some scripts (e.g. Devanagari/Arabic) and emoji tend to render wider than
    simple per-character heuristics, so we wrap earlier to avoid clipping.
    """
    if not text:
        return 1.0

    has_devanagari = False
    has_arabic = False
    has_emoji_or_symbol = False
    has_non_ascii = False

    for ch in text:
        code = ord(ch)
        if code > 127:
            has_non_ascii = True
        if 0x0900 <= code <= 0x097F:
            has_devanagari = True
        elif 0x0600 <= code <= 0x06FF:
            has_arabic = True
        elif unicodedata.category(ch).startswith("So"):
            has_emoji_or_symbol = True

    if has_devanagari:
        return 1.38
    if has_arabic:
        return 1.28
    if has_emoji_or_symbol:
        return 1.22
    if has_non_ascii:
        return 1.14
    return 1.0


def _contains_devanagari(text: str) -> bool:
    for ch in text:
        code = ord(ch)
        if 0x0900 <= code <= 0x097F:
            return True
    return False


def _resolve_devanagari_font_file() -> str:
    """
    Resolve a concrete Devanagari-capable font file path.
    drawtext `font=` can fail to resolve family names depending on ffmpeg build,
    so prefer `fontfile=` when possible.
    """
    configured = str(os.getenv("DEVANAGARI_FONT_FILE") or "").strip()
    if configured:
        configured_path = Path(configured)
        if configured_path.exists():
            return str(configured_path)

    windir = os.getenv("WINDIR", "C:/Windows").strip() or "C:/Windows"
    windows_candidates = [
        Path(windir) / "Fonts" / "Nirmala.ttc",
        Path(windir) / "Fonts" / "Nirmala.ttf",
        Path(windir) / "Fonts" / "NirmalaB.ttf",
        Path(windir) / "Fonts" / "Mangal.ttf",
        Path(windir) / "Fonts" / "Aparaj.ttf",
        Path(windir) / "Fonts" / "Kokila.ttf",
    ]
    linux_candidates = [
        Path("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSerifDevanagari-Regular.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.ttf"),
        Path("/usr/share/fonts/noto/NotoSansDevanagari-Regular.ttf"),
    ]

    for candidate in [*windows_candidates, *linux_candidates]:
        try:
            if candidate.exists():
                return str(candidate)
        except OSError:
            continue
    return ""


def _wrap_text_by_visual_width(text: str, max_units: float) -> list[str]:
    max_units = max(6.0, float(max_units))
    wrapped_lines: list[str] = []

    for paragraph in (text.splitlines() or [text]):
        if paragraph == "":
            wrapped_lines.append("")
            continue

        tokens = re.findall(r"\S+|\s+", paragraph)
        current = ""
        current_units = 0.0

        def flush_line() -> None:
            nonlocal current, current_units
            line = current.rstrip()
            if line or not wrapped_lines:
                wrapped_lines.append(line)
            current = ""
            current_units = 0.0

        for token in tokens:
            token_units = sum(_char_visual_units(ch) for ch in token)

            if current and (current_units + token_units) > max_units:
                flush_line()

            if not current and token.isspace():
                continue

            if not token.isspace() and token_units > max_units:
                for ch in token:
                    char_units = _char_visual_units(ch)
                    if current and (current_units + char_units) > max_units:
                        flush_line()
                    current += ch
                    current_units += char_units
                continue

            current += token
            current_units += token_units

        if current:
            flush_line()
        elif tokens:
            wrapped_lines.append("")

    return wrapped_lines or [text]


def _build_title_template_filter(
    template: dict[str, Any],
) -> list[str]:
    text = str(template.get("text") or "").strip()
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n")
    if not text:
        return []

    x_pct = float(template.get("x", 50.0))
    y_pct = float(template.get("y", 10.0))
    x_pct = max(0.0, min(100.0, x_pct))
    y_pct = max(0.0, min(100.0, y_pct))
    x_expr = f"(w*{x_pct / 100.0:.4f})-(text_w/2)"

    fontsize = int(template.get("fontSize") or 48)
    width_pct = float(template.get("width", 60.0))
    width_pct = max(10.0, min(95.0, width_pct))
    color_raw = str(template.get("color") or "#FFFFFF").strip()
    color = color_raw if color_raw.startswith("#") else "#FFFFFF"
    padding_x = int(template.get("paddingX") or 8)
    padding_y = int(template.get("paddingY") or 4)
    padding_x = max(0, min(80, padding_x))
    padding_y = max(0, min(80, padding_y))
    shadow_x = int(template.get("shadowX") or 2)
    shadow_y = int(template.get("shadowY") or 2)
    shadow_x = max(-20, min(20, shadow_x))
    shadow_y = max(-20, min(20, shadow_y))
    shadow_color_raw = str(template.get("shadowColor") or "#000000").strip()
    shadow_color = shadow_color_raw if shadow_color_raw.startswith("#") else "#000000"
    shadow_opacity = float(template.get("shadowOpacity") or 1.0)
    shadow_opacity = max(0.0, min(1.0, shadow_opacity))
    shadow_color_expr = f"{shadow_color}@{shadow_opacity:.2f}"
    font_thickness = int(template.get("fontThickness") or 0)
    font_thickness = max(0, min(8, font_thickness))
    thickness_expr = (
        f"borderw={font_thickness}:bordercolor={color}:"
        if font_thickness > 0
        else ""
    )
    font_name = str(template.get("fontName") or "").strip()
    font_bold = _safe_bool(template.get("fontBold"))
    font_italic = _safe_bool(template.get("fontItalic"))
    font_file = str(template.get("fontFile") or "").strip()

    # Devanagari text often breaks with Arial. Prefer a Hindi-capable font unless
    # user explicitly set fontFile.
    if _contains_devanagari(text) and not font_file:
        font_file = _resolve_devanagari_font_file()
        if not font_file:
            unsafe_font_names = {
                "",
                "arial",
                "arial black",
                "malgun gothic",
                "nanumgothic",
                "noto sans kr",
                "segoe ui",
            }
            if font_name.strip().lower() in unsafe_font_names:
                # Windows 기본 탑재 + Devanagari 지원
                font_name = "Nirmala UI"

    # Approximate wrapping by template width so preview/editor box and ffmpeg output are closer.
    # Use conservative width + script-aware multiplier to reduce clipping in non-Latin text.
    width_px = 1080 * (width_pct / 100.0)
    effective_width_px = width_px * 0.86
    wrap_multiplier = _text_wrap_safety_multiplier(text)
    unit_px = max(4.0, fontsize * 0.56 * wrap_multiplier)
    max_units = max(6.0, min(220.0, effective_width_px / unit_px))
    wrapped_lines = _wrap_text_by_visual_width(text, max_units)
    if not wrapped_lines:
        return []

    font_expr = ""
    if font_file:
        font_expr = f"fontfile='{_escape_filter_path(font_file)}':"
    elif font_name:
        font_pattern = font_name
        style_tokens: list[str] = []
        if font_bold:
            style_tokens.append("Bold")
        if font_italic:
            style_tokens.append("Italic")
        if style_tokens:
            font_pattern = f"{font_pattern}:style={' '.join(style_tokens)}"
        font_expr = f"font='{_escape_drawtext_value(font_pattern)}':"

    # Keep text background transparent regardless of editor padding settings.
    box_expr = ""

    line_gap = max(2, int(round(fontsize * 0.18)))
    line_step = fontsize + line_gap
    total_h = max(fontsize, len(wrapped_lines) * line_step - line_gap)
    y_base_expr = f"(h*{y_pct / 100.0:.4f})-({total_h}/2)"

    filters: list[str] = []
    for line_index, line_text in enumerate(wrapped_lines):
        safe_text = line_text if line_text else " "
        y_expr = f"{y_base_expr}+{line_index * line_step}"
        filters.append(
            "drawtext="
            f"{font_expr}"
            f"text='{_escape_drawtext(safe_text)}':"
            f"fontsize={fontsize}:fontcolor={color}:"
            f"{thickness_expr}"
            f"{box_expr}"
            f"x={x_expr}:"
            f"y={y_expr}:"
            f"shadowcolor={shadow_color_expr}:shadowx={shadow_x}:shadowy={shadow_y}"
        )

    return filters


def _drawtext_filter_values(
    overlay_options: dict[str, Any] | None,
    fallback_title: str,
) -> list[str]:
    options = overlay_options or {}
    filters: list[str] = []
    templates = options.get("titleTemplates")
    if isinstance(templates, list):
        # Prefer template layers. Legacy single-title mode remains fallback-only.
        has_template_layer = False
        for raw in templates:
            if not isinstance(raw, dict):
                continue
            has_template_layer = True
            template_filters = _build_title_template_filter(raw)
            if template_filters:
                filters.extend(template_filters)
        if has_template_layer:
            return filters

    if bool(options.get("showTitle")):
        text = str(options.get("titleText") or fallback_title).strip()
        if text:
            position = str(options.get("titlePosition") or "top")
            legacy_template = {
                "id": "__legacy_title__",
                "text": text,
                "x": 50.0,
                "y": 88.0 if position == "bottom" else 10.0,
                "width": 70.0,
                "fontSize": int(options.get("titleFontSize") or 48),
                "color": str(options.get("titleColor") or "#FFFFFF"),
                "paddingX": 8,
                "paddingY": 4,
                "shadowX": 2,
                "shadowY": 2,
                "shadowColor": "#000000",
                "shadowOpacity": 1.0,
                "fontThickness": int(options.get("titleFontThickness") or 0),
                "fontName": str(options.get("titleFontName") or "Malgun Gothic").strip(),
                "fontBold": _safe_bool(options.get("titleFontBold")),
                "fontItalic": _safe_bool(options.get("titleFontItalic")),
                "fontFile": str(options.get("titleFontFile") or "").strip(),
            }
            filters.extend(_build_title_template_filter(legacy_template))

    return filters


def render_short_video(
    image_paths: list[Path],
    tts_path: Path,
    subtitle_path: Path,
    output_dir: Path,
    use_sfx: bool,
    target_duration_sec: float | None,
    subtitle_options: dict[str, Any] | None = None,
    overlay_options: dict[str, Any] | None = None,
    title_text: str = "",
) -> tuple[Path, list[str]]:
    """
    Render a 9:16 short with configurable image motion + narration + subtitles + optional SFX.

    Example command this function emits per image:
    ffmpeg -y -loop 1 -t 6 -i image.png -vf
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
    zoompan=z='min(zoom+0.0015,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':
    d=1:s=1080x1920:fps={outputFps},setsar=1" -r {outputFps} -pix_fmt yuv420p segment.mp4
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    commands: list[str] = []

    audio_duration = probe_audio_duration(tts_path)
    if target_duration_sec is not None:
        audio_duration = float(target_duration_sec)

    fps = _resolve_output_fps(overlay_options)
    image_count = len(image_paths)
    total_frames = max(image_count, int(math.ceil(audio_duration * fps)))
    base_frames = total_frames // image_count
    extra_frames = total_frames % image_count

    segments: list[Path] = []
    video_layout = _resolve_video_layout(overlay_options)
    panel_w, panel_h, panel_left, panel_top = _panel_geometry(overlay_options)
    for idx, image_path in enumerate(image_paths, start=1):
        frame_count = base_frames + (1 if idx <= extra_frames else 0)
        segment_path = output_dir / f"segment-{idx}.mp4"
        motion_preset = _resolve_scene_motion_preset(overlay_options, idx)
        if video_layout == "panel_16_9":
            motion_filter = _zoompan_motion_filter(
                motion_preset,
                frame_count,
                fps,
                scene_index=idx,
                overlay_options=overlay_options,
                out_w=panel_w,
                out_h=panel_h,
            )
            vf = (
                f"scale={panel_w}:{panel_h}:force_original_aspect_ratio=increase,"
                f"crop={panel_w}:{panel_h},"
                f"{motion_filter},"
                f"pad=1080:1920:{panel_left}:{panel_top}:color=black,"
                "setsar=1"
            )
        else:
            motion_filter = _zoompan_motion_filter(
                motion_preset,
                frame_count,
                fps,
                scene_index=idx,
                overlay_options=overlay_options,
            )
            vf = (
                "scale=1080:1920:force_original_aspect_ratio=increase,"
                "crop=1080:1920,"
                f"{motion_filter},"
                "setsar=1"
            )
        command = [
            FFMPEG_BIN,
            "-y",
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "16",
            "-frames:v",
            str(frame_count),
            "-r",
            str(fps),
            "-pix_fmt",
            "yuv420p",
            str(segment_path),
        ]
        run_cmd(command)
        commands.append(_to_ffmpeg_command_string(command))
        segments.append(segment_path)

    concat_file = output_dir / "concat.txt"
    concat_file.write_text(
        "\n".join(f"file '{segment.as_posix()}'" for segment in segments),
        encoding="utf-8",
    )

    final_output = output_dir / "final.mp4"
    subtitle_filter = _subtitle_filter_value(subtitle_path, subtitle_options)
    drawtext_filters = _drawtext_filter_values(
        overlay_options,
        title_text,
    )
    video_filters = subtitle_filter
    if drawtext_filters:
        video_filters = f"{video_filters},{','.join(drawtext_filters)}"

    sfx_path = _resolve_sfx_path(output_dir) if use_sfx else None
    should_mix_sfx = use_sfx and sfx_path is not None and sfx_path.exists()

    if should_mix_sfx:
        final_command = [
            FFMPEG_BIN,
            "-y",
            "-fflags",
            "+genpts",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-i",
            str(tts_path),
            "-stream_loop",
            "-1",
            "-i",
            str(sfx_path),
            "-filter_complex",
            "[1:a]volume=1.0[tts];[2:a]volume=0.13[sfx];"
            "[tts][sfx]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-vf",
            video_filters,
            "-map",
            "0:v",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-r",
            str(fps),
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(final_output),
        ]
    else:
        final_command = [
            FFMPEG_BIN,
            "-y",
            "-fflags",
            "+genpts",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-i",
            str(tts_path),
            "-vf",
            video_filters,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-r",
            str(fps),
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(final_output),
        ]

    run_cmd(final_command)
    commands.append(_to_ffmpeg_command_string(final_command))
    dimensions = probe_video_dimensions(final_output)
    if dimensions:
        width, height = dimensions
        ratio = (width / height) if height else 0.0
        if abs(ratio - (9.0 / 16.0)) > 0.01:
            raise RuntimeError(
                f"Output video ratio is not 9:16 (got {width}x{height})."
            )
    return final_output, commands
