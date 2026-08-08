interface Props {
  label:   string;
  value:   string | number;
  sub?:    string;
  accent?: boolean;
}

export function StatCard({ label, value, sub, accent }: Props) {
  return (
    <div
      className={`rounded-2xl border p-8 flex flex-col gap-2 transition-colors ${
        accent
          ? "bg-black/[0.04] border-black/15"
          : "bg-white border-black/[0.07] hover:border-black/[0.15]"
      }`}
    >
      <span className="text-[11px] tracking-widest uppercase text-black/40">
        {label}
      </span>
      <span className="text-3xl font-light tracking-tight text-[#111]">
        {value}
      </span>
      {sub && <span className="text-xs text-black/30">{sub}</span>}
    </div>
  );
}
