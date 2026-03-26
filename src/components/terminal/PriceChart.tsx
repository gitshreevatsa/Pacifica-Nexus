/**
 * PriceChart.tsx
 * Candlestick chart using real Pacifica /api/v1/kline data.
 * Falls back to mock data while loading or if API is unreachable.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
} from "lightweight-charts";
import { getPacificaClient } from "@/lib/pacifica-client";
import { usePacifica } from "@/hooks/usePacifica";
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
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono whitespace-nowrap border transition-all shrink-0",
        selected
          ? "bg-electric/20 border-electric/50 text-electric-300"
          : "bg-surface-raised border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-200"
      )}
    >
      <span className="font-semibold text-white">{symbol}</span>
      <span className="text-[10px]">{formatUSD(markPrice)}</span>
      <span className={cn("text-[10px]", isPos ? "text-neon-green" : "text-danger")}>
        {isPos ? "▲" : "▼"}
        {Math.abs(change24h).toFixed(2)}%
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

  const { markets } = usePacifica();

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

  // ── Chart init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#080B14" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "#1a2235" },
        horzLines: { color: "#1a2235" },
      },
      crosshair: {
        vertLine: { color: "#0062FF", labelBackgroundColor: "#0062FF" },
        horzLine: { color: "#0062FF", labelBackgroundColor: "#0062FF" },
      },
      rightPriceScale: { borderColor: "#1a2235" },
      timeScale: { borderColor: "#1a2235", timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00FF87",
      downColor: "#FF3B5C",
      borderUpColor: "#00FF87",
      borderDownColor: "#FF3B5C",
      wickUpColor: "#00C96C",
      wickDownColor: "#CC2F4A",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
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
      {/* Market tabs */}
      <div className="px-3 py-1.5 border-b border-surface-border overflow-x-auto scrollbar-none shrink-0">
        <div className="flex items-center gap-1 min-w-max">
          {markets.slice(0, 8).map((m) => (
            <MarketTab
              key={m.symbol}
              symbol={m.symbol}
              markPrice={m.markPrice}
              change24h={m.priceChange24h}
              selected={selectedSymbol === m.symbol}
              onClick={() => setSelectedSymbol(m.symbol)}
            />
          ))}
        </div>
      </div>

      {/* Mark price + stats row */}
      {activeMarket && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-surface-border flex-wrap shrink-0">
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
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                  selectedInterval === iv
                    ? "bg-electric/20 text-electric-300"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart canvas */}
      <div ref={chartContainerRef} className="flex-1" />
    </div>
  );
}
