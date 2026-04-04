import { formatPrice } from "@/lib/arc-client";

interface Props {
  yesPrice: bigint;
  noPrice: bigint;
}

export function ProbabilityBar({ yesPrice, noPrice }: Props) {
  const yesPct = Number(formatPrice(yesPrice));
  const noPct = Number(formatPrice(noPrice));

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-yes-green">{yesPct}% YES</span>
        <span className="text-no-red">{noPct}% NO</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-yes-green transition-all duration-500"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="h-full flex-1 bg-no-red transition-all duration-500"
        />
      </div>
    </div>
  );
}
