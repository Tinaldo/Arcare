"use client";

import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { PriceCache, RESOLUTIONS } from "@/lib/priceCache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Stablecoin {
  symbol: string;
  color: string;
  feedAddress?: `0x${string}`; // kept for back-compat, not used by this chart
  coingeckoId?: string;        // override if symbol doesn't match the map below
}

interface StablecoinPriceChartProps {
  stablecoins?: Stablecoin[];
  cacheKey?: string; // defaults to joined symbols
}

type DataRow = { timestamp: string; [symbol: string]: number | string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COINS: Stablecoin[] = [
  { symbol: "DAI",  color: "#f59e0b", coingeckoId: "dai"         },
  { symbol: "FRAX", color: "#8b5cf6", coingeckoId: "frax"        },
  { symbol: "LUSD", color: "#06b6d4", coingeckoId: "liquity-usd" },
];

const COINGECKO_ID_MAP: Record<string, string> = {
  DAI:  "dai",
  FRAX: "frax",
  LUSD: "liquity-usd",
  USDC: "usd-coin",
  USDT: "tether",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function geckoId(coin: Stablecoin): string {
  return coin.coingeckoId ?? COINGECKO_ID_MAP[coin.symbol] ?? coin.symbol.toLowerCase();
}

function fmtAxisLabel(t: number, resKey: string): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const mmdd = `${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  switch (resKey) {
    case "1m":  return `${hhmm}:${p(d.getSeconds())}`;
    case "6m":
    case "30m": return hhmm;
    case "3h":  return `${mmdd} ${hhmm}`;
    case "1d":  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "1w":  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    default:    return hhmm;
  }
}

function fmtHms(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function buildChartData(cache: PriceCache, symbols: string[], resKey: string): DataRow[] {
  const refPts = cache.getPoints(symbols[0], resKey);
  if (!refPts.length) return [];
  return refPts.map((pt, i) => {
    const row: DataRow = { timestamp: fmtAxisLabel(pt.t, resKey) };
    for (const sym of symbols) {
      const pts = cache.getPoints(sym, resKey);
      if (i < pts.length) row[sym] = pts[i].v;
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StablecoinPriceChart({
  stablecoins = DEFAULT_COINS,
  cacheKey,
}: StablecoinPriceChartProps) {
  const symbols = stablecoins.map((c) => c.symbol);
  const primary = symbols[0];
  const resolvedCacheKey = cacheKey ?? symbols.join("_");

  const cacheRef = useRef<PriceCache | null>(null);
  const resKeyRef = useRef<string>(RESOLUTIONS[0].key); // stable ref for interval closure

  const [selectedResKey, setSelectedResKey] = useState<string>(RESOLUTIONS[0].key);
  const [chartData, setChartData]           = useState<DataRow[]>([]);
  const [latestPrices, setLatestPrices]     = useState<Record<string, number>>({});
  // pointCounts[resKey] = number of data points for the primary symbol
  const [pointCounts, setPointCounts]       = useState<Record<string, number>>({});
  const [lastUpdated, setLastUpdated]       = useState<string>("");
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  // Keep ref in sync so the interval closure always reads the latest value
  resKeyRef.current = selectedResKey;

  // ------------------------------------------------------------------
  // Init cache from localStorage on mount (gives instant chart render)
  // ------------------------------------------------------------------
  useEffect(() => {
    const cache = new PriceCache(resolvedCacheKey);
    cacheRef.current = cache;

    if (cache.hasAnyData(primary)) {
      const best = cache.selectBestResolution(primary);
      setSelectedResKey(best.key);
      resKeyRef.current = best.key;
      setChartData(buildChartData(cache, symbols, best.key));
      refreshPointCounts(cache);
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Poll CoinGecko every 60 s
  // ------------------------------------------------------------------
  useEffect(() => {
    const fetchPrices = async () => {
      const ids = stablecoins.map(geckoId).join(",");
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&precision=6`
        );

        if (res.status === 429) {
          setError("Rate limited — showing cached data");
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError("Price feed unavailable — showing cached data");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as Record<string, { usd: number }>;
        const now = Date.now();
        const cache = cacheRef.current;
        if (!cache) return;

        const prices: Record<string, number> = {};
        for (const coin of stablecoins) {
          const price = json[geckoId(coin)]?.usd;
          if (price !== undefined) {
            prices[coin.symbol] = price;
            cache.addPoint(coin.symbol, price, now);
          }
        }

        setError(null);
        setLatestPrices(prices);
        setLastUpdated(fmtHms(new Date(now)));
        setChartData(buildChartData(cache, symbols, resKeyRef.current));
        refreshPointCounts(cache);
        setLoading(false);
      } catch {
        setError("Connection error — showing cached data");
        setLoading(false);
      }
    };

    void fetchPrices();
    const id = setInterval(() => void fetchPrices(), 60_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function refreshPointCounts(cache: PriceCache) {
    const counts: Record<string, number> = {};
    for (const r of RESOLUTIONS) counts[r.key] = cache.pointCount(primary, r.key);
    setPointCounts(counts);
  }

  function handleResChange(key: string) {
    setSelectedResKey(key);
    resKeyRef.current = key;
    const cache = cacheRef.current;
    if (!cache) return;
    setChartData(buildChartData(cache, symbols, key));
  }

  // ------------------------------------------------------------------
  // Loading / empty states
  // ------------------------------------------------------------------
  if (loading && chartData.length === 0) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-2">
        <span className="material-symbols-outlined text-[32px] text-slate-300 animate-pulse">
          data_usage
        </span>
        <p className="text-sm text-slate-400">Collecting data…</p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div>
      {/* Top bar: live price badges + resolution selector */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* Live price badges */}
        <div className="flex flex-wrap gap-1.5">
          {stablecoins.map((coin) => {
            const price = latestPrices[coin.symbol];
            const pegged = price !== undefined && price > 0.97;
            return (
              <span
                key={coin.symbol}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                style={{
                  borderColor: pegged ? "#22c55e40" : "#ef444440",
                  background:  pegged ? "#22c55e10" : "#ef444410",
                  color:       pegged ? "#16a34a"   : "#dc2626",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: pegged ? "#22c55e" : "#ef4444" }}
                />
                {coin.symbol}
                {price !== undefined ? ` $${price.toFixed(4)}` : " —"}
              </span>
            );
          })}

          {/* Error badge */}
          {error && (
            <span className="flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold text-orange-600">
              <span className="material-symbols-outlined text-[11px]">warning</span>
              {error}
            </span>
          )}
        </div>

        {/* Resolution selector */}
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 rounded-full border border-[rgba(116,91,255,0.15)] bg-[rgba(116,91,255,0.04)] p-0.5">
            {RESOLUTIONS.map((r) => {
              const count = pointCounts[r.key] ?? 0;
              const hasData = count >= 3;
              const isActive = r.key === selectedResKey;
              return (
                <button
                  key={r.key}
                  onClick={() => handleResChange(r.key)}
                  title={hasData ? undefined : `Not enough data yet (${count} pts)`}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-all ${
                    isActive
                      ? "bg-[#745BFF] text-white shadow-sm"
                      : hasData
                      ? "text-[#745BFF] hover:bg-[#745BFF]/12"
                      : "cursor-default text-slate-300"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-slate-400">
              {lastUpdated}
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="timestamp"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0.9, 1.02]}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine
            y={0.97}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: "⚠️ $0.97", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(116,91,255,0.15)",
              borderRadius: "12px",
              fontSize: 12,
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, name: any) => [
              typeof v === "number" ? `$${v.toFixed(4)}` : String(v),
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
          {stablecoins.map((coin) => (
            <Line
              key={coin.symbol}
              type="monotone"
              dataKey={coin.symbol}
              name={coin.symbol}
              stroke={coin.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
