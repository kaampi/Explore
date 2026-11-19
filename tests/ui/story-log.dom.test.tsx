// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StoryLog } from "../../src/ui/play/StoryLog";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import type { StoryRow } from "../../src/ui/play/storyRows";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
  localStorage.clear();
});

const rows: StoryRow[] = [
  { kind: "divider", key: "d", place: "The village square", minutes: 480, current: true },
  { kind: "narrator", key: "n", turn: 1, text: "A messenger has not returned." },
  { kind: "say", key: "s", turn: 2, text: "Where is he?" },
  { kind: "do", key: "o", turn: 3, label: "Force the stiff gate" },
  {
    kind: "check",
    key: "c",
    turn: 3,
    actor: "Traveller",
    skill: "Strength",
    roll: 34,
    target: 60,
    degree: "success",
  },
  {
    kind: "person",
    key: "p",
    turn: 4,
    name: "Edda",
    text: "North, by the path.",
    improvised: false,
  },
  {
    kind: "person",
    key: "i",
    turn: 5,
    name: "Edda",
    text: "It will not last.",
    improvised: true,
    sceneId: "square",
  },
];

async function render(props: Partial<Parameters<typeof StoryLog>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const shared = {
    rows,
    showTime: true,
    hasEarlier: false,
    earlier: false,
    onToggleEarlier: vi.fn(),
    canRemember: true,
    onRowMenu: vi.fn(),
    ...props,
  };
  await act(async () =>
    root.render(
      <LanguageProvider>
        <StoryLog {...shared} />
      </LanguageProvider>,
    ),
  );
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { host, ...shared };
}
const text = (host: HTMLElement, selector: string) =>
  Array.from(host.querySelectorAll(selector)).map((el) => el.textContent);

it("draws each kind of line in its own way: prose with no label, labels for you, a name for a person", async () => {
  const { host } = await render();

  expect(host.querySelector(".play-row--narrator .play-row__label")).toBeNull();
  expect(host.querySelector(".play-row--narrator")!.textContent).toContain(
    "A messenger has not returned.",
  );
  expect(text(host, ".play-row--say .play-row__label")).toEqual(["You · Talk"]);
  expect(host.querySelector(".play-row--say blockquote")!.textContent).toBe("“Where is he?”");
  expect(text(host, ".play-row--do .play-row__label")).toEqual(["You · Act"]);
  expect(host.querySelector(".play-row--do p")!.textContent).toBe("Force the stiff gate");
  expect(text(host, ".play-row--person .play-row__label")).toEqual(["Edda", "EddaImprovised"]);
  // A line that already has quotes does not get a second pair.
  const quotedLine = await render({
    rows: [
      { kind: "person", key: "q", turn: 9, name: "Edda", text: "“Hello.”", improvised: false },
    ],
  });
  expect(quotedLine.host.querySelector("blockquote")!.textContent).toBe("“Hello.”");
  // Nor does an answer that tells and quotes in the same breath.
  const mixed = await render({
    rows: [
      {
        kind: "person",
        key: "m",
        turn: 10,
        name: "Edda",
        text: "Edda points north. “Start there.”",
        improvised: false,
      },
    ],
  });
  expect(mixed.host.querySelector("blockquote")!.textContent).toBe(
    "Edda points north. “Start there.”",
  );
});

it("tells a roll in one row with the skill, the roll against the chance, and the outcome", async () => {
  const { host } = await render();

  const check = host.querySelector(".play-row--check")!;
  expect(check.textContent).toContain("Strength · 34 / 60 · Success");
});

it("puts the place and, when the adventure has travel times, the time on a divider", async () => {
  const withTime = await render();
  expect(withTime.host.querySelector(".play-row--divider")!.textContent).toBe(
    "The village squareDay 1 · 08:00",
  );
  const without = await render({ showTime: false });
  expect(without.host.querySelector(".play-row--divider")!.textContent).toBe("The village square");
});

it("has 'Save idea' on every line of speech, action and prose, and 'Remember this' only on an improvised one", async () => {
  const onSaveIdea = vi.fn(),
    onRemember = vi.fn();
  const { host } = await render({ onSaveIdea, onRemember });

  const save = Array.from(host.querySelectorAll<HTMLButtonElement>(".play-row__action")).filter(
    (b) => b.getAttribute("aria-label") === "Save this line as an idea",
  );
  expect(save).toHaveLength(5);
  await act(async () => save[1]!.click());
  expect(onSaveIdea).toHaveBeenCalledWith(2);
  const remember = Array.from(host.querySelectorAll<HTMLButtonElement>(".play-row__action")).filter(
    (b) => b.textContent === "Remember this",
  );
  expect(remember).toHaveLength(1);
  expect(remember[0]!.closest(".play-row")!.textContent).toContain("It will not last.");
  await act(async () => remember[0]!.click());
  expect(onRemember).toHaveBeenCalledWith(expect.objectContaining({ turn: 5, sceneId: "square" }));
});

it("shows no 'Save idea' without a place to keep it, and no 'Remember this' outside an adventure", async () => {
  const { host } = await render({ canRemember: false });

  expect(host.querySelector(".play-row__action")).toBeNull();
});

it("announces new lines politely, and each action can be reached with the keyboard", async () => {
  const { host } = await render({ onSaveIdea: vi.fn(), onRemember: vi.fn() });

  const log = host.querySelector(".play-story__log")!;
  expect(log.getAttribute("role")).toBe("log");
  expect(log.getAttribute("aria-live")).toBe("polite");
  // The actions are real buttons in the line, and focus shows them. Only the current line's can be tabbed to.
  const action = host.querySelectorAll<HTMLButtonElement>(".play-row__action");
  expect(action[0]!.tagName).toBe("BUTTON");
  expect(Array.from(action).filter((a) => a.tabIndex !== -1)).toHaveLength(2);
});

const tabStops = (host: HTMLElement) =>
  Array.from(
    host.querySelectorAll<HTMLElement>(".play-story__log [tabindex], .play-story__log button"),
  ).filter((el) => el.tabIndex >= 0);
const press = (el: Element, key: string) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });

it("is one stop on the tab key, however long the story is: the current line and its buttons", async () => {
  const many: StoryRow[] = Array.from({ length: 40 }, (_, i) => ({
    kind: "narrator" as const,
    key: `n${i}`,
    turn: i + 1,
    text: `Line ${i}`,
  }));
  const { host } = await render({ rows: many, onSaveIdea: vi.fn() });

  // The newest line is the one to land on: the line and its one button, not forty of each.
  const stops = tabStops(host);
  expect(stops).toHaveLength(2);
  expect(stops[0]!.dataset.rowKey).toBe("n39");
  expect(stops[1]!.classList.contains("play-row__action")).toBe(true);
  expect(stops[1]!.closest("[data-row-key]")!.getAttribute("data-row-key")).toBe("n39");
});

it("moves between the lines with the arrow keys, taking its tab stop and its buttons along", async () => {
  const { host } = await render({ onSaveIdea: vi.fn() });
  const row = (key: string) => host.querySelector<HTMLElement>(`[data-row-key="${key}"]`)!;
  const current = () => tabStops(host)[0]!.dataset.rowKey;

  expect(current()).toBe("i");
  row("i").focus();
  await press(row("i"), "ArrowUp");
  expect(current()).toBe("p");
  expect(document.activeElement).toBe(row("p"));
  // The buttons of the line now current are the ones to tab to.
  expect(
    tabStops(host).map((el) => el.closest("[data-row-key]")!.getAttribute("data-row-key")),
  ).toEqual(["p", "p"]);

  await press(row("p"), "Home");
  expect(current()).toBe("d");
  expect(document.activeElement).toBe(row("d"));
  await press(row("d"), "ArrowUp");
  expect(current()).toBe("d");
  await press(row("d"), "End");
  expect(current()).toBe("i");
  await press(row("i"), "ArrowDown");
  expect(current()).toBe("i");
  await press(row("i"), "ArrowUp");
  await press(row("p"), "ArrowDown");
  expect(current()).toBe("i");
});

it("lets the arrow keys be pressed on a line's button, and keeps other keys alone", async () => {
  const { host } = await render({ onSaveIdea: vi.fn() });
  const button = host.querySelector<HTMLButtonElement>('[data-row-key="i"] .play-row__action')!;
  button.focus();
  await press(button, "ArrowUp");
  expect(tabStops(host)[0]!.dataset.rowKey).toBe("p");
  const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
  await act(async () => {
    host.querySelector(".play-story__log")!.dispatchEvent(other);
  });
  expect(other.defaultPrevented).toBe(false);
});

it("offers the earlier events only when there are some, and says whether they are shown", async () => {
  const none = await render();
  expect(none.host.querySelector(".play-story__earlier")).toBeNull();
  const some = await render({ hasEarlier: true });
  const button = some.host.querySelector<HTMLButtonElement>(".play-story__earlier")!;
  expect(button.textContent).toBe("Earlier events");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  await act(async () => button.click());
  expect(some.onToggleEarlier).toHaveBeenCalledOnce();
  const shown = await render({ hasEarlier: true, earlier: true });
  expect(shown.host.querySelector(".play-story__earlier")!.getAttribute("aria-pressed")).toBe(
    "true",
  );
});

it("shows 'To latest' once the player has scrolled up, and takes them down again", async () => {
  const { host } = await render();
  const log = host.querySelector<HTMLElement>(".play-story__log")!;
  const scrollTo = vi.fn();
  Object.assign(log, { scrollTo });
  Object.defineProperty(log, "scrollHeight", { configurable: true, value: 2000 });
  Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
  expect(host.querySelector(".play-story__latest")).toBeNull();

  Object.defineProperty(log, "scrollTop", { configurable: true, value: 100 });
  await act(async () => {
    log.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const latest = host.querySelector<HTMLButtonElement>(".play-story__latest")!;
  expect(latest.textContent).toBe("↓ To latest");

  await act(async () => latest.click());
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 2000 }));
  expect(host.querySelector(".play-story__latest")).toBeNull();

  // Back at the bottom by hand: no button either.
  Object.defineProperty(log, "scrollTop", { configurable: true, value: 1590 });
  await act(async () => {
    log.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  expect(host.querySelector(".play-story__latest")).toBeNull();
});

it("shows a reply that is being written as a line that is not settled yet", async () => {
  const { host } = await render({ draftReply: "Edda squints at the" });

  const drafts = host.querySelectorAll(".play-row[aria-busy='true']");
  expect(drafts).toHaveLength(1);
  expect(drafts[0]!.textContent).toBe("Edda squints at the");
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const { host } = await render({ hasEarlier: true, onSaveIdea: vi.fn() });

  expect(text(host, ".play-row--say .play-row__label")).toEqual(["Du · Tala"]);
  expect(text(host, ".play-row--do .play-row__label")).toEqual(["Du · Agera"]);
  expect(host.querySelector(".play-story__head h2")!.textContent).toBe("Berättelsen");
  expect(host.querySelector(".play-story__earlier")!.textContent).toBe("Tidigare händelser");
  expect(host.querySelector(".play-row--check")!.textContent).toContain("Lyckat");
  expect(host.querySelector(".play-row__action")!.textContent).toBe("Spara idé");
});
