import type { MilestoneDTO } from "@/lib/types";

export async function fetchMilestoneById(id: string): Promise<MilestoneDTO | null> {
  const res = await fetch("/api/milestones", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.milestones as MilestoneDTO[] | undefined)?.find(m => m.id === id) ?? null;
}

/** Poll Arc until milestone is released or reclaimed. */
export async function pollMilestoneUntilSettled(
  id: string,
  options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<MilestoneDTO> {
  const { maxAttempts = 30, intervalMs = 2000 } = options;

  for (let i = 0; i < maxAttempts; i++) {
    const milestone = await fetchMilestoneById(id);
    if (milestone?.status === "released" || milestone?.status === "reclaimed") {
      return milestone;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error("Timed out waiting for milestone settlement on Arc testnet");
}

export function isOnChainTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
