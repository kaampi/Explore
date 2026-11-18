// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { PlayStartPaths } from "../../src/ui/home/PlayStartPaths";
import { ExploreWorldDialog } from "../../src/ui/home/ExploreWorldDialog";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { adventureMapPlaces } from "../../src/library/adventureMap";

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

async function show(element: React.ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const paths = (
  <PlayStartPaths
    onFree={() => {}}
    onStudio={() => {}}
    onPlayAdventure={() => {}}
    adventures={[
      { id: "a", name: "", scenes: 1 },
      { id: "b", name: "Hamnen", scenes: 4 },
    ]}
    disabled={false}
  />
);

it("shows the start paths in English without a language provider, as it always did", async () => {
  const ui = await show(paths);
  try {
    expect(ui.host.textContent).toContain("Free play");
    expect(ui.host.textContent).toContain("Untitled adventure");
    expect(ui.host.textContent).toContain("1 scene");
    expect(ui.host.textContent).toContain("4 scenes");
    expect(ui.host.querySelector('[aria-label="Choose how to begin"]')).toBeTruthy();
  } finally {
    await ui.close();
  }
});

it("shows them in Swedish and Norwegian when the language is chosen, with the counts filled in", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const sv = await show(<LanguageProvider>{paths}</LanguageProvider>);
  try {
    expect(sv.host.textContent).toContain("Fritt spel");
    expect(sv.host.textContent).toContain("Äventyr utan namn");
    expect(sv.host.textContent).toContain("1 scen");
    expect(sv.host.textContent).toContain("4 scener");
    expect(sv.host.textContent).not.toContain("Free play");
  } finally {
    await sv.close();
  }
  localStorage.setItem("sandboxai:interface-language", "nb");
  const nb = await show(<LanguageProvider>{paths}</LanguageProvider>);
  try {
    expect(nb.host.textContent).toContain("Fritt spill");
    expect(nb.host.textContent).toContain("Eventyr uten navn");
  } finally {
    await nb.close();
    localStorage.removeItem("sandboxai:interface-language");
  }
});

it("translates the dialog for exploring a world, name and all", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const inn = innVisitExample();
  const places = adventureMapPlaces(inn.realm, []).map((e) => e.place);
  const repo = new IndexedDBRepository(new IDBFactory(), "translated");
  const ui = await show(
    <LanguageProvider>
      <ExploreWorldDialog
        repo={repo}
        world={inn.realm}
        places={places}
        rulesets={[]}
        sessionId="s"
        onStart={vi.fn(async () => {})}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
  try {
    const text = ui.host.textContent ?? "";
    expect(text).toContain("Utforska Brookmere");
    expect(text).toContain("Ditt namn");
    expect(text).toContain("Börja vid");
    expect(text).toContain("Utforska den här världen →");
    expect(text).not.toContain("Your name");
  } finally {
    await ui.close();
    localStorage.removeItem("sandboxai:interface-language");
  }
});
