from pydantic import BaseModel, Field


class SubtitleCue(BaseModel):
    id: str = Field(..., min_length=1, max_length=80)
    startMs: int = Field(..., ge=0, le=3600000)
    endMs: int = Field(..., ge=1, le=3600000)
    text: str = Field(..., min_length=1, max_length=300)


class SubtitleOptions(BaseModel):
    fontName: str = Field(default="Arial", min_length=1)
    fontSize: int = Field(default=16, ge=10, le=80)
    primaryColor: str = Field(default="#FFFFFF", min_length=4, max_length=16)
    outlineColor: str = Field(default="#000000", min_length=4, max_length=16)
    outline: int = Field(default=2, ge=0, le=8)
    shadow: int = Field(default=1, ge=0, le=8)
    shadowOpacity: float = Field(default=1.0, ge=0.0, le=1.0)
    fontThickness: int = Field(default=0, ge=0, le=8)
    subtitleDelayMs: int = Field(default=180, ge=-500, le=1500)
    position: str = Field(default="bottom")
    subtitleYPercent: float = Field(default=86.0, ge=0.0, le=100.0)
    wordsPerCaption: int = Field(default=5, ge=2, le=10)
    manualCues: list[SubtitleCue] = Field(default_factory=list)


class OverlayOptions(BaseModel):
    showTitle: bool = False
    titleText: str | None = None
    titlePosition: str = Field(default="top")
    titleFontSize: int = Field(default=48, ge=16, le=120)
    titleColor: str = Field(default="#FFFFFF", min_length=4, max_length=16)
    titleFontName: str = Field(default="Malgun Gothic", min_length=1, max_length=80)
    titleFontBold: bool = False
    titleFontItalic: bool = False
    titleFontFile: str | None = Field(default=None, max_length=260)
    sceneMotionPreset: str = Field(default="gentle_zoom")
    motionSpeedPercent: float = Field(default=135.0, ge=60.0, le=220.0)
    focusXPercent: float = Field(default=50.0, ge=0.0, le=100.0)
    focusYPercent: float = Field(default=50.0, ge=0.0, le=100.0)
    focusDriftPercent: float = Field(default=6.0, ge=0.0, le=20.0)
    focusZoomPercent: float = Field(default=9.0, ge=3.0, le=20.0)
    outputFps: int = Field(default=30, ge=30, le=60)
    videoLayout: str = Field(default="fill_9_16")
    panelTopPercent: float = Field(default=34.0, ge=0.0, le=85.0)
    panelWidthPercent: float = Field(default=100.0, ge=60.0, le=100.0)
    titleTemplates: list["TitleTemplate"] = Field(default_factory=list)


class TitleTemplate(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = Field(default="", max_length=200)
    x: float = Field(default=50.0, ge=0.0, le=100.0)
    y: float = Field(default=10.0, ge=0.0, le=100.0)
    width: float = Field(default=60.0, ge=10.0, le=95.0)
    fontSize: int = Field(default=48, ge=12, le=120)
    color: str = Field(default="#FFFFFF", min_length=4, max_length=16)
    paddingX: int = Field(default=8, ge=0, le=80)
    paddingY: int = Field(default=4, ge=0, le=80)
    shadowX: int = Field(default=2, ge=-20, le=20)
    shadowY: int = Field(default=2, ge=-20, le=20)
    shadowColor: str = Field(default="#000000", min_length=4, max_length=16)
    shadowOpacity: float = Field(default=1.0, ge=0.0, le=1.0)
    fontThickness: int = Field(default=0, ge=0, le=8)
    fontName: str | None = Field(default=None, max_length=80)
    fontBold: bool = False
    fontItalic: bool = False
    fontFile: str | None = Field(default=None, max_length=260)


class RenderOptions(BaseModel):
    subtitle: SubtitleOptions = Field(default_factory=SubtitleOptions)
    overlay: OverlayOptions = Field(default_factory=OverlayOptions)


class BuildVideoRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    imageUrls: list[str] = Field(..., min_length=3, max_length=12)
    ttsPath: str = Field(..., min_length=1)
    subtitlesText: str = Field(..., min_length=1)
    titleText: str = Field(..., min_length=1)
    useSfx: bool = False
    targetDurationSec: int | None = Field(default=None, ge=10, le=180)
    renderOptions: RenderOptions | None = None


class BuildVideoResponse(BaseModel):
    outputPath: str
    outputUrl: str
    srtPath: str
    ffmpegSteps: list[str]


OverlayOptions.model_rebuild()
