"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type SnapshotVisual = {
  label: string;
  hint: string;
  background: string;
  glow: string;
  grain: string;
  accent: string;
};

const FALLBACK_VISUAL: SnapshotVisual = {
  label: "Custom Style",
  hint: "사용자 정의 프롬프트 느낌",
  background: "linear-gradient(135deg, #0f172a 0%, #1f2937 55%, #0b1020 100%)",
  glow: "radial-gradient(circle at 72% 32%, rgba(56,189,248,0.3), transparent 55%)",
  grain:
    "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6px)",
  accent: "#38bdf8"
};

const SNAPSHOT_IMAGE_MAP: Record<string, string> = {
  "Cinematic photo-real": "/style-snapshots/cinematic-photo-real.jpg",
  "Minimal flat illustration": "/style-snapshots/minimal-flat-illustration.jpg",
  "Anime cel-shaded": "/style-snapshots/anime-cel-shaded.jpg",
  "3D Pixar-style": "/style-snapshots/3d-pixar-style.jpg",
  "Cyberpunk neon": "/style-snapshots/cyberpunk-neon.jpg",
  "Watercolor painting": "/style-snapshots/watercolor-painting.jpg",
  "Pencil sketch": "/style-snapshots/pencil-sketch.jpg",
  "Retro VHS film": "/style-snapshots/retro-vhs-film.jpg",
  "Editorial product ad": "/style-snapshots/editorial-product-ad.jpg",
  "Custom Style": "/style-snapshots/custom-style.jpg"
};

function resolveSnapshotVisual(styleText: string): SnapshotVisual {
  const raw = String(styleText || "").trim().toLowerCase();
  if (!raw) {
    return {
      label: "Cinematic photo-real",
      hint: "영화 톤의 사실적 조명",
      background: "linear-gradient(135deg, #101828 0%, #1e293b 45%, #854d0e 100%)",
      glow: "radial-gradient(circle at 68% 28%, rgba(251,191,36,0.35), transparent 55%)",
      grain:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 4px)",
      accent: "#fbbf24"
    };
  }
  if (raw.includes("cinematic") || raw.includes("photo")) {
    return {
      label: "Cinematic photo-real",
      hint: "영화 톤의 사실적 조명",
      background: "linear-gradient(135deg, #101828 0%, #1e293b 45%, #854d0e 100%)",
      glow: "radial-gradient(circle at 68% 28%, rgba(251,191,36,0.35), transparent 55%)",
      grain:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 4px)",
      accent: "#fbbf24"
    };
  }
  if (raw.includes("minimal") || raw.includes("flat")) {
    return {
      label: "Minimal flat illustration",
      hint: "단순 도형, 깨끗한 면",
      background: "linear-gradient(145deg, #e2e8f0 0%, #bae6fd 52%, #f8fafc 100%)",
      glow: "radial-gradient(circle at 32% 30%, rgba(14,116,144,0.25), transparent 52%)",
      grain:
        "repeating-linear-gradient(90deg, rgba(15,23,42,0.035) 0px, rgba(15,23,42,0.035) 1px, transparent 1px, transparent 10px)",
      accent: "#0e7490"
    };
  }
  if (raw.includes("anime") || raw.includes("cel")) {
    return {
      label: "Anime cel-shaded",
      hint: "강한 윤곽선, 선명한 채도",
      background: "linear-gradient(135deg, #172554 0%, #7c3aed 55%, #f97316 100%)",
      glow: "radial-gradient(circle at 72% 24%, rgba(250,204,21,0.35), transparent 55%)",
      grain:
        "repeating-linear-gradient(160deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 9px)",
      accent: "#facc15"
    };
  }
  if (raw.includes("pixar") || raw.includes("3d")) {
    return {
      label: "3D Pixar-style",
      hint: "부드러운 3D 조명과 볼륨",
      background: "linear-gradient(135deg, #1d4ed8 0%, #22d3ee 52%, #fef3c7 100%)",
      glow: "radial-gradient(circle at 66% 30%, rgba(255,255,255,0.35), transparent 58%)",
      grain:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 12px)",
      accent: "#22d3ee"
    };
  }
  if (raw.includes("cyberpunk") || raw.includes("neon")) {
    return {
      label: "Cyberpunk neon",
      hint: "네온 대비, 어두운 배경",
      background: "linear-gradient(135deg, #0f172a 0%, #4c1d95 45%, #be185d 100%)",
      glow: "radial-gradient(circle at 74% 30%, rgba(16,185,129,0.4), transparent 56%)",
      grain:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)",
      accent: "#10b981"
    };
  }
  if (raw.includes("watercolor")) {
    return {
      label: "Watercolor painting",
      hint: "수채 번짐, 부드러운 경계",
      background: "linear-gradient(135deg, #e0f2fe 0%, #fecdd3 52%, #fef3c7 100%)",
      glow: "radial-gradient(circle at 35% 30%, rgba(56,189,248,0.22), transparent 58%)",
      grain:
        "repeating-linear-gradient(30deg, rgba(15,23,42,0.03) 0px, rgba(15,23,42,0.03) 1px, transparent 1px, transparent 14px)",
      accent: "#f97316"
    };
  }
  if (raw.includes("pencil") || raw.includes("sketch")) {
    return {
      label: "Pencil sketch",
      hint: "연필선, 모노톤 질감",
      background: "linear-gradient(135deg, #f5f5f4 0%, #d6d3d1 55%, #a8a29e 100%)",
      glow: "radial-gradient(circle at 68% 28%, rgba(87,83,78,0.25), transparent 58%)",
      grain:
        "repeating-linear-gradient(135deg, rgba(28,25,23,0.07) 0px, rgba(28,25,23,0.07) 1px, transparent 1px, transparent 5px)",
      accent: "#44403c"
    };
  }
  if (raw.includes("vhs") || raw.includes("retro")) {
    return {
      label: "Retro VHS film",
      hint: "빈티지 톤 + 스캔라인",
      background: "linear-gradient(135deg, #1f2937 0%, #7f1d1d 45%, #f59e0b 100%)",
      glow: "radial-gradient(circle at 72% 26%, rgba(253,224,71,0.3), transparent 55%)",
      grain:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 2px)",
      accent: "#f59e0b"
    };
  }
  if (raw.includes("editorial") || raw.includes("product") || raw.includes("ad")) {
    return {
      label: "Editorial product ad",
      hint: "광고형 하이라이트 조명",
      background: "linear-gradient(135deg, #111827 0%, #334155 52%, #f8fafc 100%)",
      glow: "radial-gradient(circle at 68% 26%, rgba(255,255,255,0.35), transparent 58%)",
      grain:
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 8px)",
      accent: "#e2e8f0"
    };
  }
  return FALLBACK_VISUAL;
}

export function ImageStyleSnapshot(props: { styleText: string; className?: string }): React.JSX.Element {
  const visual = resolveSnapshotVisual(props.styleText);
  const [collapsed, setCollapsed] = useState(true);
  const imageSrc = useMemo(
    () => SNAPSHOT_IMAGE_MAP[visual.label] || SNAPSHOT_IMAGE_MAP["Custom Style"],
    [visual.label]
  );
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [imageSrc]);

  return (
    <div className={`rounded-md border p-3 ${props.className || ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">스타일 예시 스냅샷</p>
          <span className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground">참고용</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
        >
          {collapsed ? "펼치기" : "접기"}
        </button>
      </div>
      {!collapsed ? (
        <div className="w-full max-w-[280px]">
          <div
            className="relative h-40 w-full overflow-hidden rounded-md border"
            style={
              imageError
                ? {
                    backgroundImage: `${visual.glow}, ${visual.grain}, ${visual.background}`
                  }
                : undefined
            }
          >
            {!imageError ? (
              <Image
                src={imageSrc}
                alt={`${visual.label} style example`}
                fill
                sizes="280px"
                className="object-cover"
                onError={() => setImageError(true)}
              />
            ) : null}
            <div className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
              {visual.label}
            </div>
            <div className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
              {visual.hint}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            실제 생성 결과를 그대로 보여주는 화면은 아니며, 선택한 스타일의 분위기 예시입니다.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">스타일 예시 이미지를 보려면 펼치기를 눌러주세요.</p>
      )}
    </div>
  );
}
