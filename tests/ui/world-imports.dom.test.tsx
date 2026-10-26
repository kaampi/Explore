// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/ui/App";
import onlyFixture from "../fixtures/onlyworlds-world-export.json";
import { createSessionFromSetup } from "@session/createSession";
import { newCampaignTemplate } from "@library/LibrarySchema";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
let root: Root, container: HTMLDivElement, reply: string;
function button(label: string): HTMLButtonElement {
    const element = Array.from(container.querySelectorAll("button")).find((element) => (element.getAttribute("aria-label") || element.textContent?.trim()) === label);
    if (!element)
        throw new Error(`Missing button: ${label} in ${container.textContent?.slice(-500)}`);
    return element;
}
function named(label: string): HTMLButtonElement {
    const element = Array.from(container.querySelectorAll("button")).find((element) => element.getAttribute("aria-label") === label);
    if (!element)
        throw new Error(`Missing action: ${label}`);
    return element;
}
async function click(element: HTMLElement) {
    await act(async () => {
        element.click();
    });
}
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function waitFor(check: () => boolean) {
    const deadline = Date.now() + 4000;
    while (!check()) {
        if (Date.now() > deadline)
            throw new Error(`UI did not settle: ${container.textContent?.slice(-800)}`);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}
async function mount() {
    await act(async () => {
        root.render(<App />);
    });
    await waitFor(() => !!container.querySelector(".sb-home-connection") &&
        !container.textContent?.includes("Checking your local AI…"));
}
async function create(name: string) {
    await click(button(container
        .querySelector(".sb-hero__content h2")
        ?.textContent?.includes("Every conversation")
        ? "Create your first character ＋"
        : "＋ Create"));
    await input(container.querySelector<HTMLInputElement>('input[placeholder="What are they called?"]')!, name);
    await click(button("Create & chat →"));
    await waitFor(() => !!container.querySelector('[aria-label="Your message"]'));
}
async function send(text: string, answer: string) {
    reply = answer;
    await input(container.querySelector<HTMLInputElement>('[aria-label="Your message"]')!, text);
    await click(button("Send"));
    await waitFor(() => !!container.querySelector(".chat-log")?.textContent?.includes(answer));
    await waitFor(() => !container.querySelector(".message--streaming"));
}
async function home() {
    await click(button("Exit conversation"));
    await waitFor(() => !!container.querySelector(".sb-home-connection"));
}
async function theme(name: string) {
    await click(named("Appearance and themes"));
    await click(button(`Aa ✧${name}`));
    await click(button("Done"));
}
beforeEach(() => {
    (globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("indexedDB", new IDBFactory());
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
        configurable: true,
        value() {
            this.open = true;
        },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
        configurable: true,
        value() {
            this.open = false;
        },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        value() { },
    });
    reply = "A quiet hello.";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const address = String(url);
        if (address.startsWith("/api/ecosystem/status")) {
            const parsed = new URL(address, "http://localhost");
            return Response.json({
                appId: parsed.searchParams.get("app"),
                address: parsed.searchParams.get("address"),
                state: "unknown",
                checkedAt: 1,
            });
        }
        if (address.endsWith("/api/tags"))
            return Response.json({ models: [{ name: "chat-a" }] });
        if (address.endsWith("/api/show"))
            return Response.json({ capabilities: ["completion"] });
        if (address.endsWith("/api/chat")) {
            const payload = JSON.parse(String(init?.body));
            const text = payload.options?.temperature === 0.8 ? reply : "[]";
            return new Response(JSON.stringify({ message: { content: text }, done: false }) +
                "\n" +
                JSON.stringify({ done: true }) +
                "\n", { headers: { "content-type": "application/x-ndjson" } });
        }
        throw new Error(`Unexpected request: ${address}`);
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});


function jsonFile(raw: unknown, name: string) {
  const file = new File([JSON.stringify(raw)], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(raw) });
  return file;
}
async function upload(raw: unknown, name: string) {
  const element = container.querySelector<HTMLInputElement>('.sb-lore-studio input[type="file"]')!;
  Object.defineProperty(element, "files", { configurable: true, value: [jsonFile(raw, name)] });
  await act(async () => { element.dispatchEvent(new Event("change", { bubbles: true })); });
  await waitFor(() => !!container.querySelector('.sb-lore-review'));
}
async function selectValue(element: HTMLSelectElement, value: string) {
  await act(async () => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function openImports() {
  await click(button("▤ Lorebooks"));
  await waitFor(() => !!container.querySelector('.sb-lore-studio'));
}
const cards = [
  { keys: "Ari", value: "Ari reads the stars.", type: "character", title: "Ari", description: "EDITOR NOTE" },
  { keys: "Starport", value: "Starport is a quiet harbour.", type: "location", title: "Starport" },
];

describe("external world import journeys", () => {
  it("imports Story Cards as an explicitly selected world and starts playing through Home", async () => {
    await mount();
    await openImports();
    await upload(cards, "Star travellers.json");
    expect(container.textContent).toContain("AI Dungeon Story Cards");
    expect(container.querySelector<HTMLInputElement>('.sb-world-import-choice input')?.checked).toBe(false);
    await click(button("Use supported entries with Sandbox rules"));
    await click(container.querySelector<HTMLInputElement>('.sb-world-import-choice input')!);
    await click(button("Save world & lore"));
    await waitFor(() => container.textContent?.includes("World saved with 1 characters and 1 places") ?? false);
    const repo = new IndexedDBRepository();
    const book = (await repo.listLorebooks()).entries[0]!;
    expect(book.binding.kind).toBe("realm");
    expect((await repo.listCharacters())[0]?.personality).not.toContain("EDITOR NOTE");
    await click(named("SandboxAI home"));
    await waitFor(() => !!container.querySelector('.sb-home-connection'));
    const worldCard = Array.from(container.querySelectorAll<HTMLButtonElement>('.sb-world-card')).find(card => card.textContent?.includes("Star travellers"))!;
    await click(worldCard);
    const person = (await repo.listCharacters())[0]!;
    await selectValue(container.querySelectorAll<HTMLSelectElement>('dialog select')[1]!, person.id);
    await click(button("Begin exploring →"));
    await waitFor(() => !!container.querySelector('[aria-label="Your message"]'));
    await send("Ari, what is Starport like?", "A quiet harbour beneath the stars.");
    const session = await repo.loadSession((await repo.listSessionIds())[0]!);
    expect(session.scene?.realm).toBe("Star travellers");
    expect(session.layers.filter(layer => layer.loreSource)).toHaveLength(2);
    expect((await repo.listLorebooks()).entries[0]?.raw).toEqual(cards);
    await repo.close();
  }, 20000);

  it("imports the real OnlyWorlds fixture and uses its new character's world lore during a direct chat", async () => {
    await mount(); await openImports();
    await upload(onlyFixture, "OnlyWorlds.json");
    await click(button("Use supported entries with Sandbox rules"));
    await click(container.querySelector<HTMLInputElement>('.sb-world-import-choice input')!);
    await click(button("Save world & lore"));
    await waitFor(() => container.textContent?.includes("World saved with 2 characters and 2 places") ?? false);
    const repo = new IndexedDBRepository();
    await click(named("SandboxAI home"));
    await waitFor(() => !!container.querySelector('.sb-home-connection'));
    const pip = Array.from(container.querySelectorAll<HTMLButtonElement>('.sb-character-card')).find(card => card.textContent?.includes("Pip"))!;
    await click(pip);
    await waitFor(() => !!container.querySelector('[aria-label="Conversation rule-set"]'));
    await click(button("Start conversation →"));
    await waitFor(() => !!container.querySelector('[aria-label="Your message"]'));
    await send("Tell me about The Mill.", "The Mill lies below the keep.");
    const session = await repo.loadSession((await repo.listSessionIds())[0]!);
    expect(session.layers.filter(layer => layer.loreSource).length).toBeGreaterThan(0);
    expect(session.layers.some(layer => layer.content.includes("A stone keep on the hill."))).toBe(true);
    await repo.close();
  }, 20000);

  it("imports Azgaar Minimal JSON as optional lore without creating library cards by default", async () => {
    await mount(); await openImports();
    const map = { info: { description: "Azgaar's Fantasy Map Generator output", mapId: 123, mapName: "Coast" }, pack: { burgs: [0, { i: 1, name: "Port Dawn", note: "A sheltered port." }] } };
    await upload(map, "Coast-Minimal.json");
    expect(container.textContent).toContain("Azgaar Full / Minimal JSON");
    await click(button("Use supported entries with Sandbox rules"));
    await click(button("Save lorebook"));
    await waitFor(() => !container.querySelector('.sb-lore-review'));
    const repo = new IndexedDBRepository();
    expect(await repo.listCharacters()).toHaveLength(0);
    expect((await repo.listPlaces()).filter(p => p.name === "Port Dawn")).toHaveLength(0);
    const saved = (await repo.listLorebooks()).entries[0]!;
    expect(saved.binding.kind).toBe("none"); expect(saved.raw).toEqual(map);
    expect(saved.entries[0]?.content).toContain("A sheltered port.");
    await repo.close();
  }, 15000);

  it("keeps a world review on storage failure, retries safely and lets an import be cancelled", async () => {
    await mount(); await openImports(); await upload(cards, "cards.json");
    await click(button("Use supported entries with Sandbox rules"));
    await click(container.querySelector<HTMLInputElement>('.sb-world-import-choice input')!);
    const spy = vi.spyOn(IndexedDBRepository.prototype, "saveWorldImport").mockRejectedValueOnce(new Error("Storage unavailable"));
    await click(button("Save world & lore"));
    await waitFor(() => container.textContent?.includes("Storage unavailable") ?? false);
    expect(container.querySelector('.sb-lore-review')).not.toBeNull();
    await click(button("Save world & lore"));
    await waitFor(() => !container.querySelector('.sb-lore-review'));
    expect(spy).toHaveBeenCalledTimes(2);
    await upload(cards, "second.json"); await click(button("Cancel"));
    const repo = new IndexedDBRepository();
    expect((await repo.listLorebooks()).entries).toHaveLength(1);
    expect(await repo.listCharacters()).toHaveLength(1);
    await repo.close();
  }, 15000);
});
