// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { RulesetStudio } from "../../src/ui/studio/RulesetStudio";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "ruleset-health");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<RulesetStudio repo={repo} />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    host,
    repo,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function type(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;

async function fill(host: HTMLElement, health: string) {
  await act(async () => button(host, "Create new").click());
  await type(
    host.querySelector<HTMLInputElement>('input[aria-label="Rule-set name"]')!,
    "Fighters",
  );
  const nameField = Array.from(host.querySelectorAll("label.setup-field"))
    .find((label) => label.firstChild?.textContent?.trim() === "Name")!
    .querySelector("input")!;
  await type(nameField, "Strength");
  await type(
    host.querySelector<HTMLInputElement>('input[aria-label="Player health in adventures"]')!,
    health,
  );
  await act(async () => button(host, "Save").click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

it("saves the player's health with the rule-set", async () => {
  const ui = await mount();
  try {
    await fill(ui.host, "60");
    const saved = (await ui.repo.listRulesets()).find((set) => set.name === "Fighters");
    expect(saved?.playerHealth).toBe(60);
  } finally {
    await ui.close();
  }
});

it("saves a rule-set with no health as before", async () => {
  const ui = await mount();
  try {
    await fill(ui.host, "");
    const saved = (await ui.repo.listRulesets()).find((set) => set.name === "Fighters");
    expect(saved).toBeTruthy();
    expect(saved?.playerHealth).toBeUndefined();
  } finally {
    await ui.close();
  }
});

it("refuses a health that is not a whole number from 1 to 200, and says why", async () => {
  const ui = await mount();
  try {
    await fill(ui.host, "500");
    expect(ui.host.textContent).toContain(
      "Player health is empty, or a whole number from 1 to 200",
    );
    expect((await ui.repo.listRulesets()).some((set) => set.name === "Fighters")).toBe(false);
  } finally {
    await ui.close();
  }
});
