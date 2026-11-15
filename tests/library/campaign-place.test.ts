import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { planNewPlace } from "../../src/library/campaignPlace";
import {
  campaignLandmarks,
  newCampaignTemplate,
  newPlaceTemplate,
  newRealmTemplate,
} from "../../src/library/LibrarySchema";

describe("planNewPlace", () => {
  it("makes a world for an adventure that has none, named after the adventure", () => {
    const campaign = newCampaignTemplate({ name: "The Long Road", scenes: [] });

    const plan = planNewPlace(campaign, [], "The old mill");

    expect(plan.realm?.name).toBe("The Long Road");
    expect(plan.place.name).toBe("The old mill");
    expect(plan.place.realmId).toBe(plan.realm!.id);
    expect(plan.campaign.realmId).toBe(plan.realm!.id);
  });

  it("adds the place to the adventure's existing world without making another", () => {
    const realm = newRealmTemplate({ name: "Brookmere", note: "", source: "player" });
    const campaign = newCampaignTemplate({ name: "Tale", realmId: realm.id, scenes: [] });
    const known = newPlaceTemplate({ name: "Square", realmId: realm.id, note: "" });

    const plan = planNewPlace(campaign, [known], "Tower");

    expect(plan.realm).toBeUndefined();
    expect(plan.place.realmId).toBe(realm.id);
    expect(plan.campaign).toBe(campaign);
  });

  it("makes the new place show up as one of the adventure's places", () => {
    const campaign = newCampaignTemplate({ name: "Tale", scenes: [] });

    const plan = planNewPlace(campaign, [], "Tower");

    expect(campaignLandmarks(plan.campaign, [plan.place]).map((p) => p.name)).toEqual(["Tower"]);
  });

  it("names a nameless adventure's world something readable", () => {
    const campaign = newCampaignTemplate({ name: "  ", scenes: [] });

    expect(planNewPlace(campaign, [], "Tower").realm?.name).toBe("New world");
  });

  it("needs a name", () => {
    const campaign = newCampaignTemplate({ name: "Tale", scenes: [] });

    expect(() => planNewPlace(campaign, [], "   ")).toThrow(/name/i);
  });

  it("survives being saved and loaded: the saved place is found under the saved world", async () => {
    const repo = new IndexedDBRepository(new IDBFactory(), "campaign-place-db");
    const campaign = newCampaignTemplate({ name: "Tale", scenes: [] });
    const plan = planNewPlace(campaign, [], "Tower");

    await repo.saveRealm(plan.realm!);
    await repo.savePlace(plan.place);

    const places = await repo.listPlaces();
    const realms = await repo.listRealms();
    expect(realms.map((r) => r.id)).toContain(plan.campaign.realmId);
    expect(campaignLandmarks(plan.campaign, places).map((p) => p.name)).toEqual(["Tower"]);
  });
});
