import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { installInnExample, startInnExample } from "../../src/scenarios/innVisit";
import { installGatehouseExample, startGatehouseExample } from "../../src/scenarios/gatehouse";
import { installExampleOnce } from "../../src/scenarios/exampleLibrary";
import { connectedAdventureExample } from "../../src/library/playableCampaign";

let counter = 0;
const repo = () => new IndexedDBRepository(new IDBFactory(), `examples-${++counter}`);

/** How many of each thing the library holds. */
async function counts(r: IndexedDBRepository) {
  return {
    campaigns: (await r.listCampaigns()).length,
    realms: (await r.listRealms()).length,
    places: (await r.listPlaces()).length,
    characters: (await r.listCharacters()).length,
    objects: (await r.listObjects()).length,
    rulesets: (await r.listRulesets()).length,
  };
}

describe("trying a bundled example again", () => {
  it("makes the inn once, however many times it is tried", async () => {
    const r = repo();
    const first = await installInnExample(r);
    const once = await counts(r);
    expect(once.campaigns).toBe(1);

    const second = await installInnExample(r);
    await startInnExample(r, "again-1");
    await startInnExample(r, "again-2");

    expect(await counts(r)).toEqual(once);
    // The same adventure, world and places are used again.
    expect(second.campaign.id).toBe(first.campaign.id);
    expect(second.realm.id).toBe(first.realm.id);
    expect(second.places.map((p) => p.id).sort()).toEqual(first.places.map((p) => p.id).sort());
  });

  it("makes the city gate, with its rule-set and people, once", async () => {
    const r = repo();
    await installGatehouseExample(r);
    const once = await counts(r);
    expect(once.rulesets).toBe(1);
    expect(once.characters).toBe(2);

    await startGatehouseExample(r, "gate-1");
    await startGatehouseExample(r, "gate-2");

    expect(await counts(r)).toEqual(once);
  });

  it("makes the connected example once, with its world, places, person and key", async () => {
    const r = repo();
    const build = () => connectedAdventureExample();
    const first = await installExampleOnce(r, "bundled:connected-messenger", build);
    const once = await counts(r);
    expect(once).toMatchObject({ campaigns: 1, realms: 1, places: 2, characters: 1, objects: 1 });

    const second = await installExampleOnce(r, "bundled:connected-messenger", build);
    await installExampleOnce(r, "bundled:connected-messenger", build);

    expect(await counts(r)).toEqual(once);
    expect(second.campaign.id).toBe(first.campaign.id);
    expect(second.characters[0]!.id).toBe(first.characters[0]!.id);
  });

  it("starts from what is in the library, so an edit to the example is kept", async () => {
    const r = repo();
    const first = await installInnExample(r);
    await r.saveCampaign({ ...first.campaign, playerIntro: "Edited by the author." });

    const again = await installInnExample(r);

    expect(again.campaign.playerIntro).toBe("Edited by the author.");
    expect((await counts(r)).campaigns).toBe(1);
  });

  it("recognises a copy made before examples were kept apart, by its name", async () => {
    const r = repo();
    const old = connectedAdventureExample();
    await r.saveRealm(old.realm);
    for (const place of old.places) await r.savePlace(place);
    for (const person of old.characters) await r.saveCharacter(person);
    for (const thing of old.objects) await r.saveObject(thing);
    await r.saveCampaign(old.campaign);
    const before = await counts(r);

    const used = await installExampleOnce(
      r,
      "bundled:connected-messenger",
      connectedAdventureExample,
    );

    expect(await counts(r)).toEqual(before);
    expect(used.campaign.id).toBe(old.campaign.id);
  });

  it("makes it again whole when a part has been deleted, and leaves no broken copy behind", async () => {
    const r = repo();
    const first = await installGatehouseExample(r);
    await r.deleteCharacter(first.characters[0]!.id);

    const again = await installGatehouseExample(r);

    const now = await counts(r);
    expect(now.campaigns).toBe(1);
    expect(again.characters).toHaveLength(2);
    expect((await r.listCharacters()).some((c) => c.id === again.characters[0]!.id)).toBe(true);
  });

  it("does not touch the author's own adventures", async () => {
    const r = repo();
    const mine = connectedAdventureExample();
    mine.campaign.name = "My own story";
    await r.saveCampaign(mine.campaign);

    await installInnExample(r);
    await installInnExample(r);

    const names = (await r.listCampaigns()).map((c) => c.name);
    expect(names).toContain("My own story");
    expect(names).toHaveLength(2);
  });
});
