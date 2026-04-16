"use client";
import { useQuery } from "@tanstack/react-query";
import { getPacificaClient } from "@/lib/pacifica-client";

export function useOrderbook(symbol: string) {
  const { data } = useQuery({
    queryKey: ["orderbook", symbol],
    queryFn: () => getPacificaClient().getOrderbook(symbol),
    refetchInterval: 2_000,
    staleTime: 1_000,
    enabled: !!symbol,
  });

  const bids = data?.bids ?? [];
  const asks = data?.asks ?? [];
  const bidVolume = bids.slice(0, 20).reduce((s, b) => s + b.size, 0);
  const askVolume = asks.slice(0, 20).reduce((s, a) => s + a.size, 0);
  const total = bidVolume + askVolume;
  const imbalance = total > 0 ? (bidVolume - askVolume) / total : 0; // -1 to +1

  return { bids, asks, bidVolume, askVolume, imbalance };
}
