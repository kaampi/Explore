import type { CSSProperties } from "react";
import { contrastRatio } from "../../themes/theme";
import { effectiveOrnament, type OrnamentSetId } from "./sets";
import { frameImage, grainImage, medallionImage, sealImage, type OrnamentColors } from "./svg";

/** A colour as `#rrggbb`, or the fallback when it is not one (a theme read from an old file). */
const hexOr = (value: string | undefined, fallback: string) =>
  value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
/** `first` with `amount` (0 to 1) of `second` mixed in, as a hex colour. */
export function mixHex(first: string, second: string, amount: number): string {
  return `#${[1, 3, 5]
    .map((at) =>
      Math.round(channel(first, at) * (1 - amount) + channel(second, at) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** The colours of the ornaments of a theme: its accent, lighter, and toned toward the panel. */
export function ornamentColors(theme: { accent?: string; panel?: string }): OrnamentColors {
  const accent = hexOr(theme.accent, "#795a32");
  return {
    ornament: accent,
    hi: mixHex(accent, "#ffffff", 0.3),
    dim: mixHex(accent, hexOr(theme.panel, "#faf5e9"), 0.55),
  };
}

/** The dark inside of a sign and its lettering: lettering is lightened until it reads on the sign. */
export function plateColors(theme: { accent?: string }): { bg: string; text: string } {
  const accent = hexOr(theme.accent, "#795a32");
  const bg = mixHex("#14110d", accent, 0.12);
  let text = mixHex(accent, "#ffffff", 0.3);
  for (let step = 4; contrastRatio(text, bg) < 4.5 && step <= 10; step++)
    text = mixHex(accent, "#ffffff", step / 10);
  return { bg, text };
}

/** Black or white, whichever reads better on `bg`: the number in a seal. */
export function inkOn(bg: string): string {
  return contrastRatio("#14110d", bg) >= contrastRatio("#ffffff", bg) ? "#14110d" : "#ffffff";
}

/** The colours of the note card, which are the same in every theme so that it reads the same. */
export const NOTE_COLORS = { bg: "#e8dcc0", text: "#3a2d1c" } as const;

const HEADING_FONT_FAMILY: Record<string, string> = {
  newsreader: "Newsreader, Georgia, serif",
  cinzel: "Cinzel, Georgia, serif",
  "im-fell": '"IM Fell English", Georgia, serif',
  cormorant: "Georgia, serif",
  exo: "system-ui, sans-serif",
  "special-elite": '"Courier New", monospace',
  nunito: "system-ui, sans-serif",
  inter: "system-ui, sans-serif",
};

/**
 * The CSS variables that the ornament parts read, built from a theme. The pictures are made in
 * code from the theme's own colours, so there are no picture files and no colours in the parts.
 */
export function ornamentVars(
  theme: {
    accent?: string;
    panel?: string;
    ornament?: OrnamentSetId;
    ornamentLevel?: "none" | "light" | "full";
    headingFont?: string;
  },
  options: { simple?: boolean } = {},
): CSSProperties {
  const { set, level } = effectiveOrnament(theme, options);
  const colors = ornamentColors(theme);
  return {
    "--ornament": colors.ornament,
    "--ornament-hi": colors.hi,
    "--ornament-dim": colors.dim,
    "--ornament-frame": frameImage(set, level, colors),
    "--ornament-medallion": medallionImage(set, colors),
    "--ornament-seal": sealImage(set, colors),
    "--ornament-grain": level === "full" && set !== "plain" ? grainImage() : "none",
    "--ornament-plate-bg": plateColors(theme).bg,
    "--ornament-plate-text": plateColors(theme).text,
    "--ornament-seal-ink": inkOn(hexOr(theme.accent, "#795a32")),
    "--ornament-dark": "#14110d",
    "--ornament-darkest": "#0b0a08",
    "--ornament-slot-text": "#efe6d0",
    "--ornament-note-bg": NOTE_COLORS.bg,
    "--ornament-note-text": NOTE_COLORS.text,
    "--heading-font": HEADING_FONT_FAMILY[theme.headingFont ?? "newsreader"],
  } as CSSProperties;
}
