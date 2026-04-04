"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { arcClient } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";

interface YesNoPriceChartProps {
  marketId: number;
  contractAddress: `0x${string}`;
  abi: readonly unknown[];
}

interface DataPoint {
  timestamp: string;
  yes: number;
  no: number;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function YesNoPriceChart({ contractAddress }: YesNoPriceChartProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrice = async () => {
    try {
      const info = await arcClient.readContract({
        address: contractAddress,
        abi: PREDICTION_MARKET_ABI,
        functionName: "getMarketInfo",
      });
      const [, , , , , yesReserve, noReserve] = info as [
        string,
        string,
        bigint,
        boolean,
        boolean,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      const total = yesReserve + noReserve;
      if (total === 0n) return;
      const yes = Number((yesReserve * 10000n) / total) / 100;
      const no = Math.round((100 - yes) * 100) / 100;
      setData((prev) => {
        const point: DataPoint = { timestamp: fmtTime(new Date()), yes, no };
        const next = [...prev, point];
        return next.length > 50 ? next.slice(next.length - 50) : next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPrice();
    const id = setInterval(() => void fetchPrice(), 30_000);
    return () => clearInterval(id);
  }, [contractAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
        Loading price history…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
        No data yet — waiting for first price…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="timestamp"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          interval={4}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(116,91,255,0.15)",
            borderRadius: "12px",
            fontSize: 12,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [typeof value === "number" ? `${value.toFixed(1)}%` : value]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        <Line
          type="monotone"
          dataKey="yes"
          name="YES"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="no"
          name="NO"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
