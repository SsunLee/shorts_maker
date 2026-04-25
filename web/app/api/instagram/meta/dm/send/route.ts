import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { appendInstagramDmRunLog, type InstagramDmDeliveryLog } from "@/lib/instagram-dm-store";
import {
  getInstagramMetaAccountInfo,
  sendInstagramDmText
} from "@/lib/instagram-meta-dm-service";

export const runtime = "nodejs";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(300),
  messageTemplate: z.string().min(1).max(3000),
  usernameColumn: z.string().optional(),
  nameColumn: z.string().optional(),
  rowIdColumn: z.string().optional(),
  statusColumn: z.string().min(1).default("status"),
  sentAtColumn: z.string().min(1).default("dm_sent_at"),
  resultColumn: z.string().min(1).default("dm_result"),
  messageIdColumn: z.string().min(1).default("dm_message_id"),
  skipCompleted: z.boolean().default(true),
  delayMs: z.number().int().min(800).max(10000).default(1800),
  dryRun: z.boolean().default(false)
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHeader(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeRow(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  Object.entries(input || {}).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").trim();
    if (!key) return;
    output[key] = String(rawValue ?? "");
  });
  return output;
}

function findColumnKey(row: Record<string, string>, columnName: string): string {
  const normalized = normalizeHeader(columnName);
  if (!normalized) {
    return columnName;
  }
  const existing = Object.keys(row).find((key) => normalizeHeader(key) === normalized);
  return existing || columnName;
}

function readColumnValue(row: Record<string, string>, columnName: string): string {
  const key = findColumnKey(row, columnName);
  return String(row[key] || "").trim();
}

function writeColumnValue(row: Record<string, string>, columnName: string, value: string): void {
  const key = findColumnKey(row, columnName);
  row[key] = value;
}

function renderTemplate(template: string, row: Record<string, string>): string {
  const withDoubleBraces = String(template || "").replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_match, token: string) =>
    readColumnValue(row, token)
  );
  return withDoubleBraces.replace(/\{(?!\{)\s*([^{}]+)\s*\}(?!\})/g, (_match, token: string) =>
    readColumnValue(row, token)
  );
}

function truncateText(value: string, maxLength: number): string {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isCompletedStatus(status: string): boolean {
  const normalized = normalizeHeader(status);
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("dm발송완료") ||
    normalized.includes("발송완료") ||
    normalized.includes("완료") ||
    normalized === "sent" ||
    normalized === "success"
  );
}

function isCapabilityError(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("does not have the capability") ||
    normalized.includes("application does not have the capability to make this api call") ||
    normalized.includes("(#3)") ||
    normalized.includes("(code: 3)") ||
    normalized.includes("permissions error") ||
    normalized.includes("(code: 10)") ||
    normalized.includes("(code: 200)")
  );
}

function toDmSendErrorMessage(rawMessage: string): string {
  if (isCapabilityError(rawMessage)) {
    return "현재 Meta 앱 권한/모드에서는 DM/비공개 답장 API 호출 권한이 없습니다. Meta App 설정(모드/권한/고급 액세스)을 확인해 주세요.";
  }
  return rawMessage || "DM 전송에 실패했습니다.";
}

function readCommentIdCandidate(row: Record<string, string>): string {
  const candidates = [
    readColumnValue(row, "comment_id"),
    readColumnValue(row, "commentid")
  ];
  return candidates.find((value) => /^\d{8,30}$/.test(String(value || "").trim())) || "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const rows = payload.rows.map((row) => normalizeRow(row));

    const metaInfo = await getInstagramMetaAccountInfo(userId);
    if (!metaInfo.ready) {
      const missing = metaInfo.missing && metaInfo.missing.length > 0 ? ` (누락: ${metaInfo.missing.join(", ")})` : "";
      return NextResponse.json(
        {
          error: `${metaInfo.message || "Meta 인증 상태가 준비되지 않았습니다."}${missing}`
        },
        { status: 400 }
      );
    }

    const startedAt = new Date().toISOString();
    const runId = randomUUID();
    const logs: InstagramDmDeliveryLog[] = [];

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let consecutiveFailures = 0;
    let interrupted = false;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const commentIdCandidate = readCommentIdCandidate(row);
      const rowId = payload.rowIdColumn ? readColumnValue(row, payload.rowIdColumn) : commentIdCandidate;
      const recipientName = payload.nameColumn ? readColumnValue(row, payload.nameColumn) : "";
      const currentStatus = readColumnValue(row, payload.statusColumn);
      const nowIso = new Date().toISOString();
      const recipientId = commentIdCandidate;

      if (interrupted) {
        skippedCount += 1;
        writeColumnValue(row, payload.resultColumn, "연속 실패 안전장치로 전송이 중단되었습니다.");
        logs.push({
          id: randomUUID(),
          rowIndex: index,
          rowId: rowId || undefined,
          recipientId,
          recipientName: recipientName || undefined,
          status: "skipped",
          message: "",
          sentAt: nowIso,
          error: "SAFETY_STOP"
        });
        continue;
      }

      if (payload.skipCompleted && isCompletedStatus(currentStatus)) {
        skippedCount += 1;
        writeColumnValue(row, payload.resultColumn, "기존 완료 상태로 건너뜀");
        logs.push({
          id: randomUUID(),
          rowIndex: index,
          rowId: rowId || undefined,
          recipientId,
          recipientName: recipientName || undefined,
          status: "skipped",
          message: "",
          sentAt: nowIso
        });
        continue;
      }

      const rendered = renderTemplate(payload.messageTemplate, row).trim();
      if (!commentIdCandidate) {
        failedCount += 1;
        consecutiveFailures += 1;
        writeColumnValue(row, payload.statusColumn, "DM 발송 실패");
        writeColumnValue(row, payload.resultColumn, "comment_id 누락");
        logs.push({
          id: randomUUID(),
          rowIndex: index,
          rowId: rowId || undefined,
          recipientId: "",
          recipientName: recipientName || undefined,
          status: "failed",
          message: rendered,
          sentAt: nowIso,
          error: "comment_id 누락"
        });
      } else if (!rendered) {
        failedCount += 1;
        consecutiveFailures += 1;
        writeColumnValue(row, payload.statusColumn, "DM 발송 실패");
        writeColumnValue(row, payload.resultColumn, "메시지 템플릿 결과가 비어 있습니다.");
        logs.push({
          id: randomUUID(),
          rowIndex: index,
          rowId: rowId || undefined,
          recipientId,
          recipientName: recipientName || undefined,
          status: "failed",
          message: "",
          sentAt: nowIso,
          error: "메시지 템플릿 결과가 비어 있습니다."
        });
      } else {
        try {
          let messageId = "";
          if (!payload.dryRun) {
            const dm = await sendInstagramDmText({
              userId,
              commentId: commentIdCandidate,
              message: rendered
            });
            messageId = String(dm.messageId || "");
          } else {
            messageId = `dryrun-${Date.now()}-${index + 1}`;
          }
          sentCount += 1;
          consecutiveFailures = 0;
          writeColumnValue(row, payload.statusColumn, payload.dryRun ? "DM 테스트 완료" : "DM 발송 완료");
          writeColumnValue(row, payload.sentAtColumn, nowIso);
          writeColumnValue(row, payload.resultColumn, payload.dryRun ? "테스트 전송 성공" : "전송 성공");
          writeColumnValue(row, payload.messageIdColumn, messageId);
          logs.push({
            id: randomUUID(),
            rowIndex: index,
            rowId: rowId || undefined,
            recipientId,
            recipientName: recipientName || undefined,
            status: "sent",
            message: rendered,
            sentAt: nowIso,
            messageId: messageId || undefined
          });
        } catch (sendError) {
          failedCount += 1;
          consecutiveFailures += 1;
          const rawMessage = sendError instanceof Error ? sendError.message : "DM 전송에 실패했습니다.";
          const message = toDmSendErrorMessage(rawMessage);
          writeColumnValue(row, payload.statusColumn, "DM 발송 실패");
          writeColumnValue(row, payload.resultColumn, truncateText(message, 180));
          logs.push({
            id: randomUUID(),
            rowIndex: index,
            rowId: rowId || undefined,
            recipientId,
            recipientName: recipientName || undefined,
            status: "failed",
            message: rendered,
            sentAt: nowIso,
            error: message
          });
        }
      }

      if (!payload.dryRun && consecutiveFailures >= 5) {
        interrupted = true;
      }
      if (!payload.dryRun && index < rows.length - 1) {
        await sleep(payload.delayMs);
      }
    }

    const finishedAt = new Date().toISOString();
    const run = {
      runId,
      startedAt,
      finishedAt,
      totalRows: rows.length,
      sentCount,
      failedCount,
      skippedCount,
      dryRun: payload.dryRun,
      logs
    };
    const state = await appendInstagramDmRunLog({
      userId,
      run
    });

    return NextResponse.json({
      ok: true,
      run,
      updatedRows: rows,
      interrupted,
      metaAccount: metaInfo.account,
      runs: state.runs.slice(0, 20)
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((item) => item.message).join(", ")
        : error instanceof Error
          ? error.message
          : "DM 자동 전송에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
