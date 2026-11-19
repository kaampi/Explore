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

/**
 * A frame with cut corners and thin lines of light, for border-image: corners drawn once and
 * mirrored. "full" adds small ticks at the cuts and a short bright stroke on each corner.
 */
function hullFrame(c: OrnamentColors, level: "light" | "full"): string {
  const ticks =
    level === "full"
      ? `<path d="M1.2 16v-3.2M13.2 1.2H16.4" stroke="${c.hi}" stroke-width="2.4" fill="none"/>
         <path d="M5 12.5 12.5 5" stroke="${c.hi}" stroke-width="1" fill="none"/>
         <rect x="15.5" y="3.2" width="3" height="1.4" fill="${c.ornament}"/>
         <rect x="3.2" y="15.5" width="1.4" height="3" fill="${c.ornament}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
    <defs><g id="c">${ticks}</g></defs>
    <path d="M1.2 14 14 1.2H40L52.8 14V40L40 52.8H14L1.2 40Z" fill="none" stroke="${c.ornament}" stroke-width="1.2"/>
    <path d="M4.6 14.6 14.6 4.6H39.4L49.4 14.6V39.4L39.4 49.4H14.6L4.6 39.4Z" fill="none" stroke="${c.dim}" stroke-width="0.8"/>
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
  if (set === "hull") return encode(hullFrame(colors, level));
  return "none";
}

/** Four small points around a ring: the medallion of the forged set, drawn to the size of its box. */
export function medallionImage(set: OrnamentSetId, c: OrnamentColors): string {
  if (set === "hull")
    return encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M26 4h48l24 46-24 46H26L2 50Z" fill="none" stroke="${c.hi}" stroke-width="3"/>
    <path d="M26 11h48l19 39-19 39H26L7 50Z" fill="none" stroke="${c.dim}" stroke-width="1.5"/>
    <path d="M2 50l7-4v8zM98 50l-7-4v8z" fill="${c.hi}"/>
  </svg>`);
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

/** Scan lines for the notes of the hull set: fine lines of light across the edges. */
export function scanlineImage(c: OrnamentColors): string {
  return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4">
    <rect width="8" height="1" fill="${c.hi}" opacity=".5"/></svg>`);
}

/** Soft grain for the notes and frames, as low coverage noise. */
export function grainImage(): string {
  return encode(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>
    <rect width="160" height="160" filter="url(#n)" opacity=".35"/></svg>`);
}
