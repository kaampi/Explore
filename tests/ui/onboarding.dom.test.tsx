// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/ui/App";

let root: Root;
let container: HTMLDivElement;
let online: boolean;
let completionCalls: number;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function button(label: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
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
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error(
        `UI did not settle: ${container.textContent?.slice(-1000)}`,
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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
  online = false;
  completionCalls = 0;
  fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
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
    if (!online) throw new Error("Connection refused");
    if (address.endsWith("/api/tags"))
      return Response.json({ models: [{ name: "chat-a" }] });
    if (address.endsWith("/api/show"))
      return Response.json({ capabilities: ["completion"] });
    if (address.endsWith("/api/chat")) {
      completionCalls += 1;
      const text =
        completionCalls === 1 ? 'Ari smiles. "Welcome to the map room."' : "[]";
      return new Response(
        JSON.stringify({ message: { content: text }, done: false }) +
          "\n" +
          JSON.stringify({ done: true }) +
          "\n",
        { headers: { "content-type": "application/x-ndjson" } },
      );
    }
    throw new Error(`Unexpected request: ${address}`);
  });
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("first-run conversation flow", () => {
  it("takes a new user from a name to the first streamed reply without opening model settings", async () => {
    online = true;
    await mount();
    await click(button("Create your first character ＋"));
    await input(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="What are they called?"]',
      )!,
      "Ari",
    );
    await click(button("Create & chat →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".sb-play-connection")).toBeNull();
    await input(
      container.querySelector<HTMLInputElement>('[aria-label="Your message"]')!,
      "Hello Ari.",
    );
    await click(button("Send"));
    await waitFor(
      () =>
        !!container
          .querySelector(".message--character .message__body")
          ?.textContent?.includes("Welcome to the map room."),
    );
    await waitFor(() => !container.querySelector(".message--streaming"));
    expect(container.querySelectorAll(".message--player")).toHaveLength(1);
    expect(container.querySelectorAll(".message--character")).toHaveLength(1);
    expect(container.querySelector("dialog")).toBeNull();
    const chats = fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/chat"),
    );
    expect(chats.length).toBeGreaterThan(0);
    expect(
      chats.every(
        ([, init]) => JSON.parse(String(init?.body)).model === "chat-a",
      ),
    ).toBe(true);
  });

  it("keeps an offline draft and never sends it while reconnecting or choosing a model", async () => {
    await mount();
    await click(button("Create your first character ＋"));
    const name = container.querySelector<HTMLInputElement>(
      'input[placeholder="What are they called?"]',
    )!;
    await input(name, "Ari");
    await click(button("Create & chat →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    const composer = container.querySelector<HTMLInputElement>(
      '[aria-label="Your message"]',
    )!;
    await input(composer, "Tell me about your maps.");
    expect(button("Send").disabled).toBe(true);
    await act(async () => {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(composer.value).toBe("Tell me about your maps.");
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/api/chat")),
    ).toBe(false);
    online = true;
    await click(
      container.querySelector<HTMLButtonElement>(".sb-play-connection button")!,
    );
    await click(button("Try again"));
    await waitFor(
      () => !!container.querySelector('select[aria-label="Chat model"]'),
    );
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>(
        'select[aria-label="Chat model"]',
      )!;
      select.value = "chat-a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => !button("Send").disabled);
    await click(button("Back to the conversation"));
    expect(composer.value).toBe("Tell me about your maps.");
    expect(localStorage.getItem("sandboxai-preferred-model")).toBe("chat-a");
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/api/chat")),
    ).toBe(false);
  });
  it("preserves a missing saved model until the user explicitly chooses another", async () => {
    online = true;
    localStorage.setItem("sandboxai-preferred-model", "my-custom-model");
    await mount();
    await click(button("Set up AI"));
    expect(container.textContent).toContain("my-custom-model");
    expect(localStorage.getItem("sandboxai-preferred-model")).toBe(
      "my-custom-model",
    );
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Chat model"]',
    )!;
    expect(select.value).toBe("");
    await act(async () => {
      select.value = "chat-a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(localStorage.getItem("sandboxai-preferred-model")).toBe("chat-a");
    await click(button("Back to my space"));
    await click(button("Create your first character ＋"));
    await input(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="What are they called?"]',
      )!,
      "Elara",
    );
    await click(button("Create & chat →"));
    await waitFor(
      () => !!container.querySelector('[aria-label="Your message"]'),
    );
    expect(container.querySelector(".sb-play-connection")).toBeNull();
    expect(button("Send").disabled).toBe(true); // Empty draft, rather than a hidden connection requirement.
  });
});
