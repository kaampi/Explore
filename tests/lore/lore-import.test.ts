import { canonSettingText } from "../../src/state/WorldCanon";
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { importLorebook, importEmbeddedLore } from "../../src/lore/sillyTavernLore";
import { attachLorebooks } from "../../src/lore/attachLorebooks";
import { buildLayerBlocks } from "../../src/layers/LayerEngine";
import { groupLayersForCompaction } from "../../src/layers/LayerCompaction";
import { createSessionFromSetup } from "@session/createSession";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { collectLibraryBackup, parseLibraryBackup, restoreLibraryBackup } from "@library/libraryBackup";
import { newCharacterTemplate } from "@library/LibrarySchema";
import { parseSession } from "@state/StateSchema";
import { extractSillyTavernJsonFromPng } from "@library/sillyTavernImport";

function entry(extra: Record<string, unknown> = {}) {
  return { keys: ["gate"], content: "The gate opens at dawn.", enabled: true, insertion_order: 100, extensions: {}, ...extra };
}
function scene() {
  return createSessionFromSetup({ location: "Garden", lighting: "soft", noise: "quiet", music: false, placeNote: "", characters: [{ name: "Ari", libraryId: "ari", personality: "Curious", mood: "neutral", position: "here", lore: [{ content: "Native lore", keywords: ["old"] }] }] }, "test");
}
function approved(raw: unknown) {
  const book = importLorebook(raw, "Garden.json");
  book.binding = { kind: "all", targetId: "" };
  book.entries.forEach(e => { e.approved = true; });
  return book;
}

describe("SillyTavern lore adapter", () => {
  it("reads native World Info, embedded V2/V3 and standalone V3 without changing text or original metadata", () => {
    const sources = [
      { entries: { 4: { uid: 4, key: ["gate"], content: "Åäö. Gate.", comment: "A note", disable: false } } },
      { spec: "chara_card_v2", data: { character_book: { entries: [entry()] } } },
      { spec: "chara_card_v3", data: { character_book: { entries: [entry()] } } },
      { spec: "lorebook_v3", data: { name: "Garden", entries: [entry()] } },
    ];
    for (const raw of sources) {
      const before = structuredClone(raw);
      const book = importLorebook(raw, "source.json");
      expect(book.raw).toEqual(raw);
      expect(raw).toEqual(before);
      expect(book.entries[0]?.approved).toBe(false);
      expect(book.entries[0]?.mode).toBe("keywords");
      expect(book.binding.kind).toBe("none");
    }
  });

  it.each([
    { enabled: false }, { selective: true, secondary_keys: ["night"] }, { keys: [] },
    { keys: ["/gate/i"] }, { use_regex: true }, { case_sensitive: true }, { extensions: { probability: 40 } },
    { extensions: { sticky: 2 } }, { extensions: { cooldown: 2 } }, { extensions: { delay: 2 } },
    { extensions: { vectorized: true } }, { extensions: { group: "secrets" } },
    { extensions: { delay_until_recursion: true } }, { position: 4 }, { content: "{{char}} knows this." },
    { content: "@@activate\nHidden rule" }, { extensions: { automation_id: "run" } },
    { extensions: { future_activation: true } }, { future_rule: "x" }, { constant: "true" },
  ])("retains unsupported entry as dormant even if marked approved: %j", extra => {
    const book = approved({ entries: [entry(extra)] });
    expect(book.entries[0]?.mode).toBe("dormant");
    expect(book.entries[0]?.reasons.length).toBeGreaterThan(0);
    expect(attachLorebooks(scene(), [book]).layers).toEqual(scene().layers);
    expect(book.entries[0]?.raw).toEqual(entry(extra));
  });

  it("accepts native default selective=true with empty secondary keys, because no secondary condition applies", () => {
    const book = importLorebook({ entries: { 1: { uid: 1, key: ["gate"], keysecondary: [], selective: true, content: "Dawn", disable: false, characterFilter: { isExclude: false, names: [], tags: [] } } } }, "Default.json");
    expect(book.entries[0]?.mode).toBe("keywords");
    expect(book.entries[0]?.approved).toBe(false);
  });

  it("keeps recursive books dormant and retains malformed embedded lore without blocking the character", () => {
    const book = approved({ recursive_scanning: true, entries: [entry()] });
    expect(book.entries[0]?.mode).toBe("dormant");
    expect(importEmbeddedLore({ broken: true }, "Card lore").entries[0]?.mode).toBe("dormant");
    expect(() => importLorebook({ unrelated: true }, "x")).toThrow(/No lorebook/);
  });

  it("keeps plain keyword behavior, approval and existing lore unchanged; the source memo never enters the prompt", () => {
    const original = scene();
    const before = structuredClone(original);
    const book = approved({ entries: [entry({ comment: "PRIVATE MEMO" })] });
    const fresh = attachLorebooks(original, [book]);
    expect(original).toEqual(before);
    expect(buildLayerBlocks(fresh).some(b => b.content.includes("gate opens"))).toBe(false);
    fresh.conversation = [{ turn: 0, role: "player", content: "GATE?" }];
    expect(buildLayerBlocks(fresh).some(b => b.content === "The gate opens at dawn.")).toBe(true);
    expect(JSON.stringify(buildLayerBlocks(fresh))).not.toContain("PRIVATE MEMO");
    fresh.conversation = [{ turn: 0, role: "player", content: "gatehouse" }];
    expect(buildLayerBlocks(fresh).some(b => b.content.includes("gate opens"))).toBe(false);
    book.entries[0]!.approved = false;
    expect(attachLorebooks(original, [book])).toEqual(original);
    expect(buildLayerBlocks(before)).toEqual(buildLayerBlocks(original));
  });

  it("binds by library identity or campaign, deduplicates and snapshots approved source text", () => {
    const original = scene();
    const book = approved({ entries: [entry({ constant: true })] });
    book.binding = { kind: "character", targetId: "someone-else" };
    expect(attachLorebooks(original, [book])).toEqual(original);
    book.binding.targetId = "ari";
    const fresh = attachLorebooks(original, [book]);
    expect(fresh.layers).toHaveLength(original.layers.length + 1);
    expect(attachLorebooks(fresh, [book]).layers).toEqual(fresh.layers);
    expect(parseSession(fresh).layers).toEqual(fresh.layers);
    book.entries[0]!.content = "Changed later";
    expect(fresh.layers.at(-1)?.content).toBe("The gate opens at dawn.");
    book.binding = { kind: "campaign", targetId: "campaign" };
    expect(attachLorebooks(original, [book])).toEqual(original);
    expect(attachLorebooks({ ...original, campaignId: "campaign" }, [book]).layers).toHaveLength(original.layers.length + 1);
  });

  it("caps imported context, keeps constant lore optional, and excludes it from AI compaction", () => {
    const book = approved({ entries: [entry({ constant: true, content: "x".repeat(4000) }), entry({ constant: true, content: "y".repeat(2000) })] });
    const fresh = attachLorebooks(scene(), [book]);
    const blocks = buildLayerBlocks(fresh).filter(b => b.content.startsWith("x") || b.content.startsWith("y"));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.required).toBe(false);
    expect(canonSettingText(fresh)).not.toContain("x".repeat(100));
    expect(groupLayersForCompaction(fresh.layers, Object.keys(fresh.characters)).flatMap(g => g.layers).some(l => l.loreSource)).toBe(false);
  });

  it("persists raw sources, approval and links, includes lorebooks in backup and keeps existing conversations untouched", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "lore-tests");
    const original = scene();
    await repo.createConversation(original);
    const book = approved({ entries: [entry()] });
    const character = newCharacterTemplate({ id: "ari", name: "Ari" });
    await repo.saveCharacterWithLorebook(character, book);
    const packed = await collectLibraryBackup(repo);
    await repo.close();
    const reopened = new IndexedDBRepository(factory, "lore-tests");
    expect((await reopened.listLorebooks()).entries).toEqual([book]);
    expect(await reopened.loadSession(original.id)).toEqual(original);
    const target = new IndexedDBRepository(factory, "lore-restored");
    const parsed = parseLibraryBackup(JSON.parse(JSON.stringify(packed)));
    expect(parsed.skipped).toBe(0);
    expect((await restoreLibraryBackup(target, parsed.backup)).skipped).toBe(0);
    expect((await target.listLorebooks()).entries).toEqual([book]);
    await expect(target.saveLorebook({ ...book, name: "" })).rejects.toThrow();
    await expect(target.saveCharacterWithLorebook({ ...character, name: "Changed" }, { ...book, name: "" })).rejects.toThrow();
    expect((await target.listCharacters())[0]?.name).toBe("Ari");
    expect((await target.listLorebooks()).entries).toEqual([book]);
    await reopened.close(); await target.close();
  });

  it("decodes Unicode lore from base64 PNG character chunks", async () => {
    const raw = { spec: "chara_card_v3", data: { name: "Åsa", character_book: { entries: [entry({ content: "Öppna grinden." })] } } };
    const base64 = Buffer.from(JSON.stringify(raw), "utf8").toString("base64");
    const payload = new TextEncoder().encode(`ccv3\0${base64}`);
    const chunk = new Uint8Array(12 + payload.length);
    new DataView(chunk.buffer).setUint32(0, payload.length);
    chunk.set(new TextEncoder().encode("tEXt"), 4); chunk.set(payload, 8);
    const bytes = new Uint8Array(8 + chunk.length);
    bytes.set([137,80,78,71,13,10,26,10]); bytes.set(chunk, 8);
    const decoded = await extractSillyTavernJsonFromPng(bytes);
    expect(decoded).toEqual(raw);
    expect(importLorebook(decoded, "Åsa.png").entries[0]?.content).toBe("Öppna grinden.");
  });
  it("upgrades a real v11 store without rewriting sessions or native layers", async () => {
    const factory = new IDBFactory();
    const original = scene();
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open("v11-lore", 11);
      req.onupgradeneeded = () => req.result.createObjectStore("sessions", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(original);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    old.close();
    const repo = new IndexedDBRepository(factory, "v11-lore");
    expect(await repo.loadSession(original.id)).toEqual(original);
    const book = approved({ entries: [entry()] });
    await repo.saveLorebook(book);
    expect((await repo.listLorebooks()).entries).toEqual([book]);
    expect(await repo.loadSession(original.id)).toEqual(original);
    await repo.close();
  });

});
