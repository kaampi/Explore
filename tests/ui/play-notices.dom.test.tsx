// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ARRIVAL_MS,
  NOTICE_MS,
  PlayArrival,
  PlayNoticeStrip,
  useNotices,
} from "../../src/ui/play/PlayNotices";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import type { Session } from "../../src/state/StateSchema";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = "";
});

function engineGame(minutes?: number) {
  const built = connectedAdventureExample();
  const start = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "notices",
    [built.realm],
    { characters: built.characters },
  );
  if (minutes) for (const link of start.adventure!.links) link.minutes = minutes;
  const engine = new StateEngine(structuredClone(start), new EventLog());
  const ask = () => {
    const s = engine.getSession();
    engine.executeEncounterAction(
      {
        id: `ask-${s.stateVersion}`,
        expectedRevision: s.encounter!.state.revision,
        expectedSceneId: s.encounter!.definition.id,
        action: { kind: "interaction", interactionId: s.encounter!.definition.interactions[0]!.id },
      },
      () => 0.34,
    );
  };
  const travel = () => {
    const s = engine.getSession();
    engine.transitionAdventure({
      id: `go-${s.stateVersion}`,
      linkId: adventureOptions(s)[0]!.id,
      expectedStateVersion: s.stateVersion,
    });
  };
  return { engine, ask, travel, first: engine.getSession() };
}

/** The play view's two places for marks: the arrival over the story, the strip above the field. */
function Marks({ session }: { session: Session }) {
  const marks = useNotices(session);
  return (
    <>
      <div className="story">
        <PlayArrival arrival={marks.arrival} />
      </div>
      <div className="composer">
        <PlayNoticeStrip notices={marks.notices} />
      </div>
    </>
  );
}

async function mount(session: Session) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const draw = (next: Session) =>
    act(async () =>
      root.render(
        <LanguageProvider>
          <Marks session={next} />
        </LanguageProvider>,
      ),
    );
  await draw(session);
  return { host, draw };
}

it("shows nothing when the game is first shown, and has a polite live region", async () => {
  const { first } = engineGame();
  const { host } = await mount(first);
  expect(host.querySelector(".play-notice")).toBeNull();
  expect(host.querySelector(".play-arrival")).toBeNull();
  expect(host.querySelector(".play-notices")!.getAttribute("aria-live")).toBe("polite");
  expect(host.querySelector(".play-arrival-layer")!.getAttribute("aria-live")).toBe("polite");
});

it("marks a discovery for about three seconds and then takes it away", async () => {
  const { first, ask, engine } = engineGame();
  const { host, draw } = await mount(first);
  ask();
  await draw(engine.getSession());

  const notice = host.querySelector(".play-notice");
  expect(notice?.textContent).toBe("You found out: Edda points to the north path.");
  await act(async () => vi.advanceTimersByTimeAsync(NOTICE_MS - 100));
  expect(host.querySelector(".play-notice")).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(host.querySelector(".play-notice")).toBeNull();
});

it("keeps the marks out of the story: they are in the strip above the field, not over the lines", async () => {
  const { first, ask, engine } = engineGame();
  const { host, draw } = await mount(first);
  ask();
  await draw(engine.getSession());
  expect(host.querySelector(".composer .play-notice")).not.toBeNull();
  expect(host.querySelector(".story .play-notice")).toBeNull();
  const css = readFileSync("src/ui/play/play-view.css", "utf8");
  const strip = css.slice(css.indexOf(".play-notices {"), css.indexOf(".play-notices:empty"));
  expect(strip).not.toContain("position: absolute");
});

it("does not show the same mark again when the game is drawn again", async () => {
  const { first, ask, engine } = engineGame();
  const { host, draw } = await mount(first);
  ask();
  const after = engine.getSession();
  await draw(after);
  await act(async () => vi.advanceTimersByTimeAsync(NOTICE_MS + 100));
  await draw(structuredClone(after));
  expect(host.querySelector(".play-notice")).toBeNull();
});

it("shows where you came to, with the time it took, for about a second", async () => {
  const { first, ask, travel, engine } = engineGame(20);
  const { host, draw } = await mount(first);
  ask();
  await draw(engine.getSession());
  travel();
  const after = engine.getSession();
  await draw(after);

  const arrival = host.querySelector(".play-arrival")!;
  const place = after.adventure!.scenes.find((s) => s.id === after.adventure!.currentSceneId)!.name;
  expect(arrival.querySelector("strong")!.textContent).toBe(place);
  expect(arrival.querySelector("small")?.textContent).toBe("20 min later");
  await act(async () => vi.advanceTimersByTimeAsync(ARRIVAL_MS + 50));
  expect(host.querySelector(".play-arrival")).toBeNull();
  expect(ARRIVAL_MS).toBeLessThanOrEqual(1200);
});

it("shows only the place when the way took no time", async () => {
  const { first, ask, travel, engine } = engineGame();
  const { host, draw } = await mount(first);
  ask();
  await draw(engine.getSession());
  travel();
  await draw(engine.getSession());
  expect(host.querySelector(".play-arrival strong")).not.toBeNull();
  expect(host.querySelector(".play-arrival small")).toBeNull();
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const { first, ask, engine } = engineGame();
  const { host, draw } = await mount(first);
  ask();
  await draw(engine.getSession());
  expect(host.querySelector(".play-notice span")!.textContent).toBe("Du fick veta:");
});

it("turns every movement off when the system asks for less motion", () => {
  const css = readFileSync("src/ui/play/play-view.css", "utf8");
  const reduced = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce) {\n  .play-arrival"),
  );
  expect(reduced).toContain(".play-arrival");
  expect(reduced).toContain(".play-notice");
  expect(reduced).toContain("animation: none");
});
