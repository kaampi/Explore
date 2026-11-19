import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions, itemOrigin } from "../../src/game/AdventureEngine";
import { itemUses } from "../../src/game/catalog";
import { INITIAL_GAME_MINUTES } from "../../src/state/gameClock";
import { iconFor, isMagic, itemExtras, ITEM_ICONS } from "../../src/library/itemIcons";
import { newObjectTemplate } from "../../src/library/LibrarySchema";
import type { EncounterAction } from "../../src/game/EncounterSchema";

function inn() {
  const built = innVisitExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "item-info",
    [built.realm],
  );
  const engine = new StateEngine(structuredClone(session), new EventLog());
  const act = (action: EncounterAction) => {
    const s = engine.getSession();
    engine.executeEncounterAction({
      id: crypto.randomUUID(),
      expectedSceneId: s.sceneId!,
      expectedRevision: s.encounter!.state.revision,
      action,
    });
  };
  const go = (label: string) => {
    const s = engine.getSession();
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: adventureOptions(s).find((o) => o.label === label)!.id,
      expectedStateVersion: s.stateVersion,
    });
  };
  return { built, engine, act, go, first: session };
}

describe("itemUses", () => {
  it("tells which door a key opens, and which actions it is part of, in words", () => {
    const { engine, go, built } = inn();
    go("Enter the inn");
    const game = engine.getSession().encounter!;

    const uses = itemUses(game, "inn-brass-key");

    expect(uses).toContainEqual({ kind: "opens", text: "Store room door" });
    expect(uses.some((u) => u.kind === "action")).toBe(true);
    // Words only: no id of a door, an action or a flag.
    const text = JSON.stringify(uses);
    expect(text).not.toContain(built.storeDoorId);
    expect(text).not.toContain("take-key");
  });

  it("tells what has to be found out before a thing shows, as what was learned, and never as a flag", () => {
    const built = connectedAdventureExample();
    const session = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "needs",
      [built.realm],
      { characters: built.characters },
    );
    const game = session.encounter!;
    const ask = game.definition.interactions[0]!;
    const flag = ask.success.effects.find((e) => e.kind === "flag") as { flag: string };
    ask.success.learned = "Edda saw the messenger go north.";
    game.definition.items.push({
      id: "map",
      name: "Hidden map",
      description: "",
      requiresFlags: [flag.flag, "nobody-sets-this-flag"],
    });

    const uses = itemUses(game, "map");

    expect(uses).toEqual([{ kind: "needs", text: "Edda saw the messenger go north." }]);
    expect(JSON.stringify(uses)).not.toContain(flag.flag);
    expect(JSON.stringify(uses)).not.toContain("nobody-sets-this-flag");
  });

  it("is empty for a thing that opens nothing, needs nothing and is in no action", () => {
    const { engine } = inn();
    const game = structuredClone(engine.getSession().encounter!);
    game.definition.items.push({ id: "pebble", name: "Pebble", requiresFlags: [] });
    expect(itemUses(game, "pebble")).toEqual([]);
  });
});

describe("itemOrigin", () => {
  it("is where and when the player got a thing, and nothing before they had it", () => {
    const { engine, act, go, built } = inn();
    go("Enter the inn");
    const room = engine.getSession();
    expect(itemOrigin(room, "inn-brass-key")).toBeNull();

    act({ kind: "interaction", interactionId: "take-key" });
    const after = engine.getSession();
    const origin = itemOrigin(after, "inn-brass-key")!;

    expect(origin.place).toBe("Common room");
    expect(origin.minutes).toBeGreaterThanOrEqual(INITIAL_GAME_MINUTES);
    // It is still told after the player has gone on to another place.
    act({ kind: "interact", barrierId: built.storeDoorId, operation: "unlock" });
    act({ kind: "interact", barrierId: built.storeDoorId, operation: "open" });
    go("Go to store room");
    expect(itemOrigin(engine.getSession(), "inn-brass-key")).toEqual(origin);
  });

  it("is nothing for a thing with no history, such as one the player started with", () => {
    const { first } = inn();
    expect(itemOrigin(first, "inn-brass-key")).toBeNull();
    expect(itemOrigin(first, "something-else")).toBeNull();
    const withKey = structuredClone(first);
    withKey.encounter!.state.actors[withKey.encounter!.definition.playerId]!.inventory.push("x");
    expect(itemOrigin(withKey, "x")).toBeNull();
  });
});

describe("item icons", () => {
  it("take the one chosen, else one from the tags, else a neutral one", () => {
    expect(iconFor({ icon: "lantern" })).toBe("lantern");
    expect(iconFor({ icon: "not-an-icon", tags: ["key"] })).toBe("key");
    expect(iconFor({ tags: ["relic", "old"] })).toBe("ring");
    expect(iconFor({ tags: ["dagger"] })).toBe("dagger");
    expect(iconFor({ tags: ["unrelated"] })).toBe("generic");
    expect(iconFor({})).toBe("generic");
    expect(ITEM_ICONS).toContain("generic");
  });

  it("know a magical thing by the tag magic", () => {
    expect(isMagic({ tags: ["relic", "Magic"] })).toBe(true);
    expect(isMagic({ tags: ["magical-ish"] })).toBe(false);
    expect(isMagic({})).toBe(false);
  });

  it("go from a library thing into the item of a scene, and an old thing has neither", () => {
    const object = newObjectTemplate({
      name: "Brass key",
      note: "",
      tags: ["key", "magic"],
      source: "player",
      icon: "key",
    });
    expect(itemExtras(object)).toEqual({ icon: "key", tags: ["key", "magic"] });
    const plain = newObjectTemplate({ name: "Pebble", note: "", tags: [], source: "player" });
    expect(itemExtras(plain)).toEqual({});
  });
});
