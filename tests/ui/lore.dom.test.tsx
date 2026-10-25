// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/ui/App";
import { createSessionFromSetup } from "@session/createSession";
import { newCampaignTemplate } from "@library/LibrarySchema";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
let root: Root, container: HTMLDivElement, reply: string;
function button(label: string): HTMLButtonElement {
    const element = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === label);
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
    await click(button("← My space"));
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

async function upload(file: File, selector = '.sb-lore-studio input[type="file"]') {
  const element = container.querySelector<HTMLInputElement>(selector)!;
  expect(element).not.toBeNull();
  Object.defineProperty(element, "files", { configurable: true, value: [file] });
  await act(async () => { element.dispatchEvent(new Event("change", { bubbles: true })); });
}
function jsonFile(raw: unknown, name = "Garden.json") {
  const file = new File([JSON.stringify(raw)], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(raw) });
  return file;
}
const supportedEntry = { keys: ["gate"], content: "The gate opens at dawn.", enabled: true, extensions: {} };

describe("lorebook import journeys", () => {
  it("shows and saves parenthesized character fields separately while retaining original text in review", async () => {
    await mount();
    await click(button("♧ Characters"));
    await waitFor(() => container.textContent?.includes("Import SillyTavern") ?? false);
    const description = "[Character(Alice)\n{\nAge(18)\nSex(Female)\nAppearance(Black hair + red eyes)\nOutfit(Black vest)\nPersonality(Shy (when alone) and compassionate.)\nDescription(Her parents left when she was 4 years old.)\nScenario(A school hallway.)\n}]";
    await upload(jsonFile({ spec: "chara_card_v2", data: { name: "Alice the bully", description } }, "Alice.json"), 'input[accept*=".png"]');
    await waitFor(() => !!container.querySelector('.st-import'));
    expect(container.querySelector<HTMLInputElement>('.st-import input[type="number"]')?.value).toBe("18");
    const fields = container.querySelectorAll<HTMLTextAreaElement>('.st-import textarea');
    expect(fields[0]?.value).toBe("Black hair and red eyes.");
    expect(fields[1]?.value).toBe("Shy (when alone) and compassionate.");
    expect(container.querySelector('.st-import__text')?.textContent).toBe(description);
    await click(button("Import"));
    await waitFor(() => !container.querySelector('.st-import'));
    const repo = new IndexedDBRepository();
    expect((await repo.listCharacters())[0]).toMatchObject({ name: "Alice", approximateAge: 18, pronoun: "she", appearance: "Black hair and red eyes.", personality: "Shy (when alone) and compassionate.", scenario: "" });
    await repo.close();
  }, 15000);

  it("reviews and saves supported lore, keeps advanced entries dormant, and activates only in new conversations", async () => {
    await mount();
    await create("Ari");
    await home();
    await click(button("▤ Lorebooks"));
    await waitFor(() => container.textContent?.includes("Import lorebook") ?? false);
    await upload(jsonFile({ entries: [supportedEntry, { ...supportedEntry, comment: "Advanced", extensions: { sticky: 3 } }] }));
    await waitFor(() => !!container.querySelector('.sb-lore-review'));
    const checks = Array.from(container.querySelectorAll<HTMLInputElement>('.sb-lore-entries input'));
    expect(checks[0]?.checked).toBe(false);
    expect(checks[1]?.disabled).toBe(true);
    await click(button("Use supported entries with Sandbox rules"));
    const select = container.querySelector<HTMLSelectElement>('.sb-lore-studio select')!;
    await act(async () => { select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(button("Save lorebook"));
    await waitFor(() => container.textContent?.includes("Lorebook saved") ?? false);
    const repo = new IndexedDBRepository();
    const book = (await repo.listLorebooks()).entries[0]!;
    expect(book.entries.map(e => e.approved)).toEqual([true, false]);
    expect(book.raw).toEqual({ entries: [supportedEntry, { ...supportedEntry, comment: "Advanced", extensions: { sticky: 3 } }] });
    const oldId = (await repo.listSessionIds())[0]!;
    expect((await repo.loadSession(oldId)).layers.some(l => l.loreSource)).toBe(false);
    await click(named("SandboxAI home"));
    await waitFor(() => !!container.querySelector('.sb-home-connection'));
    await create("Bea");
    await send("Tell me about the gate.", "It opens at dawn.");
    const ids = await repo.listSessionIds();
    const fresh = await repo.loadSession(ids.find(id => id !== oldId)!);
    expect(fresh.layers.filter(l => l.loreSource)).toHaveLength(1);
    expect(fresh.layers.find(l => l.loreSource)?.content).toBe(supportedEntry.content);
    await repo.close();
  }, 20000);

  it("retains a failed import review for retry and cancelling never saves", async () => {
    await mount();
    await click(button("▤ Lorebooks"));
    await waitFor(() => container.textContent?.includes("Import lorebook") ?? false);
    await upload(jsonFile({ entries: [supportedEntry] }));
    await waitFor(() => !!container.querySelector('.sb-lore-review'));
    const fail = vi.spyOn(IndexedDBRepository.prototype, "saveLorebook").mockRejectedValueOnce(new Error("Storage unavailable"));
    await click(button("Save lorebook"));
    await waitFor(() => container.textContent?.includes("Storage unavailable") ?? false);
    expect(container.querySelector('.sb-lore-review')).not.toBeNull();
    await click(button("Save lorebook"));
    await waitFor(() => !container.querySelector('.sb-lore-review'));
    expect(fail).toHaveBeenCalledTimes(2);
    await upload(jsonFile({ entries: [supportedEntry] }, "Another.json"));
    await waitFor(() => !!container.querySelector('.sb-lore-review'));
    await click(button("Cancel"));
    const repo = new IndexedDBRepository();
    expect((await repo.listLorebooks()).entries).toHaveLength(1);
    await repo.close();
  }, 15000);

  it("offers embedded character lore and saves character and approvals together", async () => {
    await mount();
    await click(button("♧ Characters"));
    await waitFor(() => container.textContent?.includes("Import SillyTavern") ?? false);
    const raw = { spec: "chara_card_v2", data: { name: "Ari", description: "A traveller", personality: "Curious", character_book: { entries: [supportedEntry] } } };
    await upload(jsonFile(raw, "Ari.json"), 'input[accept*=".png"]');
    await waitFor(() => !!container.querySelector('.sb-embedded-lore'));
    await click(button("Use supported entries with Sandbox rules"));
    const failed = vi.spyOn(IndexedDBRepository.prototype, "saveCharacterWithLorebook").mockRejectedValueOnce(new Error("Storage unavailable"));
    await click(button("Import"));
    await waitFor(() => container.textContent?.includes("Storage unavailable") ?? false);
    const repo = new IndexedDBRepository();
    expect(await repo.listCharacters()).toHaveLength(0);
    await click(button("Import"));
    await waitFor(() => !container.querySelector('.st-import'));
    const people = await repo.listCharacters();
    const books = (await repo.listLorebooks()).entries;
    expect(people).toHaveLength(1);
    expect(books[0]?.binding).toEqual({ kind: "character", targetId: people[0]!.id });
    expect(books[0]?.entries[0]?.approved).toBe(true);
    expect(failed).toHaveBeenCalledTimes(2);
    await repo.close();
  }, 15000);
});
