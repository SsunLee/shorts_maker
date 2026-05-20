import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";
import type { BlogStockMarket } from "@/lib/blog-storage";

export const runtime = "nodejs";

const schema = z.object({
  market: z.enum(["KOSPI", "KOSDAQ", "ALL"]).default("KOSPI")
});

type KrxFinderRow = {
  codeName?: string;
  full_code?: string;
  marketCode?: string;
  marketEngName?: string;
  marketName?: string;
  short_code?: string;
};

type KrxOpenApiRow = {
  ISU_ABBRV?: string;
  ISU_NM?: string;
  ISU_SRT_CD?: string;
  MKT_NM?: string;
  MKTCAP?: string;
};

type KrxStockRow = {
  code: string;
  fullCode?: string;
  market: BlogStockMarket;
  name: string;
  rank: number;
};

function toKrxMarketCode(market: "KOSPI" | "KOSDAQ" | "ALL"): "STK" | "KSQ" | "ALL" {
  if (market === "KOSDAQ") return "KSQ";
  if (market === "ALL") return "ALL";
  return "STK";
}

function toKrxOpenApiEndpoint(market: "KOSPI" | "KOSDAQ"): string {
  return market === "KOSDAQ"
    ? "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd"
    : "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd";
}

function normalizeMarket(row: KrxFinderRow): BlogStockMarket {
  const code = String(row.marketCode || "").toUpperCase();
  const eng = String(row.marketEngName || "").toUpperCase();
  const kor = String(row.marketName || "");
  if (code === "KSQ" || eng === "KOSDAQ" || kor.includes("코스닥")) return "KOSDAQ";
  if (code === "STK" || eng === "KOSPI" || kor.includes("유가증권")) return "KOSPI";
  return "OTHER";
}

function normalizeOpenApiMarket(rawMarket: "KOSPI" | "KOSDAQ", row: KrxOpenApiRow): BlogStockMarket {
  const marketName = String(row.MKT_NM || "").toUpperCase();
  if (marketName.includes("KOSDAQ") || marketName.includes("코스닥")) return "KOSDAQ";
  if (marketName.includes("KOSPI") || marketName.includes("유가증권")) return "KOSPI";
  return rawMarket;
}

function parseNumber(raw: string | undefined): number {
  const value = Number.parseFloat(String(raw || "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function formatKrxDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function recentKrxDates(): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() - offset);
    dates.push(formatKrxDate(date));
  }
  return dates;
}

function extractOpenApiRows(json: unknown): KrxOpenApiRow[] {
  if (Array.isArray(json)) {
    return json as KrxOpenApiRow[];
  }
  if (!json || typeof json !== "object") {
    return [];
  }
  const record = json as Record<string, unknown>;
  for (const key of ["OutBlock_1", "outBlock1", "output", "data", "block1"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as KrxOpenApiRow[];
    }
  }
  return [];
}

function openApiRowsToStocks(market: "KOSPI" | "KOSDAQ", rows: KrxOpenApiRow[]): KrxStockRow[] {
  return rows
    .map((row) => ({
      code: String(row.ISU_SRT_CD || "").trim(),
      market: normalizeOpenApiMarket(market, row),
      marketCap: parseNumber(row.MKTCAP),
      name: String(row.ISU_ABBRV || row.ISU_NM || "").trim()
    }))
    .filter((item) => item.code && item.name)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((item, index) => ({
      code: item.code,
      market: item.market,
      name: item.name,
      rank: index + 1
    }));
}

async function fetchKrxOpenApiMarket(market: "KOSPI" | "KOSDAQ", apiKey: string): Promise<{ basDd: string; stocks: KrxStockRow[] }> {
  const endpoint = toKrxOpenApiEndpoint(market);
  let lastError = "";

  for (const basDd of recentKrxDates()) {
    const url = `${endpoint}?basDd=${encodeURIComponent(basDd)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        AUTH_KEY: apiKey
      },
      cache: "no-store"
    });

    if (!response.ok) {
      lastError = `HTTP ${response.status}`;
      continue;
    }

    const text = await response.text();
    try {
      const rows = extractOpenApiRows(JSON.parse(text));
      const stocks = openApiRowsToStocks(market, rows);
      if (stocks.length > 0) {
        return { basDd, stocks };
      }
      lastError = "빈 응답";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "JSON 파싱 실패";
    }
  }

  throw new Error(`KRX OpenAPI ${market} 일별매매정보를 가져오지 못했습니다. ${lastError}`);
}

async function fetchKrxOpenApiStocks(
  market: "KOSPI" | "KOSDAQ" | "ALL",
  apiKey: string
): Promise<{ basDd?: string; stocks: KrxStockRow[] }> {
  const markets: Array<"KOSPI" | "KOSDAQ"> = market === "ALL" ? ["KOSPI", "KOSDAQ"] : [market];
  const results = await Promise.all(markets.map((item) => fetchKrxOpenApiMarket(item, apiKey)));
  return {
    basDd: results.map((item) => item.basDd).filter(Boolean).join(","),
    stocks: results.flatMap((item) => item.stocks)
  };
}

async function fetchKrxFinderStocks(market: "KOSPI" | "KOSDAQ" | "ALL"): Promise<KrxStockRow[]> {
  const marketCode = toKrxMarketCode(market);
  const body = new URLSearchParams({
    bld: "dbms/comm/finder/finder_stkisu",
    locale: "ko_KR",
    mktsel: marketCode,
    searchText: ""
  });

  const response = await fetch("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest"
    },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`KRX 종목 목록 요청 실패: HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim().startsWith("{")) {
    throw new Error(`KRX 종목 목록 응답이 JSON이 아닙니다: ${text.slice(0, 80)}`);
  }

  const json = JSON.parse(text) as { block1?: KrxFinderRow[] };
  const rows = Array.isArray(json.block1) ? json.block1 : [];
  return rows
    .map((row, index) => ({
      code: String(row.short_code || "").trim(),
      fullCode: String(row.full_code || "").trim(),
      market: normalizeMarket(row),
      name: String(row.codeName || "").trim(),
      rank: index + 1
    }))
    .filter((item) => item.name && item.code);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = schema.parse({
      market: request.nextUrl.searchParams.get("market") || "KOSPI"
    });
    const settings = await getSettings(userId);
    const apiKey = String(settings.krxApiKey || "").trim();
    let source = "KRX finder_stkisu";
    let warning = "";
    let basDd = "";
    let stocks: KrxStockRow[] = [];

    if (apiKey) {
      try {
        const result = await fetchKrxOpenApiStocks(payload.market, apiKey);
        stocks = result.stocks;
        basDd = result.basDd || "";
        source = "KRX OpenAPI daily trading";
      } catch (error) {
        warning = error instanceof Error ? error.message : "KRX OpenAPI 요청 실패";
      }
    }

    if (stocks.length === 0) {
      stocks = await fetchKrxFinderStocks(payload.market);
      source = warning ? `KRX finder_stkisu fallback (${warning})` : "KRX finder_stkisu";
    }

    return NextResponse.json({
      basDd,
      fetchedAt: new Date().toISOString(),
      market: payload.market,
      source,
      stocks
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "KRX 종목 목록을 가져오지 못했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
