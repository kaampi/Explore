// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PeopleColumn } from "../../src/ui/play/PeopleColumn";
import { useStoredFlag } from "../../src/ui/play/useStoredFlag";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import type { PersonCard } from "../../src/ui/play/personCard";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
  localStorage.clear();
});

const PICTURE = "data:image/png;base64," + "A".repeat(40);
const edda: PersonCard = {
  id: "edda",
  name: "Edda",
  line: "Calm and watchful.",
  mood: "Tired but alert",
  portrait: PICTURE,
  initials: "E",
};
const tam: PersonCard = {
  id: "tam",
  name: "Old Tam",
  line: "",
  mood: "",
  portrait: undefined,
  initials: "OT",
};

async function render(cards: PersonCard[], statuses: Record<string, string> = {}) {
  const onSelect = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState(cards[0]?.id ?? "");
    const [collapsed, setCollapsed] = useStoredFlag("test-collapsed");
    return (
      <LanguageProvider>
        <PeopleColumn
          sceneName="The village square"
          backdrop={null}
          cards={cards}
          statuses={statuses}
          selectedId={selected}
          onSelect={(id) => {
            onSelect(id);
            setSelected(id);
          }}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
        />
      </LanguageProvider>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { host, onSelect };
}

it("shows the person in focus: portrait, name, a short line, and in italics how they seem", async () => {
  const { host } = await render([edda]);

  expect(host.querySelector(".play-person img.play-person__face")!.getAttribute("src")).toBe(
    PICTURE,
  );
  expect(host.querySelector(".play-person__name")!.textContent).toBe("Edda");
  expect(host.querySelector(".play-person__line")!.textContent).toBe("Calm and watchful.");
  expect(host.querySelector(".play-person__mood")!.textContent).toBe("Tired but alert");
  // One person: no tabs to choose between.
  expect(host.querySelector('[role="tablist"]')).toBeNull();
});

it("shows a monogram with the initials when there is no portrait, and nothing for a line nobody wrote", async () => {
  const { host } = await render([tam]);

  const face = host.querySelector(".play-person__monogram")!;
  expect(face.textContent).toBe("OT");
  expect(face.getAttribute("aria-hidden")).toBe("true");
  expect(host.querySelector("img.play-person__face")).toBeNull();
  expect(host.querySelector(".play-person__line")).toBeNull();
  expect(host.querySelector(".play-person__mood")).toBeNull();
});

it("has a tab for each person, and the one chosen is the one talked to", async () => {
  const { host, onSelect } = await render([edda, tam]);
  const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  expect(tabs().map((t) => t.textContent)).toEqual(["Edda", "Old Tam"]);
  expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
  expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
  await act(async () => tabs()[1]!.click());
  expect(onSelect).toHaveBeenCalledWith("tam");
  expect(host.querySelector(".play-person__name")!.textContent).toBe("Old Tam");
  expect(host.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe(
    "play-person-tab-tam",
  );
});

it("moves between the tabs with the arrow keys", async () => {
  const { host, onSelect } = await render([edda, tam]);
  const first = host.querySelector<HTMLButtonElement>('[role="tab"]')!;

  await act(async () => {
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(onSelect).toHaveBeenLastCalledWith("tam");
  await act(async () => {
    host
      .querySelectorAll('[role="tab"]')[1]!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(onSelect).toHaveBeenLastCalledWith("edda");
});

it("says what is wrong with someone who is not just standing there", async () => {
  const { host } = await render([edda], { edda: "Hostile" });

  expect(host.querySelector(".play-person__status")!.textContent).toBe("Hostile");
});

it("says so when nobody is here", async () => {
  const { host } = await render([]);

  expect(host.querySelector(".play-people__empty")!.textContent).toBe("Nobody is here.");
});

it("folds to a narrow strip with a small picture and a tab for each person, and unfolds again", async () => {
  const { host } = await render([edda, tam]);
  const toggle = () => host.querySelector<HTMLButtonElement>(".play-people__toggle")!;

  expect(toggle().textContent).toContain("Make the picture smaller");
  expect(toggle().getAttribute("aria-expanded")).toBe("true");
  await act(async () => toggle().click());

  expect(host.querySelector(".play-people--collapsed")).not.toBeNull();
  expect(host.querySelector(".play-view__scene--thumb")).not.toBeNull();
  expect(host.querySelector(".play-person")).toBeNull();
  const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  // In the strip a tab is a small face, named for a screen reader and as a tooltip.
  expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Edda", "Old Tam"]);
  expect(tabs.map((t) => t.title)).toEqual(["Edda", "Old Tam"]);
  // The card is not there in the strip, so the tabs point at nothing.
  expect(tabs.every((t) => !t.hasAttribute("aria-controls"))).toBe(true);
  expect(toggle().getAttribute("aria-expanded")).toBe("false");
  expect(toggle().textContent).toContain("Show the picture");

  await act(async () => toggle().click());
  expect(host.querySelector(".play-person")).not.toBeNull();
  expect(
    Array.from(host.querySelectorAll('[role="tab"]')).every(
      (t) => t.getAttribute("aria-controls") === "play-person-card",
    ),
  ).toBe(true);
});

it("remembers the fold in this browser, and starts folded when it was left folded", async () => {
  const first = await render([edda]);
  await act(async () =>
    first.host.querySelector<HTMLButtonElement>(".play-people__toggle")!.click(),
  );
  expect(localStorage.getItem("test-collapsed")).toBe("1");

  const second = await render([edda]);
  expect(second.host.querySelector(".play-people--collapsed")).not.toBeNull();
});

it("still works when the browser will not store anything", async () => {
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const { host } = await render([edda]);
  await act(async () => host.querySelector<HTMLButtonElement>(".play-people__toggle")!.click());

  expect(host.querySelector(".play-people--collapsed")).not.toBeNull();
  set.mockRestore();
  get.mockRestore();
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const { host } = await render([edda, tam]);

  expect(host.querySelector(".play-people__tabs")!.getAttribute("aria-label")).toBe(
    "Vem du talar med",
  );
  expect(host.querySelector(".play-people__toggle")!.textContent).toContain("Minska bildytan");
});
