interface Props {
  label: string;
  variant?: "depeg" | "hack" | "resolved" | "active" | "default";
}

const styles: Record<NonNullable<Props["variant"]>, string> = {
  depeg:    "bg-[#745BFF]/12 text-[#745BFF] border-[rgba(116,91,255,0.2)]",
  hack:     "bg-red-500/10 text-red-500 border-red-500/20",
  resolved: "bg-slate-100 text-slate-500 border-slate-200",
  active:   "bg-[#00C96E]/12 text-[#00A558] border-[#00C96E]/25",
  default:  "bg-[#745BFF]/12 text-[#745BFF] border-[rgba(116,91,255,0.2)]",
};

export function Badge({ label, variant = "default" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${styles[variant]}`}
    >
      {label}
    </span>
  );
}
