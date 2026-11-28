import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newCharacterTemplate, SceneCastSchema } from "../../src/library/LibrarySchema";
import { syncScene, type SceneLibrary } from "../../src/library/sceneSync";
import {
  actorIdFor,
  addPerson,
  isHostile,
  renamePosition,
  setAttitude,
} from "../../src/library/sceneParts";
import {
  hideUntilOutcome,
  outcomeSetting,
  placePerson,
  suggestedTrust,
  takeSuggestedTrust,
  writeCast,
  setHidden,
  setOnReveal,
  setStance,
  stanceOf,
  tuneCast,
} from "../../src/library/sceneCast";

function setup() {
  const built = connectedAdventureExample();
  const spider = newCharacterTemplate({ name: "Jättespindeln" });
  const library: SceneLibrary = {
    characters: [...built.characters, spider],
    objects: built.objects,
    places: built.places,
  };
  const scene = addPerson(structuredClone(built.campaign.scenes[0]!), spider);
  return { built, spider, library, scene, id: actorIdFor(spider.id) };
}
const cast = (scene: ReturnType<typeof setup>["scene"], characterId: string) =>
  scene.people.find((p) => p.characterId === characterId)!;

describe("the new cast fields", () => {
  it("are all optional, so an old cast entry still reads and keeps its values", () => {
    const old = SceneCastSchema.parse({ characterId: "c1", position: "Vid dörren", trust: "35" });
    expect(old.stance).toBeUndefined();
    expect(old.hidden).toBeUndefined();
    expect(old.positionId).toBeUndefined();
    expect(old.trust).toBe("35");
    const full = SceneCastSchema.parse({
      characterId: "c1",
      stance: "friendly",
      hidden: { revealedBy: "found" },
      onReveal: "attack",
      positionId: "p1",
    });
    expect(SceneCastSchema.parse(full)).toEqual(full);
  });
});

describe("stance and the engine follow each other", () => {
  it("hostile makes an opponent; friendly and neutral do not", () => {
    const { scene, spider, id } = setup();
    const hostile = setStance(scene, spider.id, "hostile");
    expect(isHostile(hostile.encounter!, hostile.encounter!.state.actors[id]!)).toBe(true);
    const friendly = setStance(hostile, spider.id, "friendly");
    expect(isHostile(friendly.encounter!, friendly.encounter!.state.actors[id]!)).toBe(false);
    expect(stanceOf(friendly, spider.id)).toBe("friendly");
  });

  it("a missing stance is the engine's law: a hostile person stays hostile", () => {
    const { scene, spider } = setup();
    const hostile = setAttitude(scene, spider.id, "hostile");
    expect(cast(hostile, spider.id).stance).toBeUndefined();
    expect(stanceOf(hostile, spider.id)).toBe("hostile");
    const synced = tuneCast(hostile);
    expect(
      isHostile(synced.encounter!, synced.encounter!.state.actors[actorIdFor(spider.id)]!),
    ).toBe(true);
    expect(cast(synced, spider.id).stance).toBeUndefined();
  });

  it("the engine moving a person to hostile updates a written stance", () => {
    const { scene, spider } = setup();
    const written = setStance(scene, spider.id, "friendly");
    const turned = setAttitude(written, spider.id, "hostile");
    expect(cast(turned, spider.id).stance).toBe("hostile");
    expect(cast(setAttitude(turned, spider.id, "neutral"), spider.id).stance).toBe("neutral");
  });

  it("never changes trust by itself: a saved 20 stays 20 until the author takes the suggestion", () => {
    const { scene, spider } = setup();
    const saved = { ...scene, people: scene.people.map((p) => ({ ...p, trust: "20" })) };
    const friendly = setStance(saved, spider.id, "friendly");
    expect(cast(friendly, spider.id).trust).toBe("20");
    expect(suggestedTrust("friendly")).toBe("60");
    expect(suggestedTrust("neutral")).toBe("20");
    expect(suggestedTrust("hostile")).toBeUndefined();
    expect(cast(takeSuggestedTrust(friendly, spider.id), spider.id).trust).toBe("60");
    expect(cast(setStance(friendly, spider.id, "hostile"), spider.id).trust).toBe("20");
    expect(
      cast(takeSuggestedTrust(setStance(friendly, spider.id, "hostile"), spider.id), spider.id)
        .trust,
    ).toBe("20");
  });

  it("keeps a trust the author chose, whatever the stance", () => {
    const { scene, spider } = setup();
    const chosen = { ...scene, people: scene.people.map((p) => ({ ...p, trust: "35" })) };
    expect(cast(setStance(chosen, spider.id, "friendly"), spider.id).trust).toBe("35");
    expect(cast(setStance(chosen, spider.id, "neutral"), spider.id).trust).toBe("35");
  });
});

describe("a hidden person in the cast", () => {
  it("is written to the engine and removed again", () => {
    const { scene, spider, id } = setup();
    const hostile = setStance(scene, spider.id, "hostile");
    const hidden = setOnReveal(setHidden(hostile, spider.id, "spider-found"), spider.id, "attack");
    expect(hidden.encounter!.state.actors[id]!.requiresFlags).toEqual(["spider-found"]);
    expect(hidden.encounter!.state.actors[id]!.onReveal).toBe("attack");
    expect(cast(hidden, spider.id).hidden).toEqual({ revealedBy: "spider-found" });
    const visible = setHidden(hidden, spider.id, null);
    expect(visible.encounter!.state.actors[id]!.requiresFlags).toBeUndefined();
    expect(visible.encounter!.state.actors[id]!.onReveal).toBeUndefined();
    expect(cast(visible, spider.id).hidden).toBeUndefined();
  });

  it("wait is the default and attack is dropped for a peaceful person on sync", () => {
    const { scene, spider, id } = setup();
    const hidden = setOnReveal(setHidden(scene, spider.id, "spider-found"), spider.id, "attack");
    expect(tuneCast(hidden).encounter!.state.actors[id]!.onReveal).toBeUndefined();
    const waiting = setOnReveal(hidden, spider.id, "wait");
    expect(waiting.encounter!.state.actors[id]!.onReveal).toBeUndefined();
  });

  it("is written by sync when only the cast says so (what the guide saves)", () => {
    const { built, scene, spider, id, library } = setup();
    const written = {
      ...scene,
      people: scene.people.map((p) => ({
        ...p,
        stance: "hostile" as const,
        hidden: { revealedBy: "spider-found" },
        onReveal: "attack" as const,
      })),
    };
    const synced = syncScene(built.campaign, written, library);
    const actor = synced.encounter!.state.actors[id]!;
    expect(isHostile(synced.encounter!, actor)).toBe(true);
    expect(actor.requiresFlags).toEqual(["spider-found"]);
    expect(actor.onReveal).toBe("attack");
    expect(cast(synced, spider.id).hidden).toEqual({ revealedBy: "spider-found" });
    expect(syncScene(built.campaign, synced, library)).toEqual(synced);
  });
});

describe("position as a name and an id", () => {
  it("a new name makes a position; the person keeps standing there after a rename", () => {
    const { scene, spider, id } = setup();
    const placed = placePerson(scene, spider.id, { name: "I taket" });
    const positionId = cast(placed, spider.id).positionId!;
    expect(placed.encounter!.state.actors[id]!.position).toBe(positionId);
    expect(cast(placed, spider.id).position).toBe("I taket");
    const renamed = renamePosition(placed, positionId, "Bland takbjälkarna");
    expect(renamed.encounter!.state.actors[id]!.position).toBe(positionId);
    expect(cast(renamed, spider.id).position).toBe("Bland takbjälkarna");
    expect(cast(tuneCast(renamed), spider.id).position).toBe("Bland takbjälkarna");
  });

  it("the id wins over a stale name, and an existing name finds its id", () => {
    const { scene, spider, id } = setup();
    const placed = placePerson(scene, spider.id, { name: "I taket" });
    const positionId = cast(placed, spider.id).positionId!;
    const stale = {
      ...placed,
      people: placed.people.map((p) => ({ ...p, position: "Gammalt namn" })),
    };
    const tuned = tuneCast(stale);
    expect(tuned.encounter!.state.actors[id]!.position).toBe(positionId);
    expect(cast(tuned, spider.id).position).toBe("I taket");
    const byName = {
      ...scene,
      people: scene.people.map((p) => {
        const { positionId: _drop, ...rest } = p;
        return { ...rest, position: "i taket" };
      }),
    };
    // The name only matches once the position exists.
    const withPlace = { ...byName, encounter: placed.encounter! };
    const found = tuneCast(withPlace);
    expect(cast(found, spider.id).positionId).toBe(positionId);
    expect(found.encounter!.state.actors[id]!.position).toBe(positionId);
  });

  it("with neither id nor name an existing person stays where the engine has them", () => {
    const { scene, spider, id } = setup();
    const before = scene.encounter!.state.actors[id]!.position;
    const tuned = tuneCast(scene);
    expect(tuned.encounter!.state.actors[id]!.position).toBe(before);
    expect(cast(tuned, spider.id).positionId).toBeUndefined();
    expect(tuned.encounter!.definition.places).toEqual(scene.encounter!.definition.places);
  });

  it("a free-text name that matches nothing never makes a position by itself on sync", () => {
    const { scene, spider } = setup();
    const odd = { ...scene, people: scene.people.map((p) => ({ ...p, position: "Vid disken" })) };
    const tuned = tuneCast(odd);
    expect(tuned.encounter!.definition.places).toEqual(scene.encounter!.definition.places);
    expect(cast(tuned, spider.id).position).toBe("Vid disken");
  });
});

describe("the guide's way of saving a person", () => {
  const hiddenSpider = () => {
    const base = setup();
    const hidden = writeCast(base.scene, base.spider.id, {
      stance: "hostile",
      hidden: { revealedBy: "spider-found" },
      onReveal: "attack",
    });
    return { ...base, hidden };
  };

  it("removing hidden clears the condition and the attack, and stays cleared on reopening", () => {
    const { hidden, spider, id, built, library } = hiddenSpider();
    expect(hidden.encounter!.state.actors[id]!.requiresFlags).toEqual(["spider-found"]);
    expect(hidden.encounter!.state.actors[id]!.onReveal).toBe("attack");
    // The guide saves the cast entry without `hidden` and without `onReveal`.
    const saved = {
      ...hidden,
      people: hidden.people.map((p) => {
        const { hidden: _h, onReveal: _o, ...rest } = p;
        return rest;
      }),
    };
    const reopened = syncScene(built.campaign, saved, library);
    const actor = reopened.encounter!.state.actors[id]!;
    expect(actor.requiresFlags).toBeUndefined();
    expect(actor.onReveal).toBeUndefined();
    expect(cast(reopened, spider.id).hidden).toBeUndefined();
    expect(syncScene(built.campaign, reopened, library)).toEqual(reopened);
  });

  it("writeCast with hidden set to undefined makes the person visible and drops onReveal", () => {
    const { hidden, spider, id } = hiddenSpider();
    const shown = writeCast(hidden, spider.id, { hidden: undefined });
    expect(shown.encounter!.state.actors[id]!.requiresFlags).toBeUndefined();
    expect(shown.encounter!.state.actors[id]!.onReveal).toBeUndefined();
    expect(cast(shown, spider.id).onReveal).toBeUndefined();
  });

  it("a new position name goes through writeCast and makes the position", () => {
    const { scene, spider, id } = setup();
    const before = scene.encounter!.definition.places.length;
    const written = writeCast(scene, spider.id, { position: "I taket", mood: "lugn" });
    expect(written.encounter!.definition.places).toHaveLength(before + 1);
    expect(cast(written, spider.id).positionId).toBeTruthy();
    expect(written.encounter!.state.actors[id]!.position).toBe(cast(written, spider.id).positionId);
    expect(cast(written, spider.id).mood).toBe("lugn");
    const again = writeCast(written, spider.id, { position: "I taket" });
    expect(again.encounter!.definition.places).toHaveLength(before + 1);
  });

  it("a write that does not mention a field leaves it as it was", () => {
    const { hidden, spider } = hiddenSpider();
    const next = writeCast(hidden, spider.id, { mood: "arg" });
    expect(cast(next, spider.id).hidden).toEqual({ revealedBy: "spider-found" });
    expect(cast(next, spider.id).stance).toBe("hostile");
  });
});

describe("hiding a person until an outcome of an action", () => {
  it("makes a fact for that outcome and hides the person until then", () => {
    const { scene, spider, id } = setup();
    const action = scene.encounter!.definition.interactions[0]!;
    const hidden = hideUntilOutcome(scene, spider.id, action.id, "success");
    const fact = cast(hidden, spider.id).hidden!.revealedBy;
    expect(outcomeSetting(hidden, fact)).toEqual({ actionId: action.id, outcome: "success" });
    expect(hidden.encounter!.state.actors[id]!.requiresFlags).toEqual([fact]);
    expect(
      hidden.encounter!.definition.interactions[0]!.failure.effects.some(
        (e) => e.kind === "flag" && e.flag === fact,
      ),
    ).toBe(false);
  });

  it("reuses the fact the outcome already sets, and only a rolling action can fail", () => {
    const { scene, spider } = setup();
    const action = scene.encounter!.definition.interactions[0]!;
    const once = hideUntilOutcome(scene, spider.id, action.id, "success");
    const twice = hideUntilOutcome(once, spider.id, action.id, "success");
    expect(cast(twice, spider.id).hidden).toEqual(cast(once, spider.id).hidden);
    expect(twice.encounter!.definition.interactions[0]!.success.effects).toEqual(
      once.encounter!.definition.interactions[0]!.success.effects,
    );
    expect(() => hideUntilOutcome(scene, spider.id, action.id, "failure")).toThrow(/rolls/);
  });
});
