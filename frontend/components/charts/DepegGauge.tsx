"use client";

interface DepegGaugeProps {
  symbol: string;
  price: number;
}

interface Zone {
  label: string;
  min: number;
  max: number;
  color: string;
  bg: string;
}

const ZONES: Zone[] = [
  { label: "Severe depeg",   min: 0.00, max: 0.90, color: "#dc2626", bg: "#fef2f2" },
  { label: "Moderate depeg", min: 0.90, max: 0.97, color: "#f97316", bg: "#fff7ed" },
  { label: "Minor stress",   min: 0.97, max: 0.995, color: "#eab308", bg: "#fefce8" },
  { label: "Pegged",         min: 0.995, max: 1.02, color: "#22c55e", bg: "#f0fdf4" },
];

const GAUGE_MIN = 0.88;
const GAUGE_MAX = 1.02;

function clamp(val: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, val));
}

function priceToPercent(price: number): number {
  return ((clamp(price, GAUGE_MIN, GAUGE_MAX) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;
}

function zoneHeightPercent(zone: Zone): number {
  const lo = clamp(zone.min, GAUGE_MIN, GAUGE_MAX);
  const hi = clamp(zone.max, GAUGE_MIN, GAUGE_MAX);
  return ((hi - lo) / (GAUGE_MAX - GAUGE_MIN)) * 100;
}

function currentZone(price: number): Zone {
  return (
    ZONES.find((z) => price >= z.min && price < z.max) ??
    (price >= 1.02 ? ZONES[3] : ZONES[0])
  );
}

export function DepegGauge({ symbol, price }: DepegGaugeProps) {
  const zone = currentZone(price);
  const pct = priceToPercent(price);
  // indicator sits from the bottom
  const indicatorBottom = `${pct}%`;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base font-extrabold text-slate-900">{symbol}/USD</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ background: zone.bg, color: zone.color }}
        >
          {zone.label}
        </span>
      </div>

      {/* Price */}
      <span className="text-3xl font-extrabold" style={{ color: zone.color }}>
        ${price.toFixed(4)}
      </span>

      {/* Vertical bar */}
      <div className="flex items-stretch gap-3">
        {/* Zone bar */}
        <div
          className="relative w-8 overflow-hidden rounded-full"
          style={{ height: 200 }}
          aria-label="Depeg severity gauge"
        >
          {/* Zones stacked bottom-to-top */}
          <div className="absolute inset-0 flex flex-col-reverse">
            {ZONES.map((z) => (
              <div
                key={z.label}
                style={{
                  height: `${zoneHeightPercent(z)}%`,
                  background: z.color,
                  opacity: zone.label === z.label ? 1 : 0.25,
                }}
              />
            ))}
          </div>

          {/* Price indicator arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ bottom: indicatorBottom, transition: "bottom 0.6s ease" }}
          >
            <div
              className="h-2 w-10 rounded-full border-2 border-white shadow-md"
              style={{ background: zone.color, marginLeft: "-8px" }}
            />
          </div>
        </div>

        {/* Y axis labels */}
        <div
          className="relative flex flex-col justify-between text-right"
          style={{ height: 200 }}
        >
          <span className="text-[10px] font-bold text-slate-400">$1.02</span>
          <span className="text-[10px] font-bold text-yellow-500">$0.995</span>
          <span className="text-[10px] font-bold text-orange-500">$0.97</span>
          <span className="text-[10px] font-bold text-red-500">$0.90</span>
          <span className="text-[10px] font-bold text-slate-400">$0.88</span>
        </div>
      </div>

      {/* Zone legend */}
      <div className="space-y-1 w-full max-w-[160px]">
        {[...ZONES].reverse().map((z) => (
          <div key={z.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: z.color, opacity: zone.label === z.label ? 1 : 0.35 }}
            />
            <span
              className="text-[10px] font-semibold"
              style={{ color: zone.label === z.label ? z.color : "#94a3b8" }}
            >
              {z.label}
            </span>
          </div>
        ))}
      </div>

      {/* Threshold callout */}
      <p className="text-center text-[10px] text-slate-400">
        Resolution threshold:{" "}
        <span className="font-bold text-[#745BFF]">$0.97</span>
      </p>
    </div>
  );
}
