import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { addAudioTrack, defaultAudioPreferences, deleteAudioTrack, deleteAudioPreferences, loadAudioBlob, loadAudioLibrary, MAX_AUDIO_BYTES, saveAudioPreferences } from "../../src/ui/audio/audioStorage";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
describe("local soundtrack library", () => {
  it("clears conversation playback preferences without deleting shared audio or other selections", async () => {
    const track = await addAudioTrack(new File(["music"], "bridge.mp3"));
    await saveAudioPreferences({ ...defaultAudioPreferences("deleted"), trackId: track.id });
    const kept = { ...defaultAudioPreferences("kept"), trackId: track.id, volume: .2 };
    await saveAudioPreferences(kept);
    await deleteAudioPreferences("deleted");
    expect((await loadAudioLibrary("deleted")).preferences).toEqual(defaultAudioPreferences("deleted"));
    expect(await loadAudioLibrary("kept")).toEqual({ tracks: [track], preferences: kept });
    expect(await (await loadAudioBlob(track.id)).text()).toBe("music");
  });
  it("stores one shared blob and independent conversation preferences across reloads", async () => {
    const track = await addAudioTrack(new File(["own music"], "Bridge.mp3", { type: "audio/mpeg" }));
    const first = { ...defaultAudioPreferences("first"), trackId: track.id, volume: .25, loop: false };
    await saveAudioPreferences(first);
    expect(await loadAudioLibrary("first")).toEqual({ tracks: [track], preferences: first });
    expect((await loadAudioLibrary("second")).preferences).toEqual(defaultAudioPreferences("second"));
    expect(await (await loadAudioBlob(track.id)).text()).toBe("own music");
    // Playback intent is deliberately absent from persisted settings.
    expect(first).not.toHaveProperty("playing");
  });
  it("atomically removes audio, metadata and selections without losing other settings", async () => {
    const removed = await addAudioTrack(new File(["first"], "first.ogg"));
    const kept = await addAudioTrack(new File(["second"], "second.wav"));
    await saveAudioPreferences({ ...defaultAudioPreferences("a"), trackId: removed.id, volume: .8 });
    await saveAudioPreferences({ ...defaultAudioPreferences("b"), trackId: removed.id, loop: false });
    await saveAudioPreferences({ ...defaultAudioPreferences("c"), trackId: kept.id });
    await deleteAudioTrack(removed.id);
    expect((await loadAudioLibrary("a")).preferences).toMatchObject({ trackId: null, volume: .8 });
    expect((await loadAudioLibrary("b")).preferences).toMatchObject({ trackId: null, loop: false });
    expect(await loadAudioLibrary("c")).toMatchObject({ tracks: [kept], preferences: { trackId: kept.id } });
    await expect(loadAudioBlob(removed.id)).rejects.toThrow();
  });
  it("rejects invalid or oversized files before creating records", async () => {
    await expect(addAudioTrack(new File(["not music"], "script.html"))).rejects.toThrow("audio file");
    await expect(addAudioTrack(new File([], "empty.mp3"))).rejects.toThrow("empty");
    const large = new File(["x"], "large.mp3");
    Object.defineProperty(large, "size", { value: MAX_AUDIO_BYTES + 1 });
    await expect(addAudioTrack(large)).rejects.toThrow("50 MB");
    await expect(saveAudioPreferences({ ...defaultAudioPreferences("a"), volume: NaN })).rejects.toThrow("volume");
    expect((await loadAudioLibrary("a")).tracks).toEqual([]);
  });
  it("reports unavailable storage rather than claiming files were saved", async () => {
    vi.stubGlobal("indexedDB", { open() { throw new Error("disk full"); } });
    await expect(addAudioTrack(new File(["music"], "track.mp3"))).rejects.toThrow("disk full");
  });
});
