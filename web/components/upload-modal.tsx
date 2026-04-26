"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface UploadModalProps {
  title: string;
  topic?: string;
  narration?: string;
  videoUrl?: string;
  voice?: string;
  voiceSpeed?: number;
  tags: string[];
  onUpload: (data: {
    title: string;
    description: string;
    tags: string[];
    privacyStatus: "private" | "public" | "unlisted";
  }) => Promise<void>;
}

function buildUploadDescription(topic: string | undefined, narration: string | undefined, tags: string[]): string {
  const body = (topic || narration || "").trim();
  const hashTags = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  if (body && hashTags) {
    return `${body}\n\n${hashTags}`;
  }
  return body || hashTags;
}

export function UploadModal({
  title,
  topic,
  narration,
  videoUrl,
  voice,
  voiceSpeed,
  tags,
  onUpload
}: UploadModalProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewAudioUrlRef = useRef<string | undefined>(undefined);
  const defaultDescription = useMemo(
    () => buildUploadDescription(topic, narration, tags),
    [topic, narration, tags]
  );
  const defaultTags = useMemo(() => tags.join(", "), [tags]);
  const [localTitle, setLocalTitle] = useState(title);
  const [description, setDescription] = useState(defaultDescription);
  const [tagText, setTagText] = useState(defaultTags);
  const previewText = useMemo(() => {
    const source = (narration || topic || title || "").replace(/\s+/g, " ").trim();
    return source.slice(0, 320) || "This is a voice preview for your short-form content.";
  }, [narration, topic, title]);

  const disabled = !videoUrl || uploading;
  const previewDisabled = previewLoading || uploading || !previewText;

  useEffect(() => {
    if (!open) {
      return;
    }
    setUploadError(undefined);
    setPreviewError(undefined);
    setLocalTitle(title);
    setDescription(defaultDescription);
    setTagText(defaultTags);
  }, [open, title, defaultDescription, defaultTags]);

  useEffect(() => {
    return () => {
      if (previewAudioUrlRef.current) {
        URL.revokeObjectURL(previewAudioUrlRef.current);
        previewAudioUrlRef.current = undefined;
      }
    };
  }, []);

  async function submit(): Promise<void> {
    setUploading(true);
    setUploadError(undefined);
    try {
      await onUpload({
        title: localTitle,
        description,
        tags: tagText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        privacyStatus: "private"
      });
      setOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function previewVoice(): Promise<void> {
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: (voice || "alloy").trim() || "alloy",
          speed: Number.isFinite(voiceSpeed) ? voiceSpeed : 1,
          text: previewText
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to generate preview audio.");
      }

      const blob = await response.blob();
      const playableBlob =
        blob.type && blob.type.startsWith("audio/")
          ? blob
          : new Blob([blob], { type: "audio/wav" });
      const url = URL.createObjectURL(playableBlob);
      if (previewAudioUrlRef.current) {
        URL.revokeObjectURL(previewAudioUrlRef.current);
      }
      previewAudioUrlRef.current = url;

      const audio = previewAudioRef.current;
      if (!audio) {
        throw new Error("Voice preview player is unavailable.");
      }
      audio.src = url;
      audio.load();
      await audio.play();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Voice preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled}>
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Upload to YouTube</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              onClick={previewVoice}
              disabled={previewDisabled}
              title="Voice preview"
              aria-label="Voice preview"
            >
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogDescription>
            Configure metadata and start upload with your saved OAuth credentials.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <audio ref={previewAudioRef} className="hidden" />
          <div className="space-y-2">
            <label htmlFor="upload-title" className="text-sm font-medium">Title</label>
            <Input
              id="upload-title"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="upload-description" className="text-sm font-medium">Description</label>
            <Textarea
              id="upload-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="upload-tags" className="text-sm font-medium">Tags (comma separated)</label>
            <Input
              id="upload-tags"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
          </div>
          {uploadError ? (
            <p className="text-sm text-destructive">
              {uploadError} {uploadError.includes("credentials") ? "먼저 /settings 에서 YouTube 값을 입력해 주세요." : ""}
            </p>
          ) : null}
          {previewError ? (
            <p className="text-sm text-destructive">{previewError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={disabled}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
