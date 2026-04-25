import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  fetchLatestGoogleNews,
  isSupportedGoogleNewsCountry,
  listSupportedGoogleNewsCountries
} from "@/lib/google-news";

export const runtime = "nodejs";

const schema = z.object({
  country: z.string().trim().optional(),
  count: z.coerce.number().int().min(1).max(50).optional(),
  topic: z.string().trim().max(80).optional(),
  keyword: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = schema.parse({
      country: request.nextUrl.searchParams.get("country") || undefined,
      count: request.nextUrl.searchParams.get("count") || undefined,
      topic: request.nextUrl.searchParams.get("topic") || undefined,
      keyword: request.nextUrl.searchParams.get("keyword") || undefined,
      query: request.nextUrl.searchParams.get("query") || undefined
    });

    const countryRaw = String(parsed.country || "KR").toUpperCase();
    if (!isSupportedGoogleNewsCountry(countryRaw)) {
      return NextResponse.json(
        {
          error: "Unsupported country code.",
          supportedCountries: listSupportedGoogleNewsCountries()
        },
        { status: 400 }
      );
    }

    const count = parsed.count ?? 10;
    const topic = String(parsed.topic || "").trim();
    const keyword = String(parsed.keyword || "").trim();
    const composedQuery = [topic, keyword].filter(Boolean).join(" ").trim();
    const effectiveQuery = composedQuery || String(parsed.query || "").trim();
    const items = await fetchLatestGoogleNews({
      country: countryRaw,
      count,
      query: effectiveQuery || undefined,
      userId
    });

    return NextResponse.json(
      {
        country: countryRaw,
        count,
        topic,
        keyword,
        query: effectiveQuery,
        fetchedAt: new Date().toISOString(),
        items
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Google News.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
