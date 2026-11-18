// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CharacterImages } from "../../src/ui/studio/CharacterImages";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

async function show(language?: "sv" | "nb", withProvider = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  if (language) localStorage.setItem("sandboxai:interface-language", language);
  const repo = new IndexedDBRepository(new IDBFactory(), `images-${language ?? "en"}`);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const images = (
    <CharacterImages characterId="c1" repo={repo} portrait="" onPortrait={async () => {}} />
  );
  await act(async () =>
    root.render(withProvider ? <LanguageProvider>{images}</LanguageProvider> : images),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  const archiveButton = () =>
    Array.from(host.querySelectorAll("button")).find((b) =>
      /archive|bildarkiv|bildearkiv/i.test(b.textContent ?? ""),
    )!;
  await act(async () => archiveButton().click());
  return {
    text: host.textContent ?? "",
    dialog: host.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("speaks English without a language provider and in the default language", async () => {
  for (const withProvider of [false, true]) {
    const view = await show(undefined, withProvider);
    try {
      expect(view.text).toContain("Show picture archive");
      expect(view.dialog).toBe("Picture archive");
      expect(view.text).toContain("Drag pictures to change their order");
      expect(view.text).toContain("No pictures yet");
      expect(view.text).not.toMatch(/bilder|bildarkiv|Dra /i);
    } finally {
      await view.close();
    }
  }
});

it("speaks Swedish when the interface language is Swedish", async () => {
  const view = await show("sv");
  try {
    expect(view.text).toContain("Visa bildarkiv");
    expect(view.dialog).toBe("Bildarkiv");
    expect(view.text).toContain("Inga bilder ännu");
    expect(view.text).not.toContain("Show picture archive");
  } finally {
    await view.close();
  }
});

it("speaks Norwegian when the interface language is Norwegian", async () => {
  const view = await show("nb");
  try {
    expect(view.text).toContain("Vis bildearkiv");
    expect(view.dialog).toBe("Bildearkiv");
    expect(view.text).toContain("Ingen bilder ennå");
  } finally {
    await view.close();
  }
});
