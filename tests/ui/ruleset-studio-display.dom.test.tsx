// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { RulesetStudio } from "../../src/ui/studio/RulesetStudio";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "ruleset-display");
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

const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function saveWith(display: string) {
  const ui = await mount();
  try {
    await act(async () => button(ui.host, "Create new").click());
    await typeInto(
      ui.host.querySelector<HTMLInputElement>('input[aria-label="Rule-set name"]')!,
      "Trust",
    );
    const nameField = Array.from(ui.host.querySelectorAll("label.setup-field"))
      .find((label) => label.firstChild?.textContent?.trim() === "Name")!
      .querySelector("input")!;
    await typeInto(nameField, "Trust");
    const select = Array.from(ui.host.querySelectorAll<HTMLSelectElement>("select")).find((el) =>
      Array.from(el.options).some((o) => o.value === "meter"),
    )!;
    expect(select).toBeTruthy();
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "",
      "meter",
      "skill",
      "hidden",
    ]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        display,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(ui.host, "Save").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    return (await ui.repo.listRulesets()).find((set) => set.name === "Trust")!.attributes[0]!;
  } finally {
    await ui.close();
  }
}

it("saves how a value is shown in play, when the author chose", async () => {
  expect((await saveWith("meter")).display).toBe("meter");
  expect((await saveWith("hidden")).display).toBe("hidden");
});

it("saves nothing about it when left on its own, so the value is decided by whether it moves", async () => {
  const saved = await saveWith("");
  expect(saved.display).toBeUndefined();
  expect(saved.maxShift).toBe(0);
});
