"use client";

interface Props {
  steps: Array<{ stage: string; message: string; elapsedMs?: number }>;
  active?: boolean;
}

export function StableFxProgressPanel({ steps, active }: Props) {
  if (!steps.length && !active) return null;

  return (
    <div
      className="rounded-2xl border border-black/[0.07] bg-black/[0.02] p-3 flex flex-col gap-1.5 text-xs font-mono"
      data-testid="stablefx-progress"
    >
      <p className="text-[10px] tracking-widest uppercase text-black/40 font-sans">
        StableFX pipeline{active ? " · running" : ""}
      </p>
      {steps.map((s, i) => (
        <div key={`${s.stage}-${i}`} className="flex gap-2">
          <span className="text-black/35 shrink-0 w-14">
            {s.elapsedMs != null ? `${(s.elapsedMs / 1000).toFixed(1)}s` : "—"}
          </span>
          <span className="text-[#111]">{s.stage}</span>
          <span className="text-black/45 break-all">{s.message}</span>
        </div>
      ))}
      {active && (
        <p className="font-sans animate-pulse mt-1" style={{ color: "var(--warning)" }}>
          Still working — watch the terminal for `[StableFX]` lines too.
        </p>
      )}
    </div>
  );
}
