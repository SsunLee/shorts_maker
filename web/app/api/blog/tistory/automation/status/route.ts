import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function statusPath(): string {
  return path.join(process.cwd(), ".local", "blog-tistory-automation", "status.json");
}

export async function GET(): Promise<NextResponse> {
  try {
    const status = JSON.parse(await readFile(statusPath(), "utf8")) as Record<string, unknown>;
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({
      logs: [],
      message: "실행 이력이 없습니다.",
      state: "idle",
      step: "idle"
    });
  }
}
