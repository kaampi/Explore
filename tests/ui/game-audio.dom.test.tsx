// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { File as NodeFile } from "node:buffer";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameAudio } from "../../src/ui/audio/GameAudio";
import * as storage from "../../src/ui/audio/audioStorage";

let root: Root, container: HTMLDivElement;
let play: ReturnType<typeof vi.spyOn>, revoke: ReturnType<typeof vi.fn>;
const paused = new WeakMap<HTMLMediaElement, boolean>();
function file(name = "Bridge.mp3") { return new NodeFile(["own music"], name, { type: "audio/mpeg" }) as unknown as File; }
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Audio UI did not settle: ${container.textContent}`);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
}
async function mount(id: string) {
  await act(async () => { root.render(<GameAudio key={id} conversationId={id} />); });
  await waitFor(() => !container.querySelector<HTMLSelectElement>("select")?.disabled);
}
async function upload(track: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [track] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(el => el.textContent === label)!;
  expect(button).toBeDefined();
  await act(async () => { button.click(); });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("indexedDB", new IDBFactory());
  let number = 0;
  revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:track-${++number}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function(this: HTMLMediaElement) { return paused.get(this) ?? true; });
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function(this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new Event("play")); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function(this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new Event("pause")); });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("personal soundtrack controls", () => {
  it("uploads without autoplay, plays explicitly, pauses, restores per conversation and releases URLs", async () => {
    await mount("first");
    await upload(file());
    await waitFor(() => !!container.querySelector("audio")?.getAttribute("src"));
    expect(play).not.toHaveBeenCalled();
    expect(container.querySelector("audio")?.loop).toBe(true);
    await click("Play soundtrack");
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("playing");
    await click("Pause soundtrack");
    expect(container.textContent).not.toContain("· playing");
    await click("Play soundtrack");
    const previous = container.querySelector("audio")!;
    await mount("second");
    expect(previous.paused).toBe(true);
    expect(container.querySelector("audio")?.getAttribute("src")).toBeNull();
    expect(container.querySelectorAll("option")).toHaveLength(2);
    expect(revoke).toHaveBeenCalledWith("blob:track-1");
    await mount("first");
    await waitFor(() => !!container.querySelector("audio")?.getAttribute("src"));
    expect(play).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("· playing");
  });
  it("changes tracks without playing and persists volume and loop independently", async () => {
    const first = await storage.addAudioTrack(file("first.mp3"));
    const second = await storage.addAudioTrack(file("second.mp3"));
    await storage.saveAudioPreferences({ ...storage.defaultAudioPreferences("a"), trackId: first.id, volume: .2, loop: false });
    await mount("a");
    await waitFor(() => !!container.querySelector("audio")?.getAttribute("src"));
    expect(container.querySelector("audio")?.volume).toBe(.2);
    expect(container.querySelector("audio")?.loop).toBe(false);
    await click("Play soundtrack");
    await act(async () => {
      const select = container.querySelector("select")!; select.value = second.id; select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => container.querySelector("audio")?.getAttribute("src") === "blob:track-2");
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await waitFor(() => container.querySelector("audio")?.loop === true);
    await mount("b");
    expect(container.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe("40");
    expect((await storage.loadAudioLibrary("a")).preferences).toMatchObject({ trackId: second.id, volume: .2, loop: true });
  });
  it("keeps failed uploads retryable and reports playback errors", async () => {
    await mount("a");
    const save = vi.spyOn(storage, "addAudioTrack").mockRejectedValueOnce(new Error("Storage is full"));
    await upload(file());
    await waitFor(() => container.textContent?.includes("Storage is full") === true);
    expect(container.querySelectorAll("option")).toHaveLength(1);
    save.mockRestore();
    await upload(file());
    await waitFor(() => !!container.querySelector("audio")?.getAttribute("src"));
    play.mockRejectedValueOnce(new Error("codec unsupported"));
    await click("Play soundtrack");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be played");
    await click("Play soundtrack");
    expect(container.textContent).toContain("· playing");
  });
  it("removes a playing track and all conversation selections", async () => {
    await mount("a"); await upload(file());
    await waitFor(() => !!container.querySelector("audio")?.getAttribute("src"));
    const selected = (await storage.loadAudioLibrary("a")).tracks[0]!;
    await storage.saveAudioPreferences({ ...storage.defaultAudioPreferences("b"), trackId: selected.id });
    await click("Play soundtrack");
    await click("Remove track");
    await waitFor(() => container.querySelectorAll("option").length === 1);
    expect(container.querySelector("audio")?.paused).toBe(true);
    expect(container.querySelector("audio")?.getAttribute("src")).toBeNull();
    expect((await storage.loadAudioLibrary("b")).preferences.trackId).toBeNull();
  });
});
