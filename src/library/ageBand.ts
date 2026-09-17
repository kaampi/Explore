export type AgeBand = "young" | "adult" | "elder";

/** Young ≤25, adult 26–54, elder ≥55. Unset age matches no band. */
export function ageBandOf(years: number | undefined): AgeBand | undefined {
  if (years == null || !Number.isFinite(years)) return undefined;
  if (years <= 25) return "young";
  if (years <= 54) return "adult";
  return "elder";
}

export function matchesAgeBand(item: { approximateAge?: number }, band: AgeBand | null): boolean {
  if (!band) return true;
  return ageBandOf(item.approximateAge) === band;
}

export const AGE_BANDS: Array<{ id: AgeBand; label: string }> = [
  { id: "young", label: "Young" },
  { id: "adult", label: "Adult" },
  { id: "elder", label: "Elder" }
];
