import { ORNAMENT_SETS } from "../../themes/theme";

/** The eight parts every ornament set is made of. The layout is the same in every set. */
export const ORNAMENT_PARTS = [
  "frame",
  "namePlate",
  "divider",
  "medallion",
  "note",
  "slot",
  "check",
  "choice",
] as const;
export type OrnamentPart = (typeof ORNAMENT_PARTS)[number];
export type OrnamentSetId = (typeof ORNAMENT_SETS)[number];

/**
 * Which parts each set draws itself. `plain` draws none: it is the quiet look the play view has
 * without ornaments, and what every other set falls back on for a part it does not have.
 */
export const SET_PARTS: Record<OrnamentSetId, readonly OrnamentPart[]> = {
  plain: [],
  forged: ORNAMENT_PARTS,
  hull: ORNAMENT_PARTS,
};

/** The set that draws a part: the chosen one if it has the part, otherwise `plain`. */
export function setForPart(set: OrnamentSetId, part: OrnamentPart): OrnamentSetId {
  return SET_PARTS[set].includes(part) ? set : "plain";
}

/**
 * What a theme asks for, as it is drawn. "None" is thin lines only, which is `plain`; so is the
 * player's choice of plain frames, and a system that asks for higher contrast or less motion.
 */
export function effectiveOrnament(
  theme: { ornament?: OrnamentSetId; ornamentLevel?: "none" | "light" | "full" },
  options: { simple?: boolean } = {},
): { set: OrnamentSetId; level: "none" | "light" | "full" } {
  const level = theme.ornamentLevel ?? "full";
  if (options.simple || level === "none" || !theme.ornament || theme.ornament === "plain")
    return { set: "plain", level: "none" };
  return { set: theme.ornament, level };
}
