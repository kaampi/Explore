// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerInventory } from "../../src/ui/components/PlayerInventory";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { OrnamentProvider } from "../../src/ui/play/ornament";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { gatehouseExample } from "../../src/scenarios/gatehouse";
import { loadingBayScenario } from "../../src/ui/home/encounterScenario";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import type { Session } from "../../src/state/StateSchema";
import type { EncounterAction } from "../../src/game/EncounterSchema";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

/** The inn, in the common room, after the key has been taken and the ledger is in the pack. */
function innGame() {
  const built = innVisitExample();
  const engine = new StateEngine(
    startPlayableCampaign(built.campaign, built.campaign.scenes[1]!, built.places, "card", [
      built.realm,
    ]),
    new EventLog(),
  );
  const act2 = (action: EncounterAction) => {
    const s = engine.getSession();
    engine.executeEncounterAction({
      id: crypto.randomUUID(),
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.sceneId!,
      action,
    });
  };
  return { built, engine, act2 };
}

async function mount(session: Session, node?: (children: ReactNode) => ReactNode, extra = {}) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const onAction = vi.fn();
  const onJournal = vi.fn();
  const wrap = node ?? ((children: ReactNode) => children);
  await act(async () =>
    root.render(
      <LanguageProvider>
        {wrap(
          <PlayerInventory
            session={session}
            onAction={onAction}
            onJournal={onJournal}
            announce={false}
            {...extra}
          />,
        )}
      </LanguageProvider>,
    ),
  );
  const click = async (label: string) => {
    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === label || b.textContent === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  };
  return { host, onAction, onJournal, click };
}
const dialog = () => document.querySelector("dialog")!;
const part = (name: string) => dialog().querySelector(`section[aria-label="${name}"]`);

it("opens a thing as a card: name and type, picture, description, what it does, where it was found, and what can be done", async () => {
  const { built, engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const session = structuredClone(engine.getSession());
  const { click } = await mount(session);
  await click("Inspect Brass key");

  const card = dialog().querySelector(".item-card")!;
  // The order of the parts is always the same.
  const order = Array.from(
    card.querySelectorAll(
      ".item-card__name, .item-card__type, .item-card__visual, .item-card__description, .item-card__part, .item-card__actions",
    ),
  ).map((el) => el.className.split(" ").find((c) => c.startsWith("item-card__")));
  expect(order).toEqual([
    "item-card__name",
    "item-card__type",
    "item-card__visual",
    "item-card__description",
    "item-card__part",
    "item-card__part",
    "item-card__actions",
  ]);
  expect(card.querySelector(".item-card__name")!.textContent).toBe("Brass key");
  expect(card.querySelector(".item-card__type")!.textContent).toBe("Thing");
  expect(card.querySelector(".item-card__visual svg")).not.toBeNull();
  expect(part("What it does")!.textContent).toContain("Opens Store room door");
  expect(part("Where it was found")!.textContent).toContain("Common room · Day 1");
  // The main button is the thing's own action; no id of a door or an action is shown.
  expect(card.querySelector(".item-card__actions .ui-button--primary")!.textContent).toBe(
    "Unlock · Store room door",
  );
  expect(dialog().textContent).not.toContain(built.storeDoorId);
  expect(dialog().textContent).not.toContain("take-key");
});

it("does the main action and closes, and keeps the others in a menu with Add to journal", async () => {
  const { engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const { click, onAction, onJournal } = await mount(engine.getSession());
  await click("Inspect Brass key");

  await act(async () =>
    dialog().querySelector<HTMLButtonElement>(".item-card__actions .ui-button--primary")!.click(),
  );
  expect(onAction).toHaveBeenCalledOnce();
  expect(document.querySelector("dialog")).toBeNull();

  // Another time: the menu has Add to journal.
  await click("Inspect Brass key");
  await act(async () => dialog().querySelector<HTMLButtonElement>(".item-card__more")!.click());
  const rows = Array.from(document.querySelectorAll('[role="menuitem"]')).map((r) => r.textContent);
  expect(rows).toContain("Add to journal");
  await act(async () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((r) => r.textContent === "Add to journal")!
      .click(),
  );
  expect(onJournal).toHaveBeenCalledWith(expect.stringContaining("Brass key"));
});

it("says magical in the line under the name, as a word, for a thing with the tag magic", async () => {
  const { engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const session = structuredClone(engine.getSession());
  const item = session.encounter!.definition.items.find((i) => i.id === "inn-brass-key")!;
  item.tags = ["key", "magic"];
  item.icon = "lantern";
  const { click } = await mount(session);
  await click("Inspect Brass key");
  expect(dialog().querySelector(".item-card__type")!.textContent).toBe("Thing · magical");
  expect(dialog().querySelector(".item-card__visual svg")!.getAttribute("data-icon")).toBe(
    "lantern",
  );
});

it("leaves out By the rules when the game has no rule-set values, and shows a weapon's values when it has", async () => {
  const { engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const session = structuredClone(engine.getSession());
  session.encounter!.state.actors[session.encounter!.definition.playerId]!.weapons.push("knife");
  session.encounter!.definition.weapons.push({
    id: "knife",
    name: "Knife",
    skill: "Melee",
    kind: "melee",
    damage: 3,
    usesAmmunition: false,
  });
  session.encounter!.definition.rules.attributes = [];
  const without = await mount(session);
  await without.click("Inspect Knife");
  expect(part("According to the rules")).toBeNull();
  await act(async () => dialog().querySelector<HTMLButtonElement>(".item-card__close")!.click());

  session.encounter!.definition.rules.attributes = [
    { id: "Melee", name: "Melee", min: 0, max: 100 },
  ];
  document.body.innerHTML = "";
  const withRules = await mount(session);
  await withRules.click("Inspect Knife");
  expect(part("According to the rules")!.textContent).toContain("Base damage3");
});

it("opens a thing with something to read as a note, and puts it under Notes in the pack (Data in the hull set)", async () => {
  const { built, engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  act2({ kind: "interact", barrierId: built.storeDoorId, operation: "unlock" });
  act2({ kind: "interact", barrierId: built.storeDoorId, operation: "open" });
  const s = engine.getSession();
  engine.transitionAdventure({
    id: "go",
    linkId: adventureOptions(s).find((o) => o.label === "Go to store room")!.id,
    expectedStateVersion: s.stateVersion,
  });
  act2({ kind: "interaction", interactionId: "take-ledger" });
  const session = structuredClone(engine.getSession());

  const forged = await mount(session, (children) => (
    <OrnamentProvider theme={{ ornament: "forged" }}>{children}</OrnamentProvider>
  ));
  const tabs = Array.from(forged.host.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
  expect(tabs).toEqual(["Things", "Notes 1"]);
  await forged.click("Notes 1");
  await forged.click("Inspect Guest ledger");
  expect(dialog().querySelector(".item-card--note .orn-note")!.textContent).toContain(
    "pencilled note",
  );
  expect(dialog().querySelector(".item-card__visual")).toBeNull();

  document.body.innerHTML = "";
  const hull = await mount(session, (children) => (
    <OrnamentProvider theme={{ ornament: "hull" }}>{children}</OrnamentProvider>
  ));
  expect(Array.from(hull.host.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual([
    "Things",
    "Data 1",
  ]);
});

it("is a grid five across with empty compartments to the next full row, at least three rows", async () => {
  const { engine, act2 } = innGame();
  const empty = await mount(engine.getSession());
  const slots = (host: HTMLElement) => host.querySelectorAll(".player-inventory__grid > li").length;
  expect(slots(empty.host)).toBe(15);

  document.body.innerHTML = "";
  act2({ kind: "interaction", interactionId: "take-key" });
  const session = structuredClone(engine.getSession());
  const player = session.encounter!.state.actors[session.encounter!.definition.playerId]!;
  for (let i = 0; i < 16; i++) {
    session.encounter!.definition.items.push({
      id: `stone-${i}`,
      name: `Stone ${i}`,
      requiresFlags: [],
    });
    player.inventory.push(`stone-${i}`);
  }
  const many = await mount(session);
  // Seventeen things: four rows of five and a few over make twenty, and then twenty-five.
  expect(slots(many.host)).toBe(20);
  expect(many.host.querySelectorAll(".player-inventory__empty-slot")).toHaveLength(3);
  expect(
    Array.from(many.host.querySelectorAll(".player-inventory__empty-slot")).every(
      (el) => el.getAttribute("aria-hidden") === "true",
    ),
  ).toBe(true);
});

it("opens the same menu by right click on a compartment as by its button", async () => {
  const { engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const { host } = await mount(engine.getSession());
  const slot = host.querySelector<HTMLElement>(".player-inventory__item")!;

  await act(async () => {
    slot.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
  });
  const byRightClick = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (r) => r.textContent,
  );
  expect(byRightClick[0]).toBe("Inspect Brass key");
  expect(byRightClick).toContain("Add to journal");
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  document.body.innerHTML = "";
  const again = await mount(engine.getSession());
  await act(async () =>
    again.host.querySelector<HTMLButtonElement>(".player-inventory__more")!.click(),
  );
  const byButton = Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (r) => r.textContent,
  );
  expect(byButton).toEqual(byRightClick);
});

it("tells weapons and resources by their type word", async () => {
  const depot = loadingBayScenario("pack-depot", "mock");
  const { click } = await mount(depot);
  const weapon = depot.encounter!.state.actors[depot.encounter!.definition.playerId]!.weapons[0];
  if (!weapon) return;
  const name = depot.encounter!.definition.weapons.find((w) => w.id === weapon)!.name;
  await click(`Inspect ${name}`);
  expect(dialog().querySelector(".item-card__type")!.textContent).toBe("Weapon");
});

it("is the dialog itself: no panel around it, one heading, no old Close button, and it closes with the cross and with Escape", async () => {
  const { engine, act2 } = innGame();
  act2({ kind: "interaction", interactionId: "take-key" });
  const { click } = await mount(engine.getSession());
  await click("Inspect Brass key");

  expect(dialog().classList.contains("sb-dialog--bare")).toBe(true);
  // The dialog has no heading or close button of its own: the card has them.
  expect(dialog().querySelector(".sb-dialog__heading")).toBeNull();
  expect(dialog().querySelector(".sb-dialog__actions")).toBeNull();
  expect(dialog().querySelectorAll("h2")).toHaveLength(0);
  expect(dialog().querySelectorAll(".item-card__name")).toHaveLength(1);
  expect(dialog().querySelector(".item-card__name")!.tagName).toBe("H3");
  expect(
    Array.from(dialog().querySelectorAll("button")).some((b) => b.textContent === "Close"),
  ).toBe(false);
  expect(dialog().getAttribute("aria-label")).toBe("Brass key");
  const cross = dialog().querySelector<HTMLButtonElement>(".item-card__close")!;
  expect(cross.getAttribute("aria-label")).toBe("Close dialog");

  await act(async () => cross.click());
  expect(document.querySelector("dialog")).toBeNull();

  // Escape asks the dialog to cancel, which closes it.
  await click("Inspect Brass key");
  await act(async () => {
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  expect(document.querySelector("dialog")).toBeNull();
});

it("shows a button for a thing the player carries that an action needs, such as a pick for a lock", async () => {
  const gate = gatehouseExample();
  const session = startPlayableCampaign(
    gate.campaign,
    gate.campaign.scenes[0]!,
    gate.places,
    "pick",
    [gate.realm],
    { characters: gate.characters, rulesets: [gate.rules] },
  );
  const { click } = await mount(session);
  await click("Inspect Lockpick");

  const main = dialog().querySelector(".item-card__actions .ui-button--primary");
  expect(main!.textContent).toBe("Pick the lock");
  expect(dialog().textContent).toContain("Part of: Pick the lock");
});
