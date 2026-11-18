import { describe, expect, it } from "vitest";
import { assembleContext } from "@context/ContextEngine";
import { bodyPlanSummary, factionSummary, MAX_FIGURE_WORDS } from "@context/bodyPlan";
import { BUILTIN_ANATOMY_TEMPLATES } from "@state/builtinAnatomy";
import { pinSessionFactions } from "@state/anatomy";
import { estimateTokens } from "@context/tokenEstimate";
import type { CharacterState, Session } from "@state/StateSchema";

const words = (text: string) => text.trim().split(/\s+/).length;

function character(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    position: { value: "the cave", lock: "unlocked" },
    mood: { value: "watchful", lock: "unlocked" },
    ...overrides,
  } as CharacterState;
}

function makeSession(
  characters: Record<string, CharacterState>,
  extra: Partial<Session> = {},
): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters,
    scene: { location: "a cave", environment: { lighting: "dim" } },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...extra,
  } as Session;
}

describe("a body plan in words", () => {
  it("describes an arachnid by its legs and palps", () => {
    const session = makeSession({ shelob: character({ anatomyTemplateId: "builtin-arachnid" }) });

    const text = bodyPlanSummary(session, session.characters.shelob!)!;

    expect(text).toMatch(/^Arachnid: /);
    expect(text).toContain("eight legs");
    expect(text).toContain("two pedipalps");
  });

  it("describes a cephalopod by its arms and a dragon by its wings", () => {
    const octo = makeSession({ o: character({ anatomyTemplateId: "builtin-cephalopod" }) });
    const dragon = makeSession({ d: character({ anatomyTemplateId: "builtin-dragon" }) });

    expect(bodyPlanSummary(octo, octo.characters.o!)).toContain("eight arms");
    expect(bodyPlanSummary(dragon, dragon.characters.d!)).toContain("two wings");
  });

  it("says four hooves and four legs for a horse", () => {
    const session = makeSession({ h: character({ anatomyTemplateId: "builtin-equine" }) });

    const text = bodyPlanSummary(session, session.characters.h!)!;

    expect(text).toContain("four legs");
    expect(text).toContain("four hooves");
  });

  it("says nothing for an unchanged human, since the model assumes one", () => {
    const session = makeSession({ p: character({ anatomyTemplateId: "builtin-humanoid" }) });

    expect(bodyPlanSummary(session, session.characters.p!)).toBeUndefined();
  });

  it("says what is missing and what is extra, and leaves out what hangs off a missing part", () => {
    const session = makeSession({
      p: character({
        anatomyTemplateId: "builtin-humanoid",
        anatomyOverrides: { removedParts: ["left_arm"], addedParts: ["tail"] },
      }),
    });

    const text = bodyPlanSummary(session, session.characters.p!)!;

    expect(text).toContain("without left arm");
    expect(text).toContain("with extra tail");
    expect(text).toContain(", arm, hand,");
    expect(text).not.toContain("two hands");
  });

  it("says nothing for a figure with no body plan or an unknown one", () => {
    const none = makeSession({ p: character() });
    const unknown = makeSession({ p: character({ anatomyTemplateId: "my-own-plan" }) });

    expect(bodyPlanSummary(none, none.characters.p!)).toBeUndefined();
    expect(bodyPlanSummary(unknown, unknown.characters.p!)).toBeUndefined();
  });

  it("uses a custom plan that was pinned to the session", () => {
    const session = makeSession(
      { p: character({ anatomyTemplateId: "mine" }) },
      {
        anatomyTemplates: {
          mine: {
            id: "mine",
            name: "Jelly",
            version: 1,
            parts: [
              { id: "body", label: "Body", capabilities: [] },
              { id: "pseudopod_1", label: "Pseudopod 1", capabilities: ["locomote", "grasp"] },
              { id: "pseudopod_2", label: "Pseudopod 2", capabilities: ["locomote", "grasp"] },
            ],
          },
        },
      },
    );

    expect(bodyPlanSummary(session, session.characters.p!)).toBe("Jelly: two pseudopods, body");
  });

  it("stays within 30 words for every built-in plan, even with many extra parts", () => {
    for (const template of BUILTIN_ANATOMY_TEMPLATES) {
      const session = makeSession({
        f: character({
          anatomyTemplateId: template.id,
          anatomyOverrides: {
            removedParts: [],
            addedParts: ["horn", "second tail", "third eye", "glowing sigil", "iron spine"],
          },
        }),
      });

      const text = bodyPlanSummary(session, session.characters.f!)!;

      expect(words(text), template.id).toBeLessThanOrEqual(MAX_FIGURE_WORDS);
    }
  });
});

describe("factions in words", () => {
  const session = (ids: string[]) =>
    makeSession(
      { a: character({ factionIds: ids }) },
      { factions: { guild: { name: "Mages Guild" }, thieves: { name: "Thieves' Guild" } } },
    );

  it("lists the names, in the card's order, and skips ones it does not know", () => {
    const s = session(["thieves", "gone", "guild"]);

    expect(factionSummary(s, s.characters.a!)).toBe("Thieves' Guild, Mages Guild");
  });

  it("says nothing for a figure with none", () => {
    const s = session([]);

    expect(factionSummary(s, s.characters.a!)).toBeUndefined();
    expect(factionSummary(makeSession({ a: character() }), character())).toBeUndefined();
  });

  it("stays within 30 words however many there are", () => {
    const many = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `f${i}`,
        { name: `The Very Long Winded Brotherhood Number ${i}` },
      ]),
    );
    const s = makeSession({ a: character({ factionIds: Object.keys(many) }) }, { factions: many });

    expect(words(factionSummary(s, s.characters.a!)!)).toBeLessThanOrEqual(MAX_FIGURE_WORDS);
  });

  it("is pinned from the library so a later rename does not change a running game", () => {
    const base = makeSession({ a: character({ factionIds: ["guild"] }) });

    const pinned = pinSessionFactions(base, [{ id: "guild", name: "Mages Guild" }]);
    const renamed = pinSessionFactions(base, [{ id: "guild", name: "Renamed" }]);

    expect(factionSummary(pinned, pinned.characters.a!)).toBe("Mages Guild");
    expect(factionSummary(pinned, pinned.characters.a!)).not.toBe(
      factionSummary(renamed, renamed.characters.a!),
    );
  });

  it("pins nothing when no figure has a faction", () => {
    const base = makeSession({ a: character() });

    expect(pinSessionFactions(base, [{ id: "guild", name: "Mages Guild" }])).toBe(base);
  });
});

describe("in the prompt", () => {
  const exotic = () =>
    makeSession(
      {
        shelob: character({ anatomyTemplateId: "builtin-arachnid", factionIds: ["guild"] }),
        octo: character({ anatomyTemplateId: "builtin-cephalopod" }),
        drake: character({ anatomyTemplateId: "builtin-dragon", factionIds: ["guild", "thieves"] }),
        horse: character({ anatomyTemplateId: "builtin-equine" }),
        emma: character(),
      },
      { factions: { guild: { name: "Mages Guild" }, thieves: { name: "Thieves' Guild" } } },
    );

  const stateBlock = (session: Session) =>
    assembleContext(session).includedBlocks.find((block) => block.source === "state_summary")!;

  it("puts the body and the factions on that figure's line", () => {
    const content = stateBlock(exotic()).content;
    const shelob = content.split("\n").find((line) => line.startsWith("- shelob"))!;

    expect(shelob).toContain("body: Arachnid: eight legs");
    expect(shelob).toContain("factions: Mages Guild");
  });

  it("adds one guidance line when any figure has a body, and none otherwise", () => {
    const withBody = stateBlock(exotic()).content;
    const plain = stateBlock(makeSession({ emma: character() })).content;

    expect(withBody.match(/described by that body/g)).toHaveLength(1);
    expect(plain).not.toContain("described by that body");
    expect(plain).not.toContain("body:");
    expect(plain).not.toContain("factions:");
  });

  it("costs little: five figures add under 200 tokens and the prompt stays within its target", () => {
    const withExtras = exotic();
    const bare = makeSession(
      Object.fromEntries(
        Object.entries(withExtras.characters).map(([id, c]) => [
          id,
          { ...c, anatomyTemplateId: undefined, factionIds: undefined },
        ]),
      ),
    );

    const added =
      estimateTokens(stateBlock(withExtras).content) - estimateTokens(stateBlock(bare).content);
    const result = assembleContext(withExtras);

    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(200);
    expect(result.overTarget).toBe(false);
  });
});
