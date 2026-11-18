// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { RulesetStudio } from "../../src/ui/studio/RulesetStudio";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

async function mount(language: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  try {
    localStorage.setItem("sandboxai:interface-language", language);
  } catch {
    /* not needed in English */
  }
  const repo = new IndexedDBRepository(new IDBFactory(), `ruleset-examples-${language}`);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <LanguageProvider>
        <RulesetStudio repo={repo} />
      </LanguageProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("lists the genre rule-sets with their pictures", async () => {
  const ui = await mount("en");
  try {
    const names = Array.from(ui.host.querySelectorAll(".studio-list__name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "Classic fantasy",
        "Sci-fi",
        "Noir",
        "Horror",
        "Cozy",
        "Romance",
        "Reality",
      ]),
    );
    const pictures = Array.from(ui.host.querySelectorAll("img.studio-list__thumb")).map((i) =>
      i.getAttribute("src"),
    );
    expect(pictures).toEqual(
      expect.arrayContaining([
        "/rulesets/fantasy.webp",
        "/rulesets/scifi.webp",
        "/rulesets/noir.webp",
        "/rulesets/horror.webp",
        "/rulesets/reality.webp",
      ]),
    );
  } finally {
    await ui.close();
  }
});

it("shows the rule-sets in Swedish when the interface is Swedish", async () => {
  const ui = await mount("sv");
  try {
    const names = Array.from(ui.host.querySelectorAll(".studio-list__name")).map(
      (n) => n.textContent,
    );
    expect(names).toEqual(
      expect.arrayContaining(["Skräck", "Mysig", "Romantik", "Verkligheten", "Förtroende"]),
    );
    expect(names).not.toContain("Horror");
  } finally {
    await ui.close();
  }
});
