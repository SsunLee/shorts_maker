"use client";

import { VideoCard } from "@/components/video-card";
import { VideoRow } from "@/lib/types";

interface VideoListProps {
  rows: VideoRow[];
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

export function VideoList({
  rows,
  onRegenerate,
  onDelete,
  onUpload
}: VideoListProps): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white/80 p-8 text-center text-muted-foreground">
        No generated videos yet. Start from the Create page.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <VideoCard
          key={row.id}
          row={row}
          onRegenerate={onRegenerate}
          onDelete={onDelete}
          onUpload={onUpload}
        />
      ))}
    </div>
  );
}
