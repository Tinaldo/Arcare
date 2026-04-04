interface Props {
  label: string;
  variant?: "depeg" | "hack" | "resolved" | "active" | "default";
}

const styles: Record<NonNullable<Props["variant"]>, string> = {
  depeg: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  hack: "bg-red-500/15 text-red-400 border-red-500/30",
  resolved: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  default: "bg-arc-blue/15 text-arc-blue border-arc-blue/30",
};

export function Badge({ label, variant = "default" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styles[variant]}`}
    >
      {label}
    </span>
  );
}
