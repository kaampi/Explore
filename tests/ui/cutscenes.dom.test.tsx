// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EventLog } from "../../src/events/EventLog";
import { captureIdea } from "../../src/ideas/IdeaSchema";
import { StateEngine } from "../../src/state/StateEngine";
import { EncounterPanel } from "../../src/ui/components/EncounterPanel";
import { Journal } from "../../src/ui/play/Journal";
import type { EngineContextValue } from "../../src/ui/EngineStore";
import { cutsceneAdventure } from "../fixtures/cutscenes";

let context: Partial<EngineContextValue>;
vi.mock("../../src/ui/EngineStore", () => ({ useEngine: () => context }));

const image = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const fixture = cutsceneAdventure();
  const intro = fixture.campaign.cutscenes.find(({ id }) => id === "intro")!;
  intro.imageDataUrl = image;
  fixture.campaign.storyFlags.push(fixture.lead);
  const engine = new StateEngine(fixture.start(), new EventLog());
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSaveIdea = vi.fn((turns: number[]) =>
    captureIdea(engine.getSession(), turns, fixture.campaign.name),
  );
  function Harness() {
    const [session, setSession] = useState(engine.getSession());
    const [journal, setJournal] = useState(false);
    context = {
      useSession: () => session,
      transitionAdventure: async (request) => {
        engine.transitionAdventure(request);
        setSession(engine.getSession());
      },
      finishCutscene: async (id) => {
        engine.finishCutscene(id);
        setSession(engine.getSession());
      },
    };
    return (
      <>
        <EncounterPanel
          backdrop={<img src={image} alt="" data-scene-image />}
          onJournal={() => setJournal(true)}
          onSaveIdea={onSaveIdea}
        />
        {journal && (
          <Journal session={session} onForget={() => {}} onClose={() => setJournal(false)} />
        )}
      </>
    );
  }
  const button = (text: string, parent: HTMLElement = host) => {
    const found = Array.from(parent.querySelectorAll("button")).find((b) => b.textContent === text);
    expect(found, text).toBeDefined();
    return found!;
  };
  return {
    host,
    engine,
    onSaveIdea,
    button,
    key: (key: string) =>
      act(async () =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        ),
      ),
    click: (target: HTMLButtonElement) => act(async () => target.click()),
    cutscene: () => host.querySelector<HTMLElement>(".play-view__center .play-cutscene")!,
    render: () => act(async () => root.render(<Harness />)),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("replaces the composer, reads paragraphs with the keyboard and keeps the whole story and idea", async () => {
  const ui = mount();
  try {
    await ui.render();
    const leftImage = ui.host.querySelector("[data-scene-image]");
    const cutscene = ui.cutscene();
    const heading = cutscene.querySelector("h2");
    expect(cutscene.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(document.activeElement).toBe(cutscene);
    expect(cutscene.querySelector("img")?.getAttribute("src")).toBe(image);
    expect(ui.host.querySelector("#play-do")).toBeNull();
    expect(ui.host.querySelector<HTMLButtonElement>(".play-scene__way")?.disabled).toBe(true);
    const paragraph = cutscene.querySelector("[aria-live=polite]");
    expect(paragraph?.textContent).toBe("The roofs are still wet.");
    const start = ui.engine.getSession();
    await ui.key("Escape");
    expect(paragraph?.textContent).toBe("The roofs are still wet.");
    await ui.key("Enter");
    expect(paragraph?.textContent).toBe("A light comes on by the well.");
    expect(ui.button("Continue the game")).toBeDefined();
    expect(ui.engine.getSession()).toEqual(start);
    await ui.key(" ");
    expect(ui.cutscene()).toBeNull();
    expect(document.activeElement?.id).toBe("play-do");
    expect(ui.host.querySelector("[data-scene-image]")).toBe(leftImage);
    const row = ui.host.querySelector<HTMLElement>(".play-row--cutscene")!;
    expect(row.firstElementChild?.matches(".orn-divider.play-row.play-row--divider")).toBe(true);
    expect(row.firstElementChild?.querySelector("h3")?.textContent).toBe(
      "A morning in the village",
    );
    expect(Array.from(row.querySelectorAll("p")).map((p) => p.textContent)).toEqual([
      "The roofs are still wet.",
      "A light comes on by the well.",
    ]);
    await ui.click(ui.button("Save idea", row));
    expect(ui.onSaveIdea.mock.results[0]?.value.source.excerpts[0]?.content).toBe(
      "The roofs are still wet.\n\nA light comes on by the well.",
    );
  } finally {
    await ui.close();
  }
});

it("keeps the journal openable and delays arrival until the entire cut-scene queue has finished", async () => {
  const ui = mount();
  try {
    await ui.render();
    await ui.click(ui.button("Skip"));
    const way = ui.host.querySelector<HTMLButtonElement>(".play-scene__way")!;
    expect(way.disabled).toBe(false);
    await ui.click(way);
    expect(ui.cutscene().querySelector("h2")?.textContent).toBe("The road");
    expect(document.activeElement).toBe(ui.cutscene());
    expect(ui.host.querySelector(".play-arrival")).toBeNull();
    await ui.click(ui.button("Skip"));
    expect(ui.cutscene().querySelector("h2")?.textContent).toBe("The bells");
    expect(ui.host.querySelector(".play-arrival")).toBeNull();

    await ui.click(ui.button("See everything in the journal"));
    const seen = () =>
      Array.from(ui.host.querySelectorAll('section[aria-label="What happened"] li')).map(
        (item) => item.textContent,
      );
    expect(seen()).toEqual(["A morning in the village", "The road"]);
    const close = ui.host.querySelector<HTMLButtonElement>("dialog button")!;
    await ui.click(close);

    await ui.click(ui.button("Continue the game"));
    await ui.click(ui.button("Continue the game"));
    expect(ui.cutscene().querySelector("h2")?.textContent).toBe("The wind");
    expect(ui.host.querySelector(".play-arrival")).toBeNull();
    await ui.click(ui.button("Continue the game"));
    expect(ui.host.querySelector(".play-arrival")?.textContent).toContain(
      "A note at the watchtower",
    );
    expect(ui.host.querySelector(".play-arrival")?.textContent).toContain("35 min");
    const log = ui.host.querySelector('[role="log"]')!;
    const travel = log.querySelector(".play-row--cutscene")!;
    const arrival = log.querySelector(":scope > .play-row--divider")!;
    expect(travel.querySelector("h3")?.textContent).toBe("The road");
    expect(travel.nextElementSibling).toBe(arrival);
    expect(arrival.querySelector("time")?.textContent).toBe("Day 1 · 08:45");
    expect(arrival.nextElementSibling?.querySelector("h3")?.textContent).toBe("The bells");
    expect(document.activeElement?.id).toBe("play-do");
    await ui.click(ui.button("Earlier events"));
    const earlierRows = Array.from(log.children);
    const earlierTravel = earlierRows.findIndex(
      (row) => row.querySelector("h3")?.textContent === "The road",
    );
    expect(earlierTravel).toBeGreaterThan(0);
    expect(earlierRows[earlierTravel + 1]?.textContent).toContain("A note at the watchtower");
    expect(
      earlierRows.filter((row) => row.querySelector("h3")?.textContent === "The road"),
    ).toHaveLength(1);
    await ui.click(ui.button("See everything in the journal"));
    expect(seen()).toEqual([
      "A morning in the village",
      "The road",
      "The bells",
      "The watchtower",
      "The wind",
    ]);
  } finally {
    await ui.close();
  }
});
