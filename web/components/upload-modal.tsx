"use client";

import { useEffect, useMemo, useState } from "react";
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
  tags,
  onUpload
}: UploadModalProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const defaultDescription = useMemo(
    () => buildUploadDescription(topic, narration, tags),
    [topic, narration, tags]
  );
  const defaultTags = useMemo(() => tags.join(", "), [tags]);
  const [localTitle, setLocalTitle] = useState(title);
  const [description, setDescription] = useState(defaultDescription);
  const [tagText, setTagText] = useState(defaultTags);

  const disabled = !videoUrl || uploading;

  useEffect(() => {
    if (!open) {
      return;
    }
    setUploadError(undefined);
    setLocalTitle(title);
    setDescription(defaultDescription);
    setTagText(defaultTags);
  }, [open, title, defaultDescription, defaultTags]);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled}>
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload to YouTube</DialogTitle>
          <DialogDescription>
            Configure metadata and start upload with your saved OAuth credentials.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
