import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startWorldExploration } from "../../src/session/worldStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { parseSession, type Session } from "../../src/state/StateSchema";
import { adventureOptions } from "../../src/game/AdventureEngine";
import {
  emptyCampaignPlayer,
  newCharacterTemplate,
  newObjectTemplate,
} from "../../src/library/LibrarySchema";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import type { EncounterAction } from "../../src/game/EncounterSchema";

function setup() {
  const inn = innVisitExample();
  const world = structuredClone(inn.realm);
  const common = world.worldMap!.nodes.find((n) => n.name === "Common room")!;
  const edda = newCharacterTemplate({ name: "Edda" });
  common.characterIds = [edda.id];
  const coin = newObjectTemplate({
    name: "Copper coin",
    note: "Worn smooth.",
    tags: [],
    source: "player",
    startingLocation: { kind: "place", placeId: common.placeId ?? common.id },
  });
  const library = { characters: [edda], objects: [coin], places: [], rulesets: [] };
  const begin = (id: string) =>
    startWorldExploration(
      world,
      library,
      { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: common.id },
      id,
    ).session;
  return { world, edda, coin, library, begin };
}

const engineOf = (session: Session) => new StateEngine(session, new EventLog());
function act(engine: StateEngine, action: EncounterAction) {
  const s = engine.getSession();
  engine.executeEncounterAction(
    {
      id: crypto.randomUUID(),
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.sceneId!,
      action,
    },
    () => {
      throw new Error("No dice needed.");
    },
  );
}
function travel(engine: StateEngine, label: string) {
  const s = engine.getSession();
  const link = adventureOptions(s).find((l) => l.label === label);
  expect(link, label).toBeDefined();
  engine.transitionAdventure({
    id: crypto.randomUUID(),
    linkId: link!.id,
    expectedStateVersion: s.stateVersion,
  });
}

describe("a place remembers what happened there", () => {
  it("keeps the person, the missing thing and the open door after leaving, saving and coming back", async () => {
    const { world, edda, coin, library, begin } = setup();
    const worldBefore = JSON.stringify(world);
    const libraryBefore = JSON.stringify(library);
    let engine = engineOf(begin("visit-a"));
    const room = engine.getSession().encounter!;
    const eddaId = `npc:${edda.id}`;
    expect(room.state.actors[eddaId]).toBeDefined();
    expect(room.state.itemLocations[coin.id]).toBeDefined();
    const door = Object.values(room.state.barriers).find((b) => b.name === "Kitchen door")!;

    act(engine, {
      kind: "interaction",
      interactionId: room.definition.interactions.find((i) => i.label === "Take Copper coin")!.id,
    });
    act(engine, { kind: "interact", operation: "open", barrierId: door.id });
    const eddaBefore = structuredClone(engine.getSession().encounter!.state.actors[eddaId]);
    travel(engine, "Go to Kitchen");

    const repo = new IndexedDBRepository(new IDBFactory(), "world-revisit");
    await repo.saveSession(engine.getSession());
    engine = engineOf(parseSession(await repo.loadSession(engine.getSession().id)));
    travel(engine, "Go to Common room");

    const back = engine.getSession().encounter!;
    expect(back.state.actors[eddaId]).toEqual(eddaBefore);
    expect(back.state.itemLocations[coin.id]).toBeUndefined();
    expect(back.state.actors.player!.inventory).toContain(coin.id);
    expect(back.state.barriers[door.id]).toMatchObject({ open: true, locked: false });
    expect(JSON.stringify(world)).toBe(worldBefore);
    expect(JSON.stringify(library)).toBe(libraryBefore);
  });

  it("leaves another game in the same world untouched", () => {
    const { coin, begin } = setup();
    const first = engineOf(begin("visit-a"));
    act(first, {
      kind: "interaction",
      interactionId: first
        .getSession()
        .encounter!.definition.interactions.find((i) => i.label === "Take Copper coin")!.id,
    });

    const second = begin("visit-b").encounter!;

    expect(second.state.itemLocations[coin.id]).toBeDefined();
    expect(second.state.actors.player!.inventory).not.toContain(coin.id);
    expect(Object.values(second.state.barriers).every((b) => !b.open)).toBe(true);
  });
});
