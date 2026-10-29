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
beforeEach(async () => {
    (globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("indexedDB", new IDBFactory());
  // These journeys exercise a user archive after the optional demo was removed.
  const demoRepo = new IndexedDBRepository();
  await demoRepo.installExampleMona();
  await demoRepo.deleteCharacter("example-mona-sanchez");
  await demoRepo.close();
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
describe("idea capture journeys", () => {
    it("captures selected messages, edits and reloads the idea, and exports a Brainstorm notebook", async () => {
        await mount();
        await create("Ari");
        await send("Could the gate open?", "It opens only at dawn.");
        await click(button("Capture ideas"));
        const checks = Array.from(container.querySelectorAll<HTMLInputElement>('.sb-idea-select input'));
        expect(checks.length).toBeGreaterThanOrEqual(2);
        await click(checks[0]!);
        await click(checks[1]!);
        await click(button("Save selection as idea"));
        const editor = container.querySelector('dialog[aria-label="Save an idea"]')!;
        await input(editor.querySelector<HTMLInputElement>('input')!, "The dawn gate");
        await input(editor.querySelector<HTMLTextAreaElement>('textarea')!, "What if the gate opens at dawn?");
        const kind = editor.querySelector('select')!;
        await act(async () => { kind.value = "world"; kind.dispatchEvent(new Event("change", { bubbles: true })); });
        await click(button("Save idea"));
        await waitFor(() => container.textContent?.includes("Idea saved in My ideas.") ?? false);
        const repo = new IndexedDBRepository();
        const saved = (await repo.listIdeas()).entries[0]!;
        expect(saved.title).toBe("The dawn gate");
        expect(saved.kind).toBe("world");
        expect(saved.source.excerpts).toHaveLength(2);
        await click(button("My ideas"));
        await waitFor(() => !!container.querySelector('.sb-idea-card'));
        await click(button("Edit idea"));
        await input(container.querySelector<HTMLTextAreaElement>('dialog textarea')!, "A new possibility.");
        await click(button("Save idea"));
        await waitFor(() => !container.querySelector('dialog'));
        await act(async () => { root.unmount(); });
        root = createRoot(container);
        await mount();
        await click(button("✧ My ideas"));
        await waitFor(() => !!container.querySelector('.sb-idea-card'));
        expect(container.textContent).toContain("A new possibility.");
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { writeText } });
        await click(button("Copy idea"));
        expect(writeText).toHaveBeenCalledWith("The dawn gate\n\nA new possibility.");
        const blobs: Blob[] = [];
        const downloads: string[] = [];
        vi.stubGlobal('URL', Object.assign(class extends URL {
        }, { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:idea-test'; }, revokeObjectURL: vi.fn() }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
        vi.useFakeTimers();
        await click(button("Export JSON"));
        await act(async () => { await vi.runAllTimersAsync(); });
        vi.useRealTimers();
        const payload = JSON.parse(await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0]!); }));
        expect(downloads[0]).toMatch(/^sandbox-ideas-.*\.json$/);
        expect(payload.book.brainstorm_notes[0].text).toContain("A new possibility.");
        expect(payload.book.facts).toEqual([]);
        expect(payload.sandboxIdeas.ideas[0].source.excerpts).toHaveLength(2);
        expect((await repo.loadSession(saved.source.conversationId)).conversation.length).toBeGreaterThanOrEqual(2);
        await repo.close();
    }, 20000);
    it("keeps the editor and source selection when storage fails, allowing retry", async () => {
        await mount();
        await create("Ari");
        await send("A thought worth keeping.", "Ari smiles.");
        const saveButtons = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === "Save as idea");
        await click(saveButtons[0]!);
        const failing = vi.spyOn(IndexedDBRepository.prototype, 'saveIdea').mockRejectedValueOnce(new Error("Storage unavailable"));
        await click(button("Save idea"));
        await waitFor(() => container.textContent?.includes("Storage unavailable") ?? false);
        expect(container.querySelector('dialog[open]')).not.toBeNull();
        expect(container.querySelector('dialog textarea')?.textContent).toContain("A thought worth keeping.");
        await click(button("Save idea"));
        await waitFor(() => !container.querySelector('dialog'));
        expect(failing).toHaveBeenCalledTimes(2);
        const repo = new IndexedDBRepository();
        expect((await repo.listIdeas()).entries).toHaveLength(1);
        await repo.close();
    }, 15000);
    it("cancels capture without saving, and shows an empty idea library", async () => {
        await mount();
        await create("Ari");
        await send("Do not keep this.", "Understood.");
        await click(Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Save as idea')!);
        await click(button("Cancel"));
        await click(button("My ideas"));
        await waitFor(() => container.textContent?.includes("Keep something worth exploring") ?? false);
        expect(button("Export 0 idea(s)").disabled).toBe(true);
    }, 15000);
});
