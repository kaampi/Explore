import { describe, it, expect } from "vitest";
import { dropOversizedPortraitFromRaw, MAX_LIBRARY_PORTRAIT_CHARS } from "@library/slimPortrait";

describe("slimPortrait", () => {
  it("keeps a small jpeg data URL", () => {
    const raw = { id: "a", portraitDataUrl: "data:image/jpeg;base64,aaaa" };
    expect(dropOversizedPortraitFromRaw(raw)).toBe(raw);
  });

  it("strips an oversized portrait so the shelf can load", () => {
    const raw = {
      id: "rachel",
      name: "Rachel",
      portraitDataUrl: `data:image/png;base64,${"A".repeat(MAX_LIBRARY_PORTRAIT_CHARS + 10)}`
    };
    const slim = dropOversizedPortraitFromRaw(raw) as { portraitDataUrl?: string; name: string };
    expect(slim.portraitDataUrl).toBeUndefined();
    expect(slim.name).toBe("Rachel");
  });
});
