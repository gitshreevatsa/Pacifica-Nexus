/**
 * PriceChart.tsx
 * Candlestick chart using real Pacifica /api/v1/kline data.
 * Falls back to mock data while loading or if API is unreachable.
 */

"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
} from "lightweight-charts";
import { getPacificaClient } from "@/lib/pacifica-client";
import { usePacifica } from "@/hooks/usePacifica";
import { useOrderbookStream } from "@/hooks/useOrderbookStream";
import { formatUSD, cn } from "@/lib/utils";
import type { Kline } from "@/types";

// ─── Intervals ────────────────────────────────────────────────────────────────

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

// How far back to fetch candles (ms) per interval
const LOOKBACK: Record<Interval, number> = {
  "1m": 60 * 60 * 1000,           // 1 hour of 1m candles
  "5m": 5 * 60 * 60 * 1000,
  "15m": 24 * 60 * 60 * 1000,
  "1h": 7 * 24 * 60 * 60 * 1000,
  "4h": 30 * 24 * 60 * 60 * 1000,
  "1d": 365 * 24 * 60 * 60 * 1000,
};

// ─── Kline → lightweight-charts format ───────────────────────────────────────

function toChartCandle(k: Kline): CandlestickData {
  return {
    time: Math.floor(k.t / 1000) as CandlestickData["time"],
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
  };
}

// ─── Market selector tab ──────────────────────────────────────────────────────

function MarketTab({
  symbol,
  markPrice,
  change24h,
  selected,
  onClick,
}: {
  symbol: string;
  markPrice: number;
  change24h: number;
  selected: boolean;
  onClick: () => void;
}) {
  const isPos = change24h >= 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded text-[11.5px] font-mono whitespace-nowrap shrink-0",
        selected ? "market-tab-selected" : "market-tab"
      )}
    >
      <span className="font-semibold text-white">{symbol}</span>
      <span className="text-[11px]">{formatUSD(markPrice)}</span>
      <span className={cn("text-[11px]", isPos ? "text-neon-green" : "text-danger")}>
        {isPos ? "▲" : "▼"}{Math.abs(change24h).toFixed(2)}%
      </span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState("SOL");
  const [selectedInterval, setSelectedInterval] = useState<Interval>("5m");
  const [marketSearch, setMarketSearch] = useState("");

  const { markets } = usePacifica();

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => m.symbol.toLowerCase().includes(q));
  }, [markets, marketSearch]);

  // Real kline data from Pacifica
  const { data: klines = [] } = useQuery<CandlestickData[]>({
    queryKey: ["klines", selectedSymbol, selectedInterval],
    queryFn: async () => {
      const startTime = Date.now() - LOOKBACK[selectedInterval];
      const raw = await getPacificaClient().getKlines(
        selectedSymbol,
        selectedInterval,
        startTime
      );
      return raw.map(toChartCandle);
    },
    refetchInterval: selectedInterval === "1m" ? 10_000 : 30_000,
    staleTime: 5_000,
    retry: 2,
  });

  const activeMarket = markets.find((m) => m.symbol === selectedSymbol);
  const { bidVolume, askVolume, imbalance } = useOrderbookStream(selectedSymbol);
  const hasBookData = bidVolume + askVolume > 0;

  // ── Chart init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#080808" },
        textColor: "#475569",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "#0062FF", labelBackgroundColor: "#0062FF" },
        horzLine: { color: "#0062FF", labelBackgroundColor: "#0062FF" },
      },
      rightPriceScale: { borderColor: "transparent", scaleMargins: { top: 0.06, bottom: 0.06 } },
      timeScale: { borderColor: "transparent", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight - 8,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00FF87",
      downColor: "#FF3B5C",
      borderUpColor: "#00FF87",
      borderDownColor: "#FF3B5C",
      wickUpColor: "#00C96C",
      wickDownColor: "#CC2F4A",
      priceLineColor: "rgba(255,255,255,0.15)",
      priceLineWidth: 1,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight - 8,
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // ── Update candles ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (candleSeriesRef.current && klines.length > 0) {
      candleSeriesRef.current.setData(klines);
      chartRef.current?.timeScale().fitContent();
    }
  }, [klines]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Market tabs + search */}
      <div className="shrink-0">
        {/* Search bar */}
        <div className="px-3 pt-2 pb-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Search markets…"
              className="w-full text-white text-[11px] font-mono rounded-lg pl-6 pr-3 py-1.5 focus:outline-none placeholder:text-slate-600"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
          </div>
        </div>
        {/* Scrollable tab row */}
        <div className="px-3 pb-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max">
            {filteredMarkets.map((m) => (
              <MarketTab
                key={m.symbol}
                symbol={m.symbol}
                markPrice={m.markPrice}
                change24h={m.priceChange24h}
                selected={selectedSymbol === m.symbol}
                onClick={() => { setSelectedSymbol(m.symbol); setMarketSearch(""); }}
              />
            ))}
            {filteredMarkets.length === 0 && (
              <span className="text-[10px] text-slate-600 font-mono py-1">No markets match</span>
            )}
          </div>
        </div>
      </div>

      {/* Mark price + stats row */}
      {activeMarket && (
        <div className="flex items-center gap-4 px-4 py-1 flex-wrap shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-mono font-bold text-white">
              {formatUSD(activeMarket.markPrice)}
            </span>
            <span
              className={cn(
                "text-xs font-mono",
                activeMarket.priceChange24h >= 0 ? "text-neon-green" : "text-danger"
              )}
            >
              {activeMarket.priceChange24h >= 0 ? "▲" : "▼"}
              {Math.abs(activeMarket.priceChange24h).toFixed(2)}%
            </span>
          </div>

          <div className="flex gap-4 text-[10px] font-mono text-slate-500">
            <span>
              Oracle:{" "}
              <span className="text-slate-300">{formatUSD(activeMarket.indexPrice)}</span>
            </span>
            <span>
              Funding:{" "}
              <span
                className={cn(
                  "font-semibold",
                  activeMarket.fundingRate > 0 ? "text-neon-green" : "text-danger"
                )}
              >
                {activeMarket.fundingRate > 0 ? "+" : ""}
                {(activeMarket.fundingRate * 100).toFixed(4)}%
              </span>
            </span>
            <span>
              OI: <span className="text-slate-300">{formatUSD(activeMarket.openInterest)}</span>
            </span>
            <span>
              Vol 24h:{" "}
              <span className="text-slate-300">{formatUSD(activeMarket.volume24h)}</span>
            </span>
          </div>

          {/* Interval selector */}
          <div className="ml-auto flex items-center gap-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setSelectedInterval(iv)}
                className="px-2 py-0.5 rounded text-[10px] font-mono transition-all duration-150"
                style={selectedInterval === iv
                  ? { background: "rgba(0,98,255,0.2)", color: "#4d8fff" }
                  : { color: "#475569" }
                }
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart canvas + orderbook pressure overlay */}
      <div className="flex-1 relative">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <div className="absolute bottom-2 left-3 right-3 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
            <span className="text-[9px] font-mono text-danger shrink-0 w-10 text-right">
              {hasBookData ? `Ask ${(((1 - imbalance) / 2) * 100).toFixed(0)}%` : "Ask —"}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.08)" }}>
              {hasBookData ? (
                <>
                  <div className="h-full transition-all duration-500" style={{ width: `${((1 - imbalance) / 2) * 100}%`, background: "rgba(255,59,92,0.8)" }} />
                  <div className="h-full transition-all duration-500" style={{ width: `${((1 + imbalance) / 2) * 100}%`, background: "rgba(0,255,135,0.8)" }} />
                </>
              ) : (
                <div className="h-full w-full" style={{ background: "rgba(255,255,255,0.06)" }} />
              )}
            </div>
            <span className="text-[9px] font-mono text-neon-green shrink-0 w-10">
              {hasBookData ? `Bid ${(((1 + imbalance) / 2) * 100).toFixed(0)}%` : "Bid —"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
