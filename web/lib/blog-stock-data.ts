export type BlogStockMetricsSource = "naver-finance";

export type BlogStockFinancialRow = {
  label: string;
  unit: string;
  values: Array<number | undefined>;
};

export type BlogStockFinancialPeriod = {
  estimated: boolean;
  label: string;
};

export type BlogStockNewsItem = {
  link: string;
  publishedAt?: string;
  source?: string;
  title: string;
};

export type BlogStockTargetConsensus = {
  investmentOpinion?: string;
  opinionScore?: number;
  source: "네이버 금융";
  targetPrice?: number;
};

export type BlogStockMetrics = {
  code: string;
  errors: string[];
  fetchedAt: string;
  financialPeriods: BlogStockFinancialPeriod[];
  financialRows: BlogStockFinancialRow[];
  latestNews: BlogStockNewsItem[];
  latestNewsSearchUrl?: string;
  market?: string;
  marketCapEok?: number;
  marketCapRank?: string;
  name: string;
  quoteDate?: string;
  quote: {
    changeText?: string;
    currentPrice?: number;
    highPrice?: number;
    lowPrice?: number;
    openPrice?: number;
    previousClose?: number;
    tradingValueMillion?: number;
    volume?: number;
  };
  listedShares?: number;
  source: BlogStockMetricsSource;
  sourceUrl: string;
  targetConsensus?: BlogStockTargetConsensus;
};

type FetchStockMetricsArgs = {
  code?: string;
  name?: string;
};

const NAVER_FINANCE_BASE_URL = "https://finance.naver.com/item/main.naver";
const GOOGLE_NEWS_RSS_BASE_URL = "https://news.google.com/rss/search";
const STOCK_UP_COLOR = "#e03131";
const STOCK_DOWN_COLOR = "#1c7ed6";
const STOCK_FLAT_COLOR = "#868e96";

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      } catch {
        return match;
      }
    })
    .replace(/&#(\d+);/g, (match, code) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 10));
      } catch {
        return match;
      }
    });
}

function stripTags(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(raw: string | undefined): number | undefined {
  const cleaned = String(raw || "")
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return undefined;
  }
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function formatInteger(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "-";
}

function formatDecimal(value: number | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "-";
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function coloredSpan(text: string, color: string): string {
  return `<span style="color:${color};font-weight:700">${text}</span>`;
}

function formatSignedPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value > 0) {
    return coloredSpan(`▲ +${value.toFixed(1)}%`, STOCK_UP_COLOR);
  }
  if (value < 0) {
    return coloredSpan(`▼ ${value.toFixed(1)}%`, STOCK_DOWN_COLOR);
  }
  return coloredSpan("0.0%", STOCK_FLAT_COLOR);
}

function formatQuoteChange(changeText: string | undefined): string {
  const raw = String(changeText || "").trim();
  if (!raw) {
    return "-";
  }

  if (raw.includes("보합")) {
    return coloredSpan("보합", STOCK_FLAT_COLOR);
  }

  const isUp = raw.includes("상승") || raw.includes("플러스");
  const isDown = raw.includes("하락") || raw.includes("마이너스");
  const amount = parseNumber(raw.match(/(?:상승|하락)\s+([\d,]+)/)?.[1]);
  const percent = parseNumber(raw.match(/(?:플러스|마이너스)\s+([\d.]+)\s*퍼센트/)?.[1]);

  if (isUp) {
    const amountText = typeof amount === "number" ? `+${formatInteger(amount)}원` : "상승";
    const percentText = typeof percent === "number" ? ` (+${percent.toFixed(2)}%)` : "";
    return coloredSpan(`▲ ${amountText}${percentText}`, STOCK_UP_COLOR);
  }

  if (isDown) {
    const amountText = typeof amount === "number" ? `-${formatInteger(amount)}원` : "하락";
    const percentText = typeof percent === "number" ? ` (-${percent.toFixed(2)}%)` : "";
    return coloredSpan(`▼ ${amountText}${percentText}`, STOCK_DOWN_COLOR);
  }

  return raw;
}

function extractBlindItems(html: string): string[] {
  return [...html.matchAll(/<dl class="blind">([\s\S]*?)<\/dl>/g)].flatMap((match) =>
    [...match[1].matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map((item) => stripTags(item[1]))
  );
}

function extractListedShares(html: string): number | undefined {
  const match = html.match(/<th[^>]*>\s*상장주식수\s*<\/th>\s*<td[^>]*>\s*<em[^>]*>([\d,]+)<\/em>/i);
  return parseNumber(match?.[1]);
}

function extractMarketCapRank(html: string): string | undefined {
  const idx = html.indexOf("시가총액순위");
  if (idx < 0) {
    return undefined;
  }
  const snippet = html.slice(idx, idx + 600);
  const value = stripTags(snippet.match(/<td[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "");
  return value || undefined;
}

function extractTargetConsensus(html: string): BlogStockTargetConsensus | undefined {
  const opinionIndex = html.indexOf("투자의견");
  const targetIndex = html.indexOf("목표주가");
  const firstIndex = [opinionIndex, targetIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (typeof firstIndex !== "number") {
    return undefined;
  }

  const snippet = stripTags(html.slice(Math.max(0, firstIndex - 1000), firstIndex + 3500));
  const directMatch = snippet.match(/투자의견\s+투자의견\s*l\s*목표주가\s*([\d.]+)?\s*([가-힣A-Za-z]+)?\s*l\s*([\d,]+)/);
  const looseMatch = snippet.match(/목표주가\s*([\d.]+)?\s*([가-힣A-Za-z]+)?\s*l\s*([\d,]+)/);
  const match = directMatch || looseMatch;
  if (!match) {
    return undefined;
  }

  const opinionScore = parseNumber(match[1]);
  const investmentOpinion = String(match[2] || "").trim() || undefined;
  const targetPrice = parseNumber(match[3]);
  if (!investmentOpinion && typeof targetPrice !== "number" && typeof opinionScore !== "number") {
    return undefined;
  }

  return {
    investmentOpinion,
    opinionScore,
    source: "네이버 금융",
    targetPrice
  };
}

function extractAnnualPeriods(html: string): BlogStockFinancialPeriod[] {
  const idx = html.indexOf("최근 연간 실적");
  if (idx < 0) {
    return [];
  }
  const block = html.slice(idx, idx + 35000);
  const periods = [...block.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
    .map((match) => stripTags(match[1]))
    .filter((value) => /^\d{4}\.\d{2}/.test(value))
    .slice(0, 4)
    .map((label) => ({
      estimated: /\(E\)/i.test(label),
      label
    }));
  return periods;
}

function extractFinancialValues(html: string, label: string, count: number): Array<number | undefined> {
  const idx = html.indexOf(`<strong>${label}</strong>`);
  if (idx < 0) {
    return [];
  }
  const rowStart = html.lastIndexOf("<tr", idx);
  const rowEnd = html.indexOf("</tr>", idx);
  if (rowStart < 0 || rowEnd < 0) {
    return [];
  }
  const row = html.slice(rowStart, rowEnd + 5);
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((match) => parseNumber(stripTags(match[1])))
    .slice(0, count);
}

function getRowValue(rows: BlogStockFinancialRow[], label: string, index: number): number | undefined {
  return rows.find((row) => row.label === label)?.values[index];
}

function getLatestActualIndex(periods: BlogStockFinancialPeriod[], rows: BlogStockFinancialRow[]): number {
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    if (periods[index]?.estimated) {
      continue;
    }
    if (rows.some((row) => typeof row.values[index] === "number")) {
      return index;
    }
  }
  return Math.max(0, periods.length - 1);
}

function calcGrowth(current: number | undefined, previous: number | undefined): number | undefined {
  if (typeof current !== "number" || typeof previous !== "number" || previous === 0) {
    return undefined;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildTrendLines(metrics: BlogStockMetrics): string[] {
  const periods = metrics.financialPeriods;
  const rows = metrics.financialRows;
  const latestIndex = getLatestActualIndex(periods, rows);
  const previousIndex = latestIndex > 0 ? latestIndex - 1 : -1;
  const latestPeriod = periods[latestIndex]?.label;
  const previousPeriod = periods[previousIndex]?.label;
  const lines: string[] = [];

  const addTrend = (label: string) => {
    const current = getRowValue(rows, label, latestIndex);
    const previous = previousIndex >= 0 ? getRowValue(rows, label, previousIndex) : undefined;
    const growth = calcGrowth(current, previous);
    if (!latestPeriod || !previousPeriod || typeof current !== "number" || typeof previous !== "number") {
      return;
    }
    lines.push(
      `- ${label}: ${previousPeriod} ${formatInteger(previous)}억원 -> ${latestPeriod} ${formatInteger(current)}억원 (${formatSignedPercent(growth)})`
    );
  };

  addTrend("매출액");
  addTrend("영업이익");
  addTrend("당기순이익");

  const latestRevenue = getRowValue(rows, "매출액", latestIndex);
  const latestOperatingIncome = getRowValue(rows, "영업이익", latestIndex);
  const previousRevenue = previousIndex >= 0 ? getRowValue(rows, "매출액", previousIndex) : undefined;
  const previousOperatingIncome = previousIndex >= 0 ? getRowValue(rows, "영업이익", previousIndex) : undefined;
  const latestMargin =
    typeof latestRevenue === "number" && latestRevenue !== 0 && typeof latestOperatingIncome === "number"
      ? (latestOperatingIncome / latestRevenue) * 100
      : undefined;
  const previousMargin =
    typeof previousRevenue === "number" && previousRevenue !== 0 && typeof previousOperatingIncome === "number"
      ? (previousOperatingIncome / previousRevenue) * 100
      : undefined;
  if (typeof latestMargin === "number") {
    const previousText = typeof previousMargin === "number" ? `, 전년 ${previousMargin.toFixed(1)}%` : "";
    lines.push(`- 영업이익률: ${latestPeriod || "최근"} ${latestMargin.toFixed(1)}%${previousText}`);
  }

  const latestRoe = getRowValue(rows, "ROE(지배주주)", latestIndex);
  if (typeof latestRoe === "number") {
    lines.push(`- ROE: ${latestPeriod || "최근"} ${latestRoe.toFixed(1)}%`);
  }

  const latestDebtRatio = getRowValue(rows, "부채비율", latestIndex);
  if (typeof latestDebtRatio === "number") {
    lines.push(`- 부채비율: ${latestPeriod || "최근"} ${latestDebtRatio.toFixed(1)}%`);
  }

  if (lines.length === 0) {
    lines.push("- 현재 수집 가능한 재무 항목이 부족합니다. 본문에서는 확인 필요 항목으로만 다룹니다.");
  }

  return lines;
}

function buildFinancialRows(html: string, periods: BlogStockFinancialPeriod[]): BlogStockFinancialRow[] {
  const count = periods.length || 4;
  const candidates: BlogStockFinancialRow[] = [
    { label: "매출액", unit: "억원", values: extractFinancialValues(html, "매출액", count) },
    { label: "영업이익", unit: "억원", values: extractFinancialValues(html, "영업이익", count) },
    { label: "당기순이익", unit: "억원", values: extractFinancialValues(html, "당기순이익", count) },
    { label: "ROE(지배주주)", unit: "%", values: extractFinancialValues(html, "ROE(지배주주)", count) },
    { label: "부채비율", unit: "%", values: extractFinancialValues(html, "부채비율", count) },
    { label: "EPS(원)", unit: "원", values: extractFinancialValues(html, "EPS(원)", count) },
    { label: "PER(배)", unit: "배", values: extractFinancialValues(html, "PER(배)", count) },
    { label: "PBR(배)", unit: "배", values: extractFinancialValues(html, "PBR(배)", count) }
  ];
  return candidates.filter((row) => row.values.some((value) => typeof value === "number"));
}

function formatChartNumber(value: number | undefined, unit: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (unit === "%") {
    return `${formatDecimal(value, 1)}%`;
  }
  if (unit === "배") {
    return `${formatDecimal(value, 2)}배`;
  }
  if (unit === "원") {
    return `${formatInteger(value)}원`;
  }
  return `${formatInteger(value)}${unit}`;
}

function barColor(value: number, fallbackColor: string): string {
  return value < 0 ? STOCK_DOWN_COLOR : fallbackColor;
}

function sectionHeading(label: string): string {
  return `<h2 style="margin:42px 0 18px;font-size:1.45em;line-height:1.35;font-weight:900;color:inherit;">${escapeHtml(label)}</h2>`;
}

function sourceNote(text: string): string {
  return `<p style="margin:0 0 16px;font-size:0.95em;line-height:1.7;color:#495057;">${escapeHtml(text)}</p>`;
}

function buildGoogleNewsRssUrl(args: { code: string; name: string }): string {
  const query = `${args.name} ${args.code} 주식 뉴스 공시`;
  const params = new URLSearchParams({
    ceid: "KR:ko",
    gl: "KR",
    hl: "ko",
    q: query
  });
  return `${GOOGLE_NEWS_RSS_BASE_URL}?${params.toString()}`;
}

function cleanXmlText(value: string | undefined): string {
  return decodeHtml(String(value || ""))
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

function parseGoogleNewsRss(xml: string): BlogStockNewsItem[] {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const seen = new Set<string>();
  const news: BlogStockNewsItem[] = [];

  for (const item of items) {
    const block = item[1];
    const title = cleanXmlText(extractXmlTag(block, "title"));
    const link = cleanXmlText(extractXmlTag(block, "link"));
    if (!title || !/^https?:\/\//i.test(link)) {
      continue;
    }
    const key = title.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    news.push({
      link,
      publishedAt: cleanXmlText(extractXmlTag(block, "pubDate")) || undefined,
      source: cleanXmlText(extractXmlTag(block, "source")) || undefined,
      title
    });
    if (news.length >= 5) {
      break;
    }
  }

  return news;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLatestNewsItems(args: { code: string; name: string }): Promise<{ items: BlogStockNewsItem[]; url: string }> {
  const url = buildGoogleNewsRssUrl(args);
  const xml = await fetchTextWithTimeout(url, 10000);
  return {
    items: parseGoogleNewsRss(xml),
    url
  };
}

function formatNewsDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ko-KR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getPointX(index: number, count: number): number {
  if (count <= 1) {
    return 50;
  }
  return 8 + (index / (count - 1)) * 84;
}

function getPointY(value: number, min: number, max: number): number {
  if (max === min) {
    return 50;
  }
  return ((max - value) / (max - min)) * 100;
}

function buildFinancialMetricChartHtml(
  metrics: BlogStockMetrics,
  config: { color: string; label: string }
): string {
  const row = metrics.financialRows.find((financialRow) => financialRow.label === config.label);
  if (!row || metrics.financialPeriods.length === 0) {
    return "";
  }

  const points = metrics.financialPeriods.map((period, index) => ({
    label: period.label,
    value: row.values[index]
  }));
  const numericValues = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) {
    return "";
  }

  const rawMin = Math.min(0, ...numericValues);
  const rawMax = Math.max(0, ...numericValues);
  const padding = Math.max(1, (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.12);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const zeroY = Math.max(0, Math.min(100, getPointY(0, min, max)));
  const count = points.length;

  const linePoints = points
    .map((point, index) => {
      if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
        return "";
      }
      return `${getPointX(index, count).toFixed(2)},${getPointY(point.value, min, max).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");

  const dots = points
    .map((point, index) => {
      if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
        return "";
      }
      const x = getPointX(index, count);
      const y = getPointY(point.value, min, max);
      return `<div style="position:absolute;left:calc(${x.toFixed(2)}% - 5px);top:calc(${y.toFixed(2)}% - 5px);width:10px;height:10px;border:3px solid ${config.color};background:#ffffff;border-radius:999px;box-sizing:border-box;z-index:3;"></div>`;
    })
    .join("");

  const bars = points
    .map((point, index) => {
      if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
        return "";
      }
      const x = getPointX(index, count);
      const y = getPointY(point.value, min, max);
      const top = Math.min(y, zeroY);
      const height = Math.max(2, Math.abs(y - zeroY));
      const color = barColor(point.value, config.color);
      const rounded = point.value < 0 ? "2px 2px 10px 10px" : "10px 10px 2px 2px";
      return [
        `<div title="${escapeHtml(`${point.label} ${formatChartNumber(point.value, row.unit)}`)}" style="position:absolute;left:calc(${x.toFixed(2)}% - 16px);top:${top.toFixed(2)}%;width:32px;height:${height.toFixed(2)}%;background:${color};border-radius:${rounded};opacity:0.7;"></div>`
      ].join("");
    })
    .join("");

  const labels = points
    .map((point) => {
      const valueText = typeof point.value === "number" ? formatChartNumber(point.value, row.unit) : "-";
      return [
        '<div style="min-width:0;text-align:center;">',
        `<div style="font-size:11px;color:#868e96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(point.label)}</div>`,
        `<div style="margin-top:3px;font-size:12px;font-weight:800;color:#212529;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(valueText)}</div>`,
        "</div>"
      ].join("");
    })
    .join("");

  const validPointValues = points
    .map((point, index) => ({ index, value: point.value }))
    .filter((point): point is { index: number; value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  const latestPoint = validPointValues[validPointValues.length - 1];
  const previousPoint = validPointValues[validPointValues.length - 2];
  const growth = latestPoint && previousPoint ? calcGrowth(latestPoint.value, previousPoint.value) : undefined;
  const summary =
    latestPoint && previousPoint
      ? `${escapeHtml(points[previousPoint.index].label)} ${escapeHtml(formatChartNumber(previousPoint.value, row.unit))} → ${escapeHtml(points[latestPoint.index].label)} ${escapeHtml(formatChartNumber(latestPoint.value, row.unit))} (${formatSignedPercent(growth)})`
      : `${escapeHtml(points[latestPoint?.index || 0]?.label || "최근")} ${escapeHtml(formatChartNumber(latestPoint?.value, row.unit))}`;

  return [
    '<div data-blog-chart="stock-financial-metric" style="margin:18px 0;padding:18px;border:1px solid #dee2e6;border-radius:16px;background:#ffffff;box-shadow:0 8px 24px rgba(15,23,42,0.06);">',
    '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:8px;">',
    `<div style="font-size:17px;font-weight:900;color:#111827;">${escapeHtml(config.label)}</div>`,
    `<div style="font-size:12px;color:#868e96;">단위: ${escapeHtml(row.unit)}</div>`,
    "</div>",
    `<div style="font-size:12px;color:#495057;margin-bottom:14px;">${summary}</div>`,
    '<div style="position:relative;height:190px;border-left:1px solid #e9ecef;border-bottom:1px solid #e9ecef;background:linear-gradient(to bottom, rgba(233,236,239,0.65) 1px, transparent 1px);background-size:100% 25%;">',
    `<div style="position:absolute;left:0;right:0;top:${zeroY.toFixed(2)}%;border-top:1px dashed #adb5bd;"></div>`,
    bars,
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:2;"><polyline points="${linePoints}" fill="none" stroke="${config.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline></svg>`,
    dots,
    "</div>",
    `<div style="display:grid;grid-template-columns:repeat(${count}, minmax(0,1fr));gap:8px;margin-top:10px;">${labels}</div>`,
    "</div>"
  ].join("");
}

function buildFinancialChartHtml(metrics: BlogStockMetrics): string {
  const charts = [
    { color: "#228be6", label: "매출액" },
    { color: STOCK_UP_COLOR, label: "영업이익" },
    { color: "#7048e8", label: "당기순이익" }
  ]
    .map((config) => buildFinancialMetricChartHtml(metrics, config))
    .filter(Boolean);

  if (charts.length === 0) {
    return "";
  }

  return [
    '<div data-blog-chart-group="stock-financials" style="margin:4px 0 26px;">',
    '<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">각 차트는 항목별 연간 수치를 세로 막대와 추세선으로 함께 보여줍니다.</div>',
    ...charts,
    "</div>"
  ].join("");
}

function buildFinancialTableHtml(metrics: BlogStockMetrics): string {
  if (metrics.financialPeriods.length === 0 || metrics.financialRows.length === 0) {
    return '<p style="margin:8px 0 24px;color:#6b7280;">수집 가능한 최근 연간 실적 표가 없습니다.</p>';
  }

  const headerCells = metrics.financialPeriods
    .map((period) => `<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:right;white-space:nowrap;">${escapeHtml(period.label)}</th>`)
    .join("");
  const rows = metrics.financialRows
    .map((row) => {
      const cells = row.values
        .map((value) => {
          const text = row.unit === "%" || row.unit === "배" ? formatDecimal(value, 2) : formatInteger(value);
          return `<td style="padding:9px 10px;border:1px solid #d6dbe1;text-align:right;white-space:nowrap;">${escapeHtml(text)}</td>`;
        })
        .join("");
      return [
        "<tr>",
        `<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:left;white-space:nowrap;background:#fafafa;">${escapeHtml(row.label)}</th>`,
        `<td style="padding:9px 10px;border:1px solid #d6dbe1;text-align:center;white-space:nowrap;color:#495057;">${escapeHtml(row.unit)}</td>`,
        cells,
        "</tr>"
      ].join("");
    })
    .join("");

  return [
    '<div style="margin:8px 0 28px;overflow-x:auto;">',
    '<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45;">',
    '<thead><tr style="background:#f1f3f5;">',
    '<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:left;white-space:nowrap;">항목</th>',
    '<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:center;white-space:nowrap;">단위</th>',
    headerCells,
    "</tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</div>"
  ].join("");
}

function buildTrendListHtml(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }
  const items = lines
    .map((line) => String(line || "").replace(/^-\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `<li style="margin:7px 0;line-height:1.75;">${line}</li>`)
    .join("");
  return `<ul style="margin:10px 0 0;padding-left:22px;">${items}</ul>`;
}

function buildTargetConsensusHtml(metrics: BlogStockMetrics): string {
  const consensus = metrics.targetConsensus;
  if (!consensus || (!consensus.investmentOpinion && typeof consensus.targetPrice !== "number")) {
    return '<p style="margin:8px 0 24px;line-height:1.7;color:#6b7280;">네이버 금융에서 제공되는 증권사 투자의견/목표주가 데이터가 없습니다. 리포트가 발행되지 않았거나 컨센서스가 없는 종목일 수 있습니다.</p>';
  }

  const upside =
    typeof metrics.quote.currentPrice === "number" &&
    metrics.quote.currentPrice > 0 &&
    typeof consensus.targetPrice === "number"
      ? ((consensus.targetPrice - metrics.quote.currentPrice) / metrics.quote.currentPrice) * 100
      : undefined;

  return [
    '<div style="margin:8px 0 28px;overflow-x:auto;">',
    '<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45;">',
    '<tbody>',
    '<tr>',
    '<th style="width:32%;padding:9px 10px;border:1px solid #d6dbe1;text-align:left;background:#f8f9fa;white-space:nowrap;">투자의견</th>',
    `<td style="padding:9px 10px;border:1px solid #d6dbe1;">${escapeHtml(consensus.investmentOpinion || "-")}</td>`,
    "</tr>",
    '<tr>',
    '<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:left;background:#f8f9fa;white-space:nowrap;">투자의견 점수</th>',
    `<td style="padding:9px 10px;border:1px solid #d6dbe1;">${escapeHtml(formatDecimal(consensus.opinionScore, 2))}</td>`,
    "</tr>",
    '<tr>',
    '<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:left;background:#f8f9fa;white-space:nowrap;">목표주가</th>',
    `<td style="padding:9px 10px;border:1px solid #d6dbe1;">${
      typeof consensus.targetPrice === "number" ? `${escapeHtml(formatInteger(consensus.targetPrice))}원` : "-"
    }</td>`,
    "</tr>",
    '<tr>',
    '<th style="padding:9px 10px;border:1px solid #d6dbe1;text-align:left;background:#f8f9fa;white-space:nowrap;">현재가 대비</th>',
    `<td style="padding:9px 10px;border:1px solid #d6dbe1;">${formatSignedPercent(upside)}</td>`,
    "</tr>",
    "</tbody>",
    "</table>",
    '<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">목표주가는 증권사 리포트 컨센서스 기반 참고값이며, 실제 투자 판단에는 최신 리포트 원문과 공시 확인이 필요합니다.</p>',
    "</div>"
  ].join("");
}

function buildLatestNewsHtml(metrics: BlogStockMetrics): string {
  if (metrics.latestNews.length === 0) {
    const fallbackLink = metrics.latestNewsSearchUrl
      ? ` <a href="${escapeHtml(metrics.latestNewsSearchUrl)}" target="_blank" rel="noopener noreferrer" style="color:#228be6;">Google News에서 직접 확인</a>`
      : "";
    return `<p style="margin:8px 0 24px;line-height:1.7;color:#6b7280;">Google News RSS에서 최근 뉴스 결과를 찾지 못했습니다.${fallbackLink}</p>`;
  }

  const items = metrics.latestNews
    .map((item) => {
      const meta = [item.source, formatNewsDate(item.publishedAt)].filter(Boolean).join(" · ");
      return [
        '<li style="margin:10px 0;line-height:1.65;">',
        `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" style="color:#228be6;text-decoration:underline;">${escapeHtml(item.title)}</a>`,
        meta ? `<div style="margin-top:2px;font-size:12px;color:#868e96;">${escapeHtml(meta)}</div>` : "",
        "</li>"
      ].join("");
    })
    .join("");

  return [
    '<ol style="margin:10px 0 0;padding-left:22px;">',
    items,
    "</ol>",
    '<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">뉴스는 Google News RSS 검색 결과 기준입니다. 공시 원문은 DART/거래소 공시에서 최종 확인하는 것을 권장합니다.</p>'
  ].join("");
}

export async function fetchStockMetrics(args: FetchStockMetricsArgs): Promise<BlogStockMetrics> {
  const code = String(args.code || "").replace(/[^0-9]/g, "").padStart(6, "0");
  const name = String(args.name || code || "종목").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error("종목 코드 6자리가 필요합니다.");
  }

  const sourceUrl = `${NAVER_FINANCE_BASE_URL}?code=${encodeURIComponent(code)}`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`네이버 금융 데이터를 가져오지 못했습니다. HTTP ${response.status}`);
  }

  const html = await response.text();
  const errors: string[] = [];
  const blindItems = extractBlindItems(html);
  const quoteLine = blindItems.find((item) => item.startsWith("현재가 "));
  const currentPrice = parseNumber(quoteLine?.match(/현재가\s+([\d,]+)/)?.[1]);
  const marketCodeLine = blindItems.find((item) => item.startsWith("종목코드 "));
  const market = marketCodeLine?.replace(/^종목코드\s+\d+\s*/, "").trim();
  const quoteDate = blindItems.find((item) => item.includes("기준"));
  const listedShares = extractListedShares(html);
  const financialPeriods = extractAnnualPeriods(html);
  const financialRows = buildFinancialRows(html, financialPeriods);
  const marketCapEok =
    typeof currentPrice === "number" && typeof listedShares === "number"
      ? (currentPrice * listedShares) / 100000000
      : undefined;
  let latestNews: BlogStockNewsItem[] = [];
  let latestNewsSearchUrl: string | undefined;
  try {
    const newsResult = await fetchLatestNewsItems({ code, name });
    latestNews = newsResult.items;
    latestNewsSearchUrl = newsResult.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Google News RSS 조회 실패: ${message}`);
    latestNewsSearchUrl = buildGoogleNewsRssUrl({ code, name });
  }

  return {
    code,
    errors,
    fetchedAt: new Date().toISOString(),
    financialPeriods,
    financialRows,
    latestNews,
    latestNewsSearchUrl,
    listedShares,
    market,
    marketCapEok,
    marketCapRank: extractMarketCapRank(html),
    name,
    quoteDate,
    quote: {
      changeText: quoteLine?.replace(/^현재가\s+[\d,]+\s*/, "").trim(),
      currentPrice,
      highPrice: parseNumber(blindItems.find((item) => item.startsWith("고가 "))?.match(/고가\s+([\d,]+)/)?.[1]),
      lowPrice: parseNumber(blindItems.find((item) => item.startsWith("저가 "))?.match(/저가\s+([\d,]+)/)?.[1]),
      openPrice: parseNumber(blindItems.find((item) => item.startsWith("시가 "))?.match(/시가\s+([\d,]+)/)?.[1]),
      previousClose: parseNumber(blindItems.find((item) => item.startsWith("전일가 "))?.match(/전일가\s+([\d,]+)/)?.[1]),
      tradingValueMillion: parseNumber(
        blindItems.find((item) => item.startsWith("거래대금 "))?.match(/거래대금\s+([\d,]+)백만/)?.[1]
      ),
      volume: parseNumber(blindItems.find((item) => item.startsWith("거래량 "))?.match(/거래량\s+([\d,]+)/)?.[1])
    },
    source: "naver-finance",
    sourceUrl,
    targetConsensus: extractTargetConsensus(html)
  };
}

export function buildStockMetricsMarkdown(metrics: BlogStockMetrics): string {
  const quoteDate = metrics.quoteDate || new Date(metrics.fetchedAt).toLocaleString("ko-KR");
  const trendLines = buildTrendLines(metrics);
  const financialChartHtml = buildFinancialChartHtml(metrics);
  const financialTableHtml = buildFinancialTableHtml(metrics);
  const trendListHtml = buildTrendListHtml(trendLines);
  const targetConsensusHtml = buildTargetConsensusHtml(metrics);
  const latestNewsHtml = buildLatestNewsHtml(metrics);

  return [
    sectionHeading("핵심 숫자"),
    sourceNote(`데이터 기준: 네이버 금융, ${quoteDate}`),
    "",
    "| 항목 | 값 | 비고 |",
    "| --- | ---: | --- |",
    `| 현재가 | ${formatInteger(metrics.quote.currentPrice)}원 | ${formatQuoteChange(metrics.quote.changeText)} |`,
    `| 시가총액 | ${formatInteger(metrics.marketCapEok)}억원 | 현재가 x 상장주식수 계산값 |`,
    `| 시가총액 순위 | ${metrics.marketCapRank || "-"} | 네이버 금융 표시값 |`,
    `| 상장주식수 | ${formatInteger(metrics.listedShares)}주 | 네이버 금융 |`,
    `| 거래량 | ${formatInteger(metrics.quote.volume)}주 | ${quoteDate} |`,
    `| 거래대금 | ${formatInteger(metrics.quote.tradingValueMillion)}백만원 | ${quoteDate} |`,
    "",
    sectionHeading("최근 연간 실적"),
    financialTableHtml,
    financialChartHtml ? sectionHeading("실적 흐름 차트") : "",
    financialChartHtml,
    "",
    sectionHeading("숫자로 보는 흐름"),
    trendListHtml,
    "",
    sectionHeading("증권사 목표가 참고"),
    targetConsensusHtml,
    "",
    sectionHeading("최신 뉴스 및 공시 체크"),
    latestNewsHtml,
    "",
    `출처: [네이버 금융](${metrics.sourceUrl})${
      metrics.latestNewsSearchUrl ? `, [Google News RSS](${metrics.latestNewsSearchUrl})` : ""
    }`
  ].join("\n");
}
