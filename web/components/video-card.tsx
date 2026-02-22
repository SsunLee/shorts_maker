"use client";

import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressIndicator } from "@/components/progress-indicator";
import { UploadModal } from "@/components/upload-modal";
import { statusTone } from "@/lib/status";
import { VideoRow } from "@/lib/types";

function isLocalHostName(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function toDisplayMediaUrl(raw?: string): string | undefined {
  if (!raw || typeof window === "undefined") {
    return raw;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    // Only rewrite web static generated assets.
    if (!parsed.pathname.startsWith("/generated/")) {
      return parsed.toString();
    }
    if (
      isLocalHostName(parsed.hostname) &&
      parsed.origin !== window.location.origin
    ) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

interface VideoCardProps {
  row: VideoRow;
  onRegenerate: (row: VideoRow) => Promise<void>;
  onDelete: (row: VideoRow) => Promise<void>;
  onUpload: (
    row: VideoRow,
    payload: {
      title: string;
      description: string;
      tags: string[];
      privacyStatus: "private" | "public" | "unlisted";
    }
  ) => Promise<void>;
}

export function VideoCard({
  row,
  onRegenerate,
  onDelete,
  onUpload
}: VideoCardProps): React.JSX.Element {
  const normalizedTitle = row.title.replace(/\s+/g, " ").trim();
  const displayTitle =
    normalizedTitle.length > 90 ? `${normalizedTitle.slice(0, 90)}...` : normalizedTitle || "Untitled";

  return (
    <Card className="h-full">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-h-[2.5rem] max-w-[78%] overflow-hidden">
            <CardTitle
              className="overflow-hidden text-base leading-5 break-words"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical"
              }}
              title={normalizedTitle || "Untitled"}
            >
              {displayTitle}
            </CardTitle>
          </div>
          <Badge variant={statusTone(row.status)}>{row.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {row.videoUrl ? (
          <video
            className="aspect-[9/16] w-full rounded-md border bg-black object-cover"
            src={toDisplayMediaUrl(row.videoUrl)}
            controls
            preload="none"
          />
        ) : (
          <div className="aspect-[9/16] w-full rounded-md border bg-muted" />
        )}
        <ProgressIndicator row={row} />
        {row.youtubeUrl ? (
          <Link
            href={row.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open YouTube
          </Link>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onRegenerate(row)}>
          <RotateCcw className="h-4 w-4" />
          Regenerate
        </Button>
        <UploadModal
          title={row.title}
          topic={row.topic}
          narration={row.narration}
          videoUrl={row.videoUrl}
          tags={row.tags}
          onUpload={(payload) => onUpload(row, payload)}
        />
        <Button variant="destructive" size="sm" onClick={() => onDelete(row)}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
