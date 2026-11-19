import type { OrnamentSetId } from "./sets";

/** The colours of a theme's ornaments. */
export type OrnamentColors = { ornament: string; hi: string; dim: string };

const encode = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/**
 * A frame as nine parts for `border-image`: a corner drawn once and mirrored into the other three,
 * edges that stretch, and an empty middle. The size of the picture is 54, the corners are 18.
 * "light" is double lines with plain corners; "full" adds the vine in the corners.
 */
function forgedFrame(c: OrnamentColors, level: "light" | "full"): string {
  const vine =
    level === "full"
      ? `<path d="M6 17c0-6 2-9 6-11" stroke="${c.hi}" stroke-width="1.2" fill="none"/>
         <path d="M9.5 9.5c3-.4 4.5.8 5 3" stroke="${c.ornament}" stroke-width="1.1" fill="none"/>
         <circle cx="14.6" cy="13.3" r="1.5" fill="${c.hi}"/>
         <circle cx="5.2" cy="17.6" r="1.3" fill="${c.hi}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
    <defs><g id="c">
      <path d="M1.2 15V1.2H15" stroke="${c.hi}" stroke-width="3" fill="none" stroke-linecap="square"/>
      <path d="M1 1l4 4" stroke="${c.hi}" stroke-width="1.4"/>
      ${vine}
    </g></defs>
    <rect x="1.2" y="1.2" width="51.6" height="51.6" fill="none" stroke="${c.ornament}" stroke-width="1.4"/>
    <rect x="5.2" y="5.2" width="43.6" height="43.6" fill="none" stroke="${c.dim}" stroke-width="1"/>
    <use href="#c"/>
    <use href="#c" transform="matrix(-1 0 0 1 54 0)"/>
    <use href="#c" transform="matrix(1 0 0 -1 0 54)"/>
    <use href="#c" transform="matrix(-1 0 0 -1 54 54)"/>
  </svg>`;
}

/** The frame picture for a set and level, as a CSS `url(...)`, or "none" where there is none. */
export function frameImage(
  set: OrnamentSetId,
  level: "none" | "light" | "full",
  colors: OrnamentColors,
): string {
  if (level === "none") return "none";
  if (set === "forged") return encode(forgedFrame(colors, level));
  return "none";
}

/** Four small points around a ring: the medallion of the forged set, drawn to the size of its box. */
export function medallionImage(set: OrnamentSetId, c: OrnamentColors): string {
  if (set !== "forged") return "none";
  return encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="42" fill="none" stroke="${c.hi}" stroke-width="3"/>
    <circle cx="50" cy="50" r="36" fill="none" stroke="${c.dim}" stroke-width="1.5"/>
    <path d="M50 0l6 10H44zM50 100l6-10H44zM0 50l10-6v12zM100 50l-10-6v12z" fill="${c.hi}"/>
  </svg>`);
}

/** A seal for the roll: a ring with a notched edge, drawn to the size of its box. */
export function sealImage(set: OrnamentSetId, c: OrnamentColors): string {
  if (set !== "forged") return "none";
  const notches = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `<circle cx="${(50 + 45 * Math.cos(a)).toFixed(1)}" cy="${(50 + 45 * Math.sin(a)).toFixed(1)}" r="4.4" fill="${c.ornament}"/>`;
  }).join("");
  return encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${notches}<circle cx="50" cy="50" r="43" fill="${c.ornament}"/>
    <circle cx="50" cy="50" r="36" fill="none" stroke="${c.dim}" stroke-width="2"/>
  </svg>`);
}

/** Soft grain for the notes and frames, as low coverage noise. */
export function grainImage(): string {
  return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>
    <rect width="160" height="160" filter="url(#n)" opacity=".35"/></svg>`);
}
