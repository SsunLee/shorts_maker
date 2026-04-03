export type InstagramElementType = "text" | "shape" | "image";
export type InstagramShapeType =
  | "rectangle"
  | "roundedRectangle"
  | "circle"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "arrowRight"
  | "arrowLeft"
  | "line";
export type InstagramTextAlign = "left" | "center" | "right";
export type InstagramTextMode = "variable" | "plain";

export interface InstagramElementBase {
  id: string;
  type: InstagramElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}

export interface InstagramTextElement extends InstagramElementBase {
  type: "text";
  textMode: InstagramTextMode;
  text: string;
  autoWrap: boolean;
  color: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: InstagramTextAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  backgroundColor: string;
  padding: number;
}

export interface InstagramShapeElement extends InstagramElementBase {
  type: "shape";
  shape: InstagramShapeType;
  fillEnabled: boolean;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface InstagramImageElement extends InstagramElementBase {
  type: "image";
  imageUrl: string;
  mediaType?: "image" | "video";
  fit: "cover" | "contain";
  borderRadius: number;
  overlayColor: string;
  overlayOpacity: number;
  aiGenerateEnabled: boolean;
  aiPrompt: string;
  aiStylePreset: string;
}

export type InstagramPageElement =
  | InstagramTextElement
  | InstagramShapeElement
  | InstagramImageElement;

export interface InstagramFeedPage {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundImageUrl?: string;
  backgroundFit?: "cover" | "contain";
  durationSec: number;
  audioEnabled?: boolean;
  audioProvider?: "auto" | "openai" | "gemini";
  audioVoice?: string;
  audioSpeed?: number;
  audioUrl?: string;
  audioPrompt?: string;
  elements: InstagramPageElement[];
}

export interface InstagramTemplate {
  id: string;
  templateName: string;
  sourceTitle: string;
  sourceTopic: string;
  canvasPreset?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  pageDurationSec: number;
  pageCount: number;
  pages: InstagramFeedPage[];
  updatedAt: string;
}

export interface InstagramTemplateCatalog {
  activeTemplateId?: string;
  templates: InstagramTemplate[];
}

export interface InstagramGeneratedFeedItem {
  id: string;
  templateId: string;
  templateName: string;
  rowId: string;
  subject: string;
  keyword: string;
  generatedAt: string;
  pages: InstagramFeedPage[];
}
