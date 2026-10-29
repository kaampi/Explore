import { expect, it, vi } from "vitest";
import { openCompanionWindow } from "../../src/integrations/companionWindows";

it("focuses an existing app without reloading and reopens it after closing", () => {
  const first = { closed: false, focus: vi.fn(), location: { href: "original" }, opener: {} };
  const second = { closed: false, focus: vi.fn(), location: { href: "original" }, opener: {} };
  const open = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  vi.stubGlobal("window", { open });
  try {
    openCompanionWindow("storybook", "http://localhost:3000");
    openCompanionWindow("storybook", "http://localhost:3000");
    expect(open).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(2);
    expect(first.location.href).toBe("original");
    openCompanionWindow("storybook", "http://localhost:3001");
    expect(first.location.href).toBe("http://localhost:3001");
    first.closed = true;
    openCompanionWindow("storybook", "http://localhost:3001");
    expect(open).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});
