import { z } from "zod";

/** Presentation only. No prompts, scripts, external URLs, or engine state. */
export const PlayThemeSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  background: z.string().regex(/^#[\da-f]{6}$/i),
  panel: z.string().regex(/^#[\da-f]{6}$/i),
  text: z.string().regex(/^#[\da-f]{6}$/i),
  accent: z.string().regex(/^#[\da-f]{6}$/i),
  panelOpacity: z.number().min(0.6).max(1),
  backdropDim: z.number().min(0).max(0.9),
  textSize: z.number().int().min(15).max(26),
  textWidth: z.number().int().min(480).max(1000),
  font: z.enum(["serif", "sans"]),
  backgroundMode: z.enum(["scene", "custom", "none"]),
  backgroundDataUrl: z
    .string()
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(5_600_000)
    .optional(),
});
export type PlayTheme = z.infer<typeof PlayThemeSchema>;
const base = {
  version: 1 as const,
  panelOpacity: 0.94,
  backdropDim: 0.4,
  textSize: 19,
  textWidth: 760,
  font: "serif" as const,
  backgroundMode: "scene" as const,
};
export const PRESET_THEMES: PlayTheme[] = [
  {
    ...base,
    id: "parchment",
    name: "Parchment",
    background: "#e8dfce",
    panel: "#faf5e9",
    text: "#352e25",
    accent: "#795a32",
  },
  {
    ...base,
    id: "forest",
    name: "Forest dusk",
    background: "#172e29",
    panel: "#223c34",
    text: "#e5eadc",
    accent: "#bbcea0",
    backdropDim: 0.52,
  },
  {
    ...base,
    id: "neon",
    name: "Neon city",
    background: "#151729",
    panel: "#20213b",
    text: "#ece9fa",
    accent: "#c0a5ed",
    font: "sans",
    backdropDim: 0.6,
  },
  {
    ...base,
    id: "quiet",
    name: "Quiet conversation",
    background: "#f0f0ec",
    panel: "#ffffff",
    text: "#29352f",
    accent: "#44664d",
    font: "sans",
    backgroundMode: "none",
    panelOpacity: 1,
  },
];
export const ThemeLibrarySchema = z.object({
  version: z.literal(1),
  active: PlayThemeSchema,
  defaultPlay: PlayThemeSchema.optional(),
  conversations: z.record(PlayThemeSchema).default({}),
  saved: z.array(PlayThemeSchema).max(50),
  shell: z.enum(["light", "dark"]),
});
export type ThemeLibrary = z.infer<typeof ThemeLibrarySchema>;
export function defaultThemeLibrary(): ThemeLibrary {
  return {
    version: 1,
    active: { ...PRESET_THEMES[0]! },
    saved: [],
    conversations: {},
    shell: "light",
  };
}
export function rgb(hex: string): string {
  return [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    .join(", ");
}
export function contrastRatio(first: string, second: string): number {
  function luminance(hex: string) {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  }
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
