// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Journal } from "../../src/ui/play/Journal";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import type { Session } from "../../src/state/StateSchema";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
});

function start(): Session {
  const built = connectedAdventureExample();
  return startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "journal",
    [built.realm],
    { characters: built.characters },
  );
}

/** The game after Edda has been asked, which teaches the player where to look. */
function afterAsking(): Session {
  const engine = new StateEngine(structuredClone(start()), new EventLog());
  const s = engine.getSession();
  engine.executeEncounterAction(
    {
      id: "ask",
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.encounter!.definition.id,
      action: { kind: "interaction", interactionId: s.encounter!.definition.interactions[0]!.id },
    },
    () => 0.34,
  );
  return engine.getSession();
}

async function render(session: Session) {
  const onForget = vi.fn();
  const onClose = vi.fn();
  await act(async () =>
    createRoot(document.body.appendChild(document.createElement("div"))).render(
      <LanguageProvider>
        <Journal session={session} onForget={onForget} onClose={onClose} />
      </LanguageProvider>,
    ),
  );
  mounted.push(async () => {
    document.body.innerHTML = "";
  });
  const part = (name: string) =>
    document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;
  return { onForget, onClose, part };
}

it("is a panel from the right with the six parts", async () => {
  const { part } = await render(start());
  expect(document.querySelector("dialog.sb-dialog--side")).not.toBeNull();
  expect(document.querySelector("dialog")!.getAttribute("aria-label")).toBe("Journal");
  for (const name of [
    "Goal",
    "What you know",
    "Pack",
    "People you have met",
    "Places you have been",
    "Remembered",
  ])
    expect(part(name), name).toBeTruthy();
});

it("shows the goal, with a tick when it is done", async () => {
  const session = start();
  const { part } = await render(session);
  expect(part("Goal").textContent).toContain(session.adventure!.goal!.title);
  expect(part("Goal").textContent).not.toContain("✓");
});

it("says there is nothing yet where there is nothing", async () => {
  const { part } = await render(start());
  expect(part("What you know").textContent).toContain("You have not found out anything yet.");
  expect(part("Remembered").textContent).toContain("Nothing yet.");
});

it("lists everything the player knows with the place, the people met and the places been to", async () => {
  const session = afterAsking();
  const { part } = await render(session);

  expect(part("What you know").textContent).toContain("Edda points to the north path.");
  expect(part("What you know").textContent).toContain("A missing messenger");
  expect(part("People you have met").textContent).toContain("Edda");
  expect(part("Places you have been").textContent).toContain("A missing messenger");
  expect(part("Pack").textContent).toContain("Brass key");
});

it("lists the lines kept with Remember this, by place, and forgets one on request", async () => {
  const session = start();
  const sceneId = session.adventure!.currentSceneId;
  session.adventure!.notes = { [sceneId]: ["It will rain by dusk.", "Edda trusts nobody."] };
  const { part, onForget } = await render(session);

  expect(part("Remembered").textContent).toContain("A missing messenger");
  expect(part("Remembered").textContent).toContain("It will rain by dusk.");
  const forget = part("Remembered").querySelectorAll<HTMLButtonElement>("button");
  expect(forget).toHaveLength(2);
  await act(async () => forget[1]!.click());
  expect(onForget).toHaveBeenCalledWith(sceneId, 1);
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  try {
    await render(start());
    expect(document.querySelector("dialog")!.getAttribute("aria-label")).toBe("Dagbok");
  } finally {
    localStorage.removeItem("sandboxai:interface-language");
  }
});
