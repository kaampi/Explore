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
import { loadThemeLibrary } from "../../src/ui/themes/themeStorage";
import { captureIdea } from "../../src/ideas/IdeaSchema";

let root: Root, container: HTMLDivElement, reply: string;
function button(label: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (element) => (element.getAttribute("aria-label") || element.textContent?.trim()) === label,
  );
  if (!element)
    throw new Error(
      `Missing button: ${label} in ${container.textContent?.slice(-500)}`,
    );
  return element;
}
function named(label: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (element) => element.getAttribute("aria-label") === label,
  );
  if (!element) throw new Error(`Missing action: ${label}`);
  return element;
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error(
        `UI did not settle: ${container.textContent?.slice(-800)}`,
      );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}
async function mount() {
  await act(async () => {
    root.render(<App />);
  });
  await waitFor(
    () =>
      !!container.querySelector(".sb-home-connection") &&
      !container.textContent?.includes("Checking your local AI…"),
  );
}
async function create(name: string) {
  await click(
    button(
      container
        .querySelector(".sb-hero__content h2")
        ?.textContent?.includes("Every conversation")
        ? "Create your first character ＋"
        : "＋ Create",
    ),
  );
  await input(
    container.querySelector<HTMLInputElement>(
      'input[placeholder="What are they called?"]',
    )!,
    name,
  );
  await click(button("Create & chat →"));
  await waitFor(() => !!container.querySelector('[aria-label="Your message"]'));
}
async function send(text: string, answer: string) {
  reply = answer;
  await input(
    container.querySelector<HTMLInputElement>('[aria-label="Your message"]')!,
    text,
  );
  await click(button("Send"));
  await waitFor(
    () => !!container.querySelector(".chat-log")?.textContent?.includes(answer),
  );
  await waitFor(() => !container.querySelector(".message--streaming"));
}
async function home() {
  await click(button("Exit conversation"));
  await waitFor(() => !!container.querySelector(".sb-home-connection"));
}
async function theme(name: string) {
  await click(button("◐ Appearance"));
  await click(button(`Aa ✧${name}`));
  await click(button("Done"));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
    value() {},
  });
  reply = "A quiet hello.";
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
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
        return new Response(
          JSON.stringify({ message: { content: text }, done: false }) +
            "\n" +
            JSON.stringify({ done: true }) +
            "\n",
          { headers: { "content-type": "application/x-ndjson" } },
        );
      }
      throw new Error(`Unexpected request: ${address}`);
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("conversation library journeys", () => {
  it("confirms deletion by name, preserves on cancel/failure, and never restores the deleted active conversation", async () => {
    await mount(); await create("Ari");
    await send("A private note.", "Ari keeps it safe.");
    await theme("Forest dusk");
    await input(container.querySelector<HTMLInputElement>('[aria-label="Your message"]')!, "Unsent private draft");
    await home();
    await click(button("◷ My conversations"));
    await waitFor(() => !!container.querySelector(".sb-conversation-library"));
    const repo = new IndexedDBRepository();
    const id = (await repo.listSessionIds())[0]!;
    await click(named("Delete Conversation with Ari"));
    expect(container.querySelector("dialog")?.textContent).toContain("Conversation with Ari");
    expect(container.querySelector("dialog")?.textContent).toContain("cannot be undone");
    await click(button("Cancel"));
    expect(await repo.listSessionIds()).toEqual([id]);
    await click(named("Delete Conversation with Ari"));
    const remove = vi.spyOn(IndexedDBRepository.prototype, "deleteSession").mockRejectedValueOnce(new Error("Storage unavailable"));
    await click(button("Delete permanently"));
    await waitFor(() => container.querySelector("dialog")?.textContent?.includes("Storage unavailable") === true);
    expect(await repo.listSessionIds()).toEqual([id]);
    expect(sessionStorage.getItem(`sandboxai-draft:${id}`)).toBe("Unsent private draft");
    await click(button("Delete permanently"));
    await waitFor(() => container.querySelectorAll(".sb-conversation-card").length === 0 && !container.querySelector("dialog"));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(await repo.listSessionIds()).toEqual([]);
    expect(await repo.loadActiveConversationId()).toBeNull();
    expect(sessionStorage.getItem(`sandboxai-draft:${id}`)).toBeNull();
    await click(named("kaampi Explore home"));
    await waitFor(() => !!container.querySelector(".sb-home-connection"));
    expect(container.textContent).not.toContain("Continue exploring →");
    expect(await repo.listSessionIds()).toEqual([]);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect((await loadThemeLibrary())?.conversations).not.toHaveProperty(id);
    await act(async () => { root.unmount(); });
    root = createRoot(container); await mount();
    expect(container.textContent).not.toContain("Continue exploring →");
    expect(await repo.listSessionIds()).toEqual([]);
    await repo.close();
  }, 20000);

  it("deletes archived conversations while preserving the current conversation, library characters and captured ideas", async () => {
    await mount(); await create("Ari"); await send("A clue.", "Ari points to the map."); await home();
    const repo = new IndexedDBRepository();
    const deleted = (await repo.listSessionIds())[0]!;
    const original = await repo.loadSession(deleted);
    const idea = captureIdea(original, new Set([(original.conversation[0] as { turn: number }).turn]), "A saved clue");
    await repo.saveIdea(idea);
    await create("Elara"); await home();
    await click(button("◷ My conversations"));
    await waitFor(() => !!container.querySelector(".sb-conversation-library"));
    await click(named("Archive Conversation with Ari"));
    await waitFor(() => container.textContent?.includes("Archived (1)") === true);
    await click(button("Archived (1)"));
    await click(named("Delete Conversation with Ari"));
    await click(button("Delete permanently"));
    await waitFor(() => container.textContent?.includes("Archived (0)") === true);
    expect(await repo.listSessionIds()).toHaveLength(1);
    expect((await repo.listCharacters()).map(person => person.name).sort()).toEqual(["Ari", "Elara"]);
    expect((await repo.listIdeas()).entries[0]).toEqual(idea);
    await click(button("Conversations (1)"));
    await click(named("Continue Conversation with Elara"));
    await waitFor(() => !!container.querySelector('[aria-label="Your message"]'));
    expect((await repo.loadSession((await repo.listSessionIds())[0]!)).characters.elara?.name).toBe("Elara");
    await repo.close();
  }, 20000);

  it("keeps the old conversation when starting a new scene from Settings", async () => {
    await mount();
    await create("Ari");
    await send("Keep this scene.", "Ari closes the map case.");
    await click(button("Settings"));
    await click(button("new scene"));
    await waitFor(() => !!container.querySelector(".studio-adventure"));
    const repo = new IndexedDBRepository();
    expect(await repo.listSessionIds()).toHaveLength(1);
    await repo.close();
    await click(named("kaampi Explore home"));
    await waitFor(() => !!container.querySelector(".sb-home-connection"));
    await click(button("Continue exploring →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".chat-log")?.textContent).toContain(
      "Ari closes the map case.",
    );
  }, 15000);
  it("keeps runtime story flags in the conversation instead of changing its shared campaign", async () => {
    const repo = new IndexedDBRepository();
    await repo.saveCampaign(
      newCampaignTemplate({ id: "shared", name: "Shared world" }),
    );
    const saved = createSessionFromSetup(
      {
        location: "Map room",
        lighting: "soft",
        noise: "quiet",
        music: false,
        placeNote: "",
        campaignId: "shared",
        model: "chat-a",
        characters: [
          {
            name: "Ari",
            personality: "Curious",
            mood: "neutral",
            position: "here",
          },
        ],
      },
      "campaign-first",
    );
    saved.layers.push({
      id: "key",
      type: "state_trigger",
      priority: 0,
      content: "Ari finds a key.",
      trigger: "characters.ari.mood==neutral",
      once: true,
      active: true,
      aiGenerated: false,
      setsFlags: ["key-found"],
    });
    await repo.createConversation(saved);
    await mount();
    await click(button("Continue exploring →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    await send("What did you find?", "Ari holds up a key.");
    await home();
    expect((await repo.loadSession("campaign-first")).storyFlags).toContain(
      "key-found",
    );
    expect((await repo.loadCampaign("shared")).storyFlags).toEqual([]);
    await repo.close();
  }, 15000);

  it("keeps both conversations, their drafts and themes through switching, rename, archive and restore", async () => {
    await mount();
    await create("Ari");
    await send("The first map.", "Ari remembers the first map.");
    await theme("Forest dusk");
    await input(
      container.querySelector<HTMLInputElement>('[aria-label="Your message"]')!,
      "An Ari-only draft.",
    );
    await home();
    await create("Elara");
    await send("A second meeting.", "Elara talks about the sea.");
    await theme("Neon city");
    await home();
    await click(button("◷ My conversations"));
    await waitFor(() => !!container.querySelector(".sb-conversation-library"));
    expect(container.querySelectorAll(".sb-conversation-card")).toHaveLength(2);
    await click(named("Rename Conversation with Ari"));
    await input(
      container.querySelector<HTMLInputElement>("dialog input")!,
      "Maps with Ari",
    );
    await click(button("Save name"));
    await waitFor(() => !container.querySelector("dialog"));
    await click(named("Archive Conversation with Elara"));
    await waitFor(
      () => container.querySelectorAll(".sb-conversation-card").length === 1,
    );
    await click(named("Continue Maps with Ari"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".chat-log")?.textContent).toContain(
      "Ari remembers the first map.",
    );
    expect(container.querySelector(".chat-log")?.textContent).not.toContain(
      "Elara talks about the sea.",
    );
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Your message"]')
        ?.value,
    ).toBe("An Ari-only draft.");
    expect(
      container
        .querySelector<HTMLElement>(".sb-themed-play")
        ?.style.getPropertyValue("--play-background"),
    ).toBe("#172e29");
    await home();
    await click(button("◷ My conversations"));
    await waitFor(() => !!container.querySelector(".sb-conversation-library"));
    await click(button("Archived (1)"));
    await click(named("Restore Conversation with Elara"));
    await waitFor(
      () => container.textContent?.includes("Archived (0)") === true,
    );
    await click(button("Conversations (2)"));
    await click(named("Continue Conversation with Elara"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".chat-log")?.textContent).toContain(
      "Elara talks about the sea.",
    );
    expect(container.querySelector(".chat-log")?.textContent).not.toContain(
      "Ari remembers the first map.",
    );
    expect(
      container
        .querySelector<HTMLElement>(".sb-themed-play")
        ?.style.getPropertyValue("--play-background"),
    ).toBe("#151729");
    const repo = new IndexedDBRepository();
    expect(await repo.listSessionIds()).toHaveLength(2);
    await repo.close();
  }, 15000);
  it("restores the last selected conversation and its appearance after remounting", async () => {
    await mount();
    await create("Ari");
    await send("Remember this map.", "The map remains on the table.");
    await theme("Forest dusk");
    await home();
    await create("Elara");
    await home();
    expect(container.textContent).not.toContain("Pick up a conversation");
    expect(container.querySelectorAll(".sb-conversation-card")).toHaveLength(0);
    await click(button("◷ My conversations"));
    await waitFor(() => !!container.querySelector(".sb-conversation-library"));
    await click(named("Continue Conversation with Ari"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    await home();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mount();
    await click(button("Continue exploring →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".chat-log")?.textContent).toContain(
      "The map remains on the table.",
    );
    expect(
      container
        .querySelector<HTMLElement>(".sb-themed-play")
        ?.style.getPropertyValue("--play-background"),
    ).toBe("#172e29");
  }, 15000);
  it("keeps the current conversation when a new conversation cannot be saved", async () => {
    await mount();
    await create("Ari");
    await send("Keep this.", "Ari keeps the note.");
    await home();
    vi.spyOn(
      IndexedDBRepository.prototype,
      "createConversation",
    ).mockRejectedValueOnce(new Error("Storage is full."));
    await createAttempt();
    async function createAttempt() {
      await click(button("＋ Create"));
      await input(
        container.querySelector<HTMLInputElement>(
          'input[placeholder="What are they called?"]',
        )!,
        "Elara",
      );
      await click(button("Create & chat →"));
      await waitFor(
        () => container.textContent?.includes("Storage is full.") === true,
      );
    }
    const repo = new IndexedDBRepository();
    expect(await repo.listSessionIds()).toHaveLength(1);
    await repo.close();
    await click(button("Continue exploring →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".chat-log")?.textContent).toContain(
      "Ari keeps the note.",
    );
  }, 15000);
});
