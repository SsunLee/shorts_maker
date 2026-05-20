import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const bucket = request.nextUrl.searchParams.get("bucket") || "";
  const key = request.nextUrl.searchParams.get("key") || "";
  const etag = request.nextUrl.searchParams.get("etag") || "";

  return new NextResponse(
    `<!doctype html><html><body><pre id="result">${JSON.stringify({
      ok: true,
      bucket,
      key,
      etag
    })}</pre></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
