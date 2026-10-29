import { afterEach, expect, it, vi } from "vitest";
import { openCompanionApp, openCompanionWindow } from "../../src/integrations/companionWindows";

const native = vi.hoisted(() => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => native);
afterEach(() => { native.isTauri.mockReturnValue(false); native.invoke.mockReset(); vi.unstubAllGlobals(); });

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

it("routes desktop app opening through the native command without a browser window", async () => {
  native.isTauri.mockReturnValue(true);
  native.invoke.mockResolvedValue(undefined);
  const open = vi.fn(); vi.stubGlobal("window", {open});
  await openCompanionApp("storybook", "http://localhost:5175/");
  expect(native.invoke).toHaveBeenCalledWith("open_companion_app", {appId:"storybook"});
  expect(open).not.toHaveBeenCalled();
});
it("surfaces a missing desktop app without opening a web fallback", async () => {
  native.isTauri.mockReturnValue(true); native.invoke.mockRejectedValue("Not installed");
  const open = vi.fn(); vi.stubGlobal("window", {open});
  await expect(openCompanionApp("comicbook", "http://localhost:5176/")).rejects.toBe("Not installed");
  expect(open).not.toHaveBeenCalled();
});
it("continues to open web companions in a browser", async () => {
  const open=vi.fn().mockReturnValue({closed:false,focus:vi.fn(),opener:null}); vi.stubGlobal("window",{open});
  await openCompanionApp("comicbook", "http://localhost:5176/");
  expect(open).toHaveBeenCalledWith("http://localhost:5176/", "kaampi-comicbook");
  expect(native.invoke).not.toHaveBeenCalled();
});
