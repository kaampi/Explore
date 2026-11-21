/** Density is a fraction. Even the densest setting leaves a gap between bursts. */
export function signalCycleSeconds(density: number) {
  return 1.65 - density * 1.1;
}
