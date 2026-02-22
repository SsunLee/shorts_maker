from __future__ import annotations

import math
import re


def _format_timestamp(seconds: float) -> str:
    millis = int((seconds - int(seconds)) * 1000)
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def _build_caption_chunks(text: str, words_per_caption: int) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        return []

    safe_words = max(2, min(10, int(words_per_caption)))
    sentence_units: list[str] = []
    for line in re.split(r"\n+", normalized):
        stripped_line = line.strip()
        if not stripped_line:
            continue
        pieces = re.findall(r"[^.!?。！？]+[.!?。！？]?", stripped_line)
        if not pieces:
            pieces = [stripped_line]
        sentence_units.extend(piece.strip() for piece in pieces if piece.strip())

    chunks: list[str] = []
    for unit in sentence_units:
        words = [word for word in unit.split(" ") if word]
        if len(words) <= safe_words:
            chunks.append(unit)
            continue
        for idx in range(0, len(words), safe_words):
            chunks.append(" ".join(words[idx : idx + safe_words]))
    return chunks


def build_srt_from_text(
    text: str,
    duration_sec: float,
    words_per_caption: int = 5,
    subtitle_delay_ms: int = 180,
) -> str:
    """
    Convert narration text into an SRT string by chunking 4-6 words per subtitle.
    """
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return ""
    chunks = _build_caption_chunks(normalized, words_per_caption)
    if not chunks:
        return ""

    weights = [max(1, len(re.sub(r"\s+", "", chunk))) for chunk in chunks]
    total_weight = max(1, sum(weights))
    delay_sec = max(-0.5, min(1.5, subtitle_delay_ms / 1000.0))
    min_cue_duration = 0.16
    srt_lines: list[str] = []
    caption_index = 0
    elapsed = 0.0
    for chunk_idx, chunk in enumerate(chunks, start=1):
        weight = weights[chunk_idx - 1]
        fraction = weight / total_weight
        portion = (
            max(0.0, duration_sec - elapsed)
            if chunk_idx == len(chunks)
            else duration_sec * fraction
        )
        base_start = elapsed
        base_end = min(duration_sec, base_start + portion)
        elapsed = base_end
        if math.isclose(base_start, base_end):
            base_end = min(duration_sec, base_start + min_cue_duration)

        start = max(0.0, min(duration_sec, base_start + delay_sec))
        if start >= duration_sec:
            continue

        end = max(start + min_cue_duration, min(duration_sec, base_end + delay_sec))
        if end <= start:
            continue
        caption_index += 1
        srt_lines.extend(
            [
                str(caption_index),
                f"{_format_timestamp(start)} --> {_format_timestamp(end)}",
                chunk,
                "",
            ]
        )

    return "\n".join(srt_lines)


def build_srt_from_cues(
    cues: list[dict[str, object]],
    duration_sec: float,
) -> str:
    if not cues:
        return ""

    max_ms = max(1, int(round(max(1.0, duration_sec) * 1000.0)))
    normalized_rows: list[tuple[int, int, str]] = []
    for raw in cues:
        text = str(raw.get("text") or "").strip()
        if not text:
            continue
        try:
            start_ms = int(raw.get("startMs", 0))
            end_ms = int(raw.get("endMs", start_ms + 500))
        except (TypeError, ValueError):
            continue
        start_ms = max(0, min(max_ms - 100, start_ms))
        end_ms = max(start_ms + 100, min(max_ms, end_ms))
        normalized_rows.append((start_ms, end_ms, text))

    if not normalized_rows:
        return ""

    normalized_rows.sort(key=lambda row: (row[0], row[1]))
    srt_lines: list[str] = []
    for idx, (start_ms, end_ms, text) in enumerate(normalized_rows, start=1):
        srt_lines.extend(
            [
                str(idx),
                f"{_format_timestamp(start_ms / 1000.0)} --> {_format_timestamp(end_ms / 1000.0)}",
                text,
                "",
            ]
        )
    return "\n".join(srt_lines)
