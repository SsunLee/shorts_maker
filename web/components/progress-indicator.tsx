import { Progress } from "@/components/ui/progress";
import { STATUS_LABELS } from "@/lib/status";
import { VideoRow } from "@/lib/types";

interface ProgressIndicatorProps {
  row: VideoRow;
}

export function ProgressIndicator({ row }: ProgressIndicatorProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{STATUS_LABELS[row.status]}</span>
        <span className="text-muted-foreground">{row.progress}%</span>
      </div>
      <Progress value={row.progress} />
      {row.error ? <p className="text-xs text-destructive">{row.error}</p> : null}
    </div>
  );
}
