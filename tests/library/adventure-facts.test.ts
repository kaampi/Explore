import { describe, expect, it } from "vitest";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { adventureMapPlaces } from "../../src/library/adventureMap";

describe("adventureFacts", () => {
  it("includes what a connection records on arrival", () => {
    const built = connectedAdventureExample();
    const campaign = structuredClone(built.campaign);
    campaign.sceneLinks[0]!.setsFlags = ["crossed-the-bridge"];
    campaign.sceneLinks[0]!.label = "Cross the bridge";

    const fact = adventureFacts(campaign).find((item) => item.id === "crossed-the-bridge");

    expect(fact?.label).toBe("Cross the bridge · arrived");
  });

  it("lets the inn adventure's objective rely on a fact its connection records", () => {
    const inn = innVisitExample();
    const facts = new Set(adventureFacts(inn.campaign).map((fact) => fact.id));

    expect(facts.has("inn:returned-with-ledger")).toBe(true);
    expect(
      storyboardIssues(inn.campaign, inn.places, facts, adventureMapPlaces(inn.realm, inn.places)),
    ).toEqual([]);
  });
});
