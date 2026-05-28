import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedBrowserOrigins = [
  /^https:\/\/shorts-maker-icux(?:-[a-z0-9-]+)?\.vercel\.app$/i,
  /^https:\/\/shorts-maker-icux\.vercel\.app$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i
];

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const allowOrigin = allowedBrowserOrigins.some((pattern) => pattern.test(origin)) ? origin : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin"
  };
}

function json(request: NextRequest, body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init?.headers || {})
    }
  });
}

function statusPath(): string {
  return path.join(process.cwd(), ".local", "blog-tistory-automation", "status.json");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const status = JSON.parse(await readFile(statusPath(), "utf8")) as Record<string, unknown>;
    return json(request, status);
  } catch {
    return json(request, {
      logs: [],
      message: "실행 이력이 없습니다.",
      state: "idle",
      step: "idle"
    });
  }
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}
