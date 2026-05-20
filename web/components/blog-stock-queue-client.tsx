"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, DownloadCloud, Loader2, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOG_STOCK_QUEUE_SELECTED_KEY,
  BLOG_STOCK_QUEUE_STORAGE_KEY,
  createBlogId,
  isPreferredStockQueueItem,
  type BlogStockMarket,
  type BlogStockQueueItem,
  type BlogStockQueueStatus
} from "@/lib/blog-storage";

const STATUS_LABELS: Record<BlogStockQueueStatus, string> = {
  done: "완료",
  idea_generated: "아이디어 생성",
  queued: "대기",
  sent_to_write: "글작성 이동",
  skipped: "스킵"
};

type KrxImportMarket = "KOSPI" | "KOSDAQ" | "ALL";
type QueueMarketFilter = "all" | BlogStockMarket;

type KrxStockRow = {
  code: string;
  fullCode?: string;
  market: BlogStockMarket;
  name: string;
  rank: number;
};

type KrxStocksResponse = {
  error?: string;
  fetchedAt?: string;
  market?: KrxImportMarket;
  source?: string;
  stocks?: KrxStockRow[];
};

function readQueue(): BlogStockQueueItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOG_STOCK_QUEUE_STORAGE_KEY) || "[]") as BlogStockQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: BlogStockQueueItem[]): void {
  window.localStorage.setItem(BLOG_STOCK_QUEUE_STORAGE_KEY, JSON.stringify(items));
}

function normalizeMarket(raw: string): BlogStockMarket {
  const value = raw.trim().toUpperCase();
  if (value === "KOSDAQ" || value === "코스닥") return "KOSDAQ";
  if (value === "KOSPI" || value === "코스피") return "KOSPI";
  return "OTHER";
}

function parseBulkLine(line: string, defaultMarket: BlogStockMarket): Omit<BlogStockQueueItem, "createdAt" | "id" | "status" | "updatedAt"> | null {
  const clean = line.trim();
  if (!clean) return null;
  const parts = clean
    .split(/[\t,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tokens = parts.length > 1 ? parts : clean.split(/\s+/).filter(Boolean);

  let market = defaultMarket;
  let rank: number | undefined;
  let code = "";
  const nameParts: string[] = [];

  tokens.forEach((token) => {
    const stripped = token.replace(/[()]/g, "");
    if (/^(KOSPI|KOSDAQ|코스피|코스닥)$/i.test(stripped)) {
      market = normalizeMarket(stripped);
      return;
    }
    if (/^\d+$/.test(stripped) && stripped.length <= 4 && typeof rank !== "number") {
      rank = Number.parseInt(stripped, 10);
      return;
    }
    if (/^\d{5,6}$/.test(stripped) && !code) {
      code = stripped.padStart(6, "0");
      return;
    }
    nameParts.push(token);
  });

  const name = nameParts.join(" ").trim();
  if (!name) return null;
  return {
    code,
    keyword: name,
    market,
    name,
    rank
  };
}

function sortQueue(items: BlogStockQueueItem[]): BlogStockQueueItem[] {
  const marketOrder: Record<BlogStockMarket, number> = {
    KOSPI: 0,
    KOSDAQ: 1,
    OTHER: 2
  };
  return [...items].sort((a, b) => {
    const market = (marketOrder[a.market] ?? 99) - (marketOrder[b.market] ?? 99);
    if (market !== 0) return market;
    const ar = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
    const br = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, "ko");
  });
}

export function BlogStockQueueClient(): React.JSX.Element {
  const router = useRouter();
  const [queue, setQueue] = useState<BlogStockQueueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [market, setMarket] = useState<BlogStockMarket>("KOSPI");
  const [krxMarket, setKrxMarket] = useState<KrxImportMarket>("KOSPI");
  const [krxLimit, setKrxLimit] = useState("all");
  const [statusFilter, setStatusFilter] = useState<BlogStockQueueStatus | "all">("all");
  const [marketFilter, setMarketFilter] = useState<QueueMarketFilter>("all");
  const [excludePreferred, setExcludePreferred] = useState(true);
  const [rankFromFilter, setRankFromFilter] = useState("");
  const [rankToFilter, setRankToFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [rank, setRank] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [message, setMessage] = useState("");
  const [fetchingKrx, setFetchingKrx] = useState(false);

  useEffect(() => {
    setQueue(readQueue());
  }, []);

  const filteredQueue = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    const rankFrom = Number.parseInt(rankFromFilter, 10);
    const rankTo = Number.parseInt(rankToFilter, 10);
    const hasRankFrom = Number.isFinite(rankFrom);
    const hasRankTo = Number.isFinite(rankTo);
    const filtered = queue.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (marketFilter !== "all" && item.market !== marketFilter) {
        return false;
      }
      if (excludePreferred && isPreferredStockQueueItem(item)) {
        return false;
      }
      if (hasRankFrom && (typeof item.rank !== "number" || item.rank < rankFrom)) {
        return false;
      }
      if (hasRankTo && (typeof item.rank !== "number" || item.rank > rankTo)) {
        return false;
      }
      if (query) {
        const haystack = [item.market, item.rank, item.code, item.name, item.keyword, STATUS_LABELS[item.status]]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
    return sortQueue(filtered);
  }, [excludePreferred, marketFilter, queue, rankFromFilter, rankToFilter, searchFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = queue.length;
    const done = queue.filter((item) => item.status === "done").length;
    const queued = queue.filter((item) => item.status === "queued").length;
    return { done, queued, total };
  }, [queue]);

  function persist(next: BlogStockQueueItem[], nextMessage?: string): void {
    setQueue(next);
    writeQueue(next);
    if (nextMessage) setMessage(nextMessage);
  }

  function addSingle(): void {
    const stockName = name.trim();
    if (!stockName) {
      setMessage("종목명을 입력해 주세요.");
      return;
    }
    const now = new Date().toISOString();
    const item: BlogStockQueueItem = {
      id: createBlogId("stock"),
      market,
      rank: rank.trim() ? Number.parseInt(rank, 10) : undefined,
      code: code.trim(),
      name: stockName,
      keyword: stockName,
      status: "queued",
      createdAt: now,
      updatedAt: now
    };
    persist([item, ...queue], "종목을 큐에 추가했습니다.");
    setRank("");
    setCode("");
    setName("");
  }

  function importBulk(): void {
    const parsed = bulkText
      .split(/\r?\n/)
      .map((line) => parseBulkLine(line, market))
      .filter((item): item is Omit<BlogStockQueueItem, "createdAt" | "id" | "status" | "updatedAt"> => Boolean(item));
    if (parsed.length === 0) {
      setMessage("가져올 종목을 찾지 못했습니다. 예: 1,005930,삼성전자");
      return;
    }
    const now = new Date().toISOString();
    const existing = new Set(queue.map((item) => `${item.market}:${item.code || item.name}`.toLowerCase()));
    const nextItems = parsed
      .filter((item) => !existing.has(`${item.market}:${item.code || item.name}`.toLowerCase()))
      .map((item) => ({
        ...item,
        id: createBlogId("stock"),
        status: "queued" as const,
        createdAt: now,
        updatedAt: now
      }));
    persist([...nextItems, ...queue], `${nextItems.length}개 종목을 큐에 추가했습니다.`);
    setBulkText("");
  }

  async function importFromKrx(): Promise<void> {
    setFetchingKrx(true);
    setMessage("KRX에서 종목 목록을 가져오는 중입니다.");
    try {
      const response = await fetch(`/api/blog/stocks/krx?market=${encodeURIComponent(krxMarket)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as KrxStocksResponse;
      if (!response.ok) {
        throw new Error(payload.error || "KRX 종목 목록을 가져오지 못했습니다.");
      }
      const sourceStocks = Array.isArray(payload.stocks) ? payload.stocks : [];
      const preferredFiltered = excludePreferred
        ? sourceStocks.filter((item) => !isPreferredStockQueueItem(item))
        : sourceStocks;
      const limited =
        krxLimit === "all"
          ? preferredFiltered
          : preferredFiltered.slice(0, Math.max(1, Number.parseInt(krxLimit, 10) || 100));
      const now = new Date().toISOString();
      const existing = new Set(queue.map((item) => `${item.market}:${item.code || item.name}`.toLowerCase()));
      const nextItems = limited
        .filter((item) => !existing.has(`${item.market}:${item.code || item.name}`.toLowerCase()))
        .map((item) => ({
          id: createBlogId("stock"),
          market: item.market,
          rank: item.rank,
          code: item.code,
          name: item.name,
          keyword: item.name,
          status: "queued" as const,
          createdAt: now,
          updatedAt: now
        }));
      persist(
        [...nextItems, ...queue],
        `KRX ${krxMarket} 종목 ${sourceStocks.length}개 중 ${nextItems.length}개를 큐에 추가했습니다. 중복${
          excludePreferred ? "/우선주" : ""
        }은 제외했습니다. 출처: ${payload.source || "KRX"}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "KRX 종목 목록을 가져오지 못했습니다.");
    } finally {
      setFetchingKrx(false);
    }
  }

  function updateSelectedStatus(status: BlogStockQueueStatus): void {
    if (selectedIds.length === 0) {
      setMessage("대상 종목을 선택해 주세요.");
      return;
    }
    const now = new Date().toISOString();
    persist(
      queue.map((item) => (selectedIds.includes(item.id) ? { ...item, status, updatedAt: now } : item)),
      `${selectedIds.length}개 종목 상태를 '${STATUS_LABELS[status]}'로 변경했습니다.`
    );
  }

  function removeSelected(): void {
    if (selectedIds.length === 0) {
      setMessage("삭제할 종목을 선택해 주세요.");
      return;
    }
    persist(
      queue.filter((item) => !selectedIds.includes(item.id)),
      `${selectedIds.length}개 종목을 삭제했습니다.`
    );
    setSelectedIds([]);
  }

  function sendToIdea(item?: BlogStockQueueItem): void {
    const target = item || queue.find((entry) => entry.status === "queued") || queue[0];
    if (!target) {
      setMessage("아이디어로 보낼 종목이 없습니다.");
      return;
    }
    window.localStorage.setItem(BLOG_STOCK_QUEUE_SELECTED_KEY, target.id);
    router.push("/blog/ideas");
  }

  function toggleSelected(id: string): void {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectFilteredQueue(): void {
    setSelectedIds(filteredQueue.map((item) => item.id));
  }

  function resetFilters(): void {
    setMarketFilter("all");
    setStatusFilter("all");
    setExcludePreferred(true);
    setSearchFilter("");
    setRankFromFilter("");
    setRankToFilter("");
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">블로그 종목 큐</h1>
          <p className="text-sm text-muted-foreground">
            KOSPI/KOSDAQ 종목을 순서대로 쌓아두고 하루 한 종목씩 블로그 아이디어로 넘깁니다.
          </p>
        </div>
        <Button type="button" onClick={() => sendToIdea()}>
          다음 대기 종목으로 아이디어 생성
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-border bg-card p-4 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">KRX 종목 자동 가져오기</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                KRX 공식 종목검색 데이터를 가져와 큐에 추가합니다. 기존 큐와 중복되는 종목은 자동 제외됩니다.
                현재 순번은 KRX 응답 순서 기준입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={krxMarket} onValueChange={(value) => setKrxMarket(value as KrxImportMarket)}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KOSPI">KOSPI</SelectItem>
                  <SelectItem value="KOSDAQ">KOSDAQ</SelectItem>
                  <SelectItem value="ALL">전체</SelectItem>
                </SelectContent>
              </Select>
              <Select value={krxLimit} onValueChange={setKrxLimit}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">앞 100개</SelectItem>
                  <SelectItem value="300">앞 300개</SelectItem>
                  <SelectItem value="500">앞 500개</SelectItem>
                  <SelectItem value="all">전체</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={() => void importFromKrx()} disabled={fetchingKrx}>
                {fetchingKrx ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                KRX에서 가져오기
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">단일 종목 추가</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select value={market} onValueChange={(value) => setMarket(value as BlogStockMarket)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KOSPI">KOSPI</SelectItem>
                <SelectItem value="KOSDAQ">KOSDAQ</SelectItem>
                <SelectItem value="OTHER">기타</SelectItem>
              </SelectContent>
            </Select>
            <Input value={rank} onChange={(event) => setRank(event.target.value)} placeholder="순위 예: 1" />
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="종목코드 예: 005930" />
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="종목명 예: 삼성전자" />
          </div>
          <Button type="button" className="mt-3" onClick={addSingle}>
            <Plus className="mr-2 h-4 w-4" />
            추가
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">목록 붙여넣기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            한 줄에 하나씩 입력합니다. 예: 1,005930,삼성전자 또는 KOSDAQ 1 247540 에코프로비엠
          </p>
          <Textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={5}
            className="mt-3 font-mono text-xs"
            placeholder={"1,005930,삼성전자\n2,000660,SK하이닉스"}
          />
          <Button type="button" className="mt-3" variant="outline" onClick={importBulk}>
            <Upload className="mr-2 h-4 w-4" />
            붙여넣은 목록 가져오기
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">큐 현황</h2>
            <p className="text-sm text-muted-foreground">
              전체 {stats.total}개 · 필터 결과 {filteredQueue.length}개 · 대기 {stats.queued}개 · 완료 {stats.done}개
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => updateSelectedStatus("done")}>
              <Check className="mr-1 h-4 w-4" />
              완료
            </Button>
            <Button type="button" variant="outline" onClick={() => updateSelectedStatus("queued")}>
              <RotateCcw className="mr-1 h-4 w-4" />
              대기
            </Button>
            <Button type="button" variant="outline" onClick={removeSelected}>
              <Trash2 className="mr-1 h-4 w-4" />
              삭제
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[150px_170px_minmax(180px,1fr)_120px_120px_140px_110px_120px]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>시장</span>
            <Select value={marketFilter} onValueChange={(value) => setMarketFilter(value as QueueMarketFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 시장</SelectItem>
                <SelectItem value="KOSPI">KOSPI</SelectItem>
                <SelectItem value="KOSDAQ">KOSDAQ</SelectItem>
                <SelectItem value="OTHER">기타</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>상태</span>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as BlogStockQueueStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="queued">대기</SelectItem>
                <SelectItem value="idea_generated">아이디어 생성</SelectItem>
                <SelectItem value="sent_to_write">글작성 이동</SelectItem>
                <SelectItem value="done">완료</SelectItem>
                <SelectItem value="skipped">스킵</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>검색</span>
            <Input
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="종목명, 코드, 시장 검색"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>순위 시작</span>
            <Input
              type="number"
              min={1}
              value={rankFromFilter}
              onChange={(event) => setRankFromFilter(event.target.value)}
              placeholder="예: 1"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>순위 끝</span>
            <Input
              type="number"
              min={1}
              value={rankToFilter}
              onChange={(event) => setRankToFilter(event.target.value)}
              placeholder="예: 50"
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border border-border px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={excludePreferred}
              onChange={(event) => setExcludePreferred(event.target.checked)}
              aria-label="우선주 제외"
            />
            <span>우선주 제외</span>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={selectFilteredQueue} disabled={filteredQueue.length === 0}>
              결과 선택
            </Button>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={resetFilters}>
              초기화
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">선택</th>
                <th className="px-3 py-2">시장</th>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">종목코드</th>
                <th className="px-3 py-2">종목명</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">동작</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={`${item.name} 선택`}
                    />
                  </td>
                  <td className="px-3 py-2">{item.market}</td>
                  <td className="px-3 py-2">{item.rank || "-"}</td>
                  <td className="px-3 py-2">{item.code || "-"}</td>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[item.status]}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => sendToIdea(item)}>
                      아이디어로
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    표시할 종목이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {message ? <p className="mt-3 text-sm text-primary">{message}</p> : null}
      </div>
    </section>
  );
}
