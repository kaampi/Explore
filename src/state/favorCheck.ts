/**
 * Player asks the character for a favor. The engine rolls; Pass 1 only
 * hears yes or no. Grant still has to fit the scene — a success does
 * not invent rooms or objects.
 */

export type FavorCheck = {
  roll: number;
  trust: number;
  granted: boolean;
};

/** d100: 1–100. */
export function rollD100(rng: () => number = Math.random): number {
  return Math.floor(rng() * 100) + 1;
}

/** Success when the roll is strictly lower than live trust. */
export function checkFavor(trust: number, roll: number): FavorCheck {
  const clampedTrust = Math.min(100, Math.max(0, Math.round(trust)));
  const clampedRoll = Math.min(100, Math.max(1, Math.round(roll)));
  return {
    roll: clampedRoll,
    trust: clampedTrust,
    granted: clampedRoll < clampedTrust
  };
}
