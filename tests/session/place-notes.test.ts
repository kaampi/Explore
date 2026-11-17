import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startWorldExploration } from "../../src/session/worldStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { parseSession } from "../../src/state/StateSchema";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { AdventureRunSchema } from "../../src/game/AdventureSchema";
import { emptyCampaignPlayer, newCharacterTemplate } from "../../src/library/LibrarySchema";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { noteFrom } from "../../src/ui/components/EncounterPanel";
import { estimateTokens } from "../../src/context/tokenEstimate";
import { ENCOUNTER_PROMPT_TOKEN_TARGET } from "../../src/session/encounterPrompt";

function game(narration?: { background: string; voice: string }) {
  const inn = innVisitExample();
  const world = structuredClone(inn.realm);
  const common = world.worldMap!.nodes.find((n) => n.name === "Common room")!;
  const edda = newCharacterTemplate({ name: "Edda" });
  common.characterIds = [edda.id];
  const { session } = startWorldExploration(
    world,
    { characters: [edda], objects: [], places: [], rulesets: [] },
    { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: common.id },
    "notes",
  );
  if (narration) session.adventure!.narration = { ...narration, freeReplies: true };
  return { engine: new StateEngine(session, new EventLog()), eddaId: `npc:${edda.id}` };
}

const promptFor = (engine: StateEngine, who: string) =>
  buildFreeReplyMessages(engine.getSession(), who, "Hello", [])
    .map((m) => m.content)
    .join("\n");

describe("lines the player keeps about a place", () => {
  it("are told to the story AI in this place, under who kept them", () => {
    const { engine, eddaId } = game();
    expect(promptFor(engine, eddaId)).not.toContain("Established here");

    engine.addPlaceNote("  Edda   owes the innkeeper\na favour. ");

    const text = promptFor(engine, eddaId);
    expect(text).toContain("Established here, kept by the player:");
    expect(text).toContain("- Edda owes the innkeeper a favour.");
  });

  it("belong to the place: not in another place, and back again on return", () => {
    const { engine, eddaId } = game();
    engine.addPlaceNote("The fire is always lit.");
    const s = engine.getSession();
    const door = Object.values(s.encounter!.state.barriers).find((b) => b.name === "Kitchen door")!;
    engine.executeEncounterAction(
      {
        id: crypto.randomUUID(),
        expectedRevision: s.encounter!.state.revision,
        expectedSceneId: s.sceneId!,
        action: { kind: "interact", operation: "open", barrierId: door.id },
      },
      () => 0,
    );
    const link = adventureOptions(engine.getSession()).find((l) => l.label === "Go to Kitchen")!;
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: link.id,
      expectedStateVersion: engine.getSession().stateVersion,
    });
    expect(promptFor(engine, "player")).not.toContain("The fire is always lit.");

    const back = adventureOptions(engine.getSession()).find(
      (l) => l.label === "Go to Common room",
    )!;
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: back.id,
      expectedStateVersion: engine.getSession().stateVersion,
    });

    expect(promptFor(engine, eddaId)).toContain("- The fire is always lit.");
  });

  it("survive saving and loading, and change nothing in the game", async () => {
    const { engine } = game();
    const before = structuredClone(engine.getSession());

    engine.addPlaceNote("Edda knows the cellar.");

    const after = engine.getSession();
    expect(after.stateVersion).toBe(before.stateVersion);
    expect(after.encounter).toEqual(before.encounter);
    expect(after.conversation).toEqual(before.conversation);
    expect(after.events).toEqual(before.events);
    const repo = new IndexedDBRepository(new IDBFactory(), "place-notes");
    await repo.saveSession(after);
    const loaded = parseSession(await repo.loadSession(after.id));
    expect(loaded.adventure!.notes[loaded.adventure!.currentSceneId]).toEqual([
      "Edda knows the cellar.",
    ]);
  });

  it("are kept on the place where the line was said, not the place the player stands in now", () => {
    const { engine, eddaId } = game();
    const said = engine.getSession().adventure!.currentSceneId;
    const s = engine.getSession();
    const door = Object.values(s.encounter!.state.barriers).find((b) => b.name === "Kitchen door")!;
    engine.executeEncounterAction(
      {
        id: crypto.randomUUID(),
        expectedRevision: s.encounter!.state.revision,
        expectedSceneId: s.sceneId!,
        action: { kind: "interact", operation: "open", barrierId: door.id },
      },
      () => 0,
    );
    const link = adventureOptions(engine.getSession()).find((l) => l.label === "Go to Kitchen")!;
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: link.id,
      expectedStateVersion: engine.getSession().stateVersion,
    });
    const now = engine.getSession().adventure!.currentSceneId;
    expect(now).not.toBe(said);

    engine.addPlaceNote("Edda hums when she lies.", said);

    const notes = engine.getSession().adventure!.notes;
    expect(notes[said]).toEqual(["Edda hums when she lies."]);
    expect(notes[now]).toBeUndefined();
    expect(promptFor(engine, "player")).not.toContain("Edda hums when she lies.");
    expect(() => engine.addPlaceNote("Nowhere.", "no-such-scene")).toThrow(/not part of this/);
    expect(eddaId).toBeTruthy();
  });

  it("are shortened last when the prompt is too big, newest kept, and the prompt still fits", () => {
    const small = game();
    const big = game({ background: "A long tale. ".repeat(600), voice: "Quiet. ".repeat(200) });
    const full = (i: number) => `Note ${i}: ${"word ".repeat(55)}`.slice(0, 300);
    for (let i = 0; i < 8; i++) {
      small.engine.addPlaceNote(full(i));
      big.engine.addPlaceNote(full(i));
    }

    const roomy = promptFor(small.engine, small.eddaId);
    const tight = promptFor(big.engine, big.eddaId);

    expect(roomy.match(/- Note \d/g)).toHaveLength(8);
    const kept = tight.match(/- Note (\d)/g) ?? [];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(8);
    expect(kept.at(-1)).toContain("Note 7");
    const total = buildFreeReplyMessages(big.engine.getSession(), big.eddaId, "Hello", [])
      .map((m) => estimateTokens(m.content))
      .reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(ENCOUNTER_PROMPT_TOKEN_TARGET);
  });

  it("can be let go of, one by one", () => {
    const { engine } = game();
    engine.addPlaceNote("One.");
    engine.addPlaceNote("Two.");
    const sceneId = engine.getSession().adventure!.currentSceneId;

    engine.removePlaceNote(sceneId, 0);
    expect(engine.getSession().adventure!.notes[sceneId]).toEqual(["Two."]);
    engine.removePlaceNote(sceneId, 0);

    expect(engine.getSession().adventure!.notes[sceneId]).toBeUndefined();
    expect(() => engine.removePlaceNote(sceneId, 0)).toThrow(/not remembered/);
  });

  it("are limited: empty, too long, a ninth line, and the same line twice", () => {
    const { engine } = game();

    expect(() => engine.addPlaceNote("   ")).toThrow(/nothing to remember/);
    expect(() => engine.addPlaceNote("x".repeat(301))).toThrow(/300/);
    for (let i = 0; i < 8; i++) engine.addPlaceNote(`Line ${i}`);
    engine.addPlaceNote("Line 3");
    const sceneId = engine.getSession().adventure!.currentSceneId;
    expect(engine.getSession().adventure!.notes[sceneId]).toHaveLength(8);
    expect(() => engine.addPlaceNote("A ninth")).toThrow(/Forget one first/);
  });

  it("are cut to fit when a reply is long, at the end of a sentence if there is one", () => {
    const long = `${"A sentence that goes on. ".repeat(20)}`;

    const note = noteFrom(long);

    expect(note.length).toBeLessThanOrEqual(300);
    expect(note.endsWith(".")).toBe(true);
    expect(noteFrom("Short  and\n sweet")).toBe("Short and sweet");
  });

  it("do not exist in an older run, which opens as before", () => {
    const { engine } = game();
    const old = JSON.parse(JSON.stringify(engine.getSession().adventure));
    delete old.notes;

    expect(AdventureRunSchema.parse(old).notes).toEqual({});
  });
});
