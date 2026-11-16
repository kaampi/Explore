// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { ObjectStudio } from "../../src/ui/studio/ObjectStudio";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "object-studio-weapon");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ObjectStudio repo={repo} />));
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

it("saves a thing as a weapon and reads it back", async () => {
  const ui = await mount();
  try {
    await act(async () => button(ui.host, "Create new").click());
    await type(
      ui.host.querySelector<HTMLInputElement>('input[aria-label="Object name"]')!,
      "Short sword",
    );
    const weaponBox = Array.from(
      ui.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((box) => box.parentElement?.textContent?.includes("Can be used as a weapon"))!;
    await act(async () => weaponBox.click());
    expect(weaponBox.checked).toBe(true);
    await type(ui.host.querySelector<HTMLInputElement>('input[aria-label="Weapon damage"]')!, "5");
    await act(async () => button(ui.host, "Save").click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const saved = (await ui.repo.listObjects()).find((object) => object.name === "Short sword");
    expect(saved?.weapon).toMatchObject({ skill: "Melee", kind: "melee", damage: 5 });
  } finally {
    await ui.close();
  }
});

it("refuses damage that is not a whole number and says why", async () => {
  const ui = await mount();
  try {
    await act(async () => button(ui.host, "Create new").click());
    await type(
      ui.host.querySelector<HTMLInputElement>('input[aria-label="Object name"]')!,
      "Odd blade",
    );
    const weaponBox = Array.from(
      ui.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((box) => box.parentElement?.textContent?.includes("Can be used as a weapon"))!;
    await act(async () => weaponBox.click());
    await type(
      ui.host.querySelector<HTMLInputElement>('input[aria-label="Weapon damage"]')!,
      "2.5",
    );
    await act(async () => button(ui.host, "Save").click());
    expect(ui.host.textContent).toContain("Weapon damage is a whole number from 0 to 50");
    expect((await ui.repo.listObjects()).some((object) => object.name === "Odd blade")).toBe(false);
  } finally {
    await ui.close();
  }
});
