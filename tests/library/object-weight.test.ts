import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newObjectTemplate } from "../../src/library/LibrarySchema";
import { addPickUp, placeItem } from "../../src/library/sceneParts";
import { itemDescription, syncAdventure } from "../../src/library/sceneSync";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";

const card = (extra: Record<string, unknown>) =>
  newObjectTemplate({
    name: "Heavy stone",
    note: "Grey.",
    tags: [],
    source: "player",
    ...extra,
  } as never);

function adventureWith(stone: ReturnType<typeof card>) {
  const built = connectedAdventureExample();
  const campaign = structuredClone(built.campaign);
  campaign.scenes[0] = addPickUp(
    placeItem(campaign.scenes[0]!, stone, { position: "here" }),
    stone.id,
  );
  const library = { characters: built.characters, objects: [...built.objects, stone] };
  const heavy = (c = campaign, l = library) =>
    storyboardWarnings(c, new Set(), l).filter((w) => w.message.includes("too heavy"));
  return { built, campaign, library, heavy };
}

describe("a thing that is too heavy to carry", () => {
  it("warns when the card says so and an action lets the player take it", () => {
    const { heavy } = adventureWith(card({ weight: 40, portable: false }));

    expect(heavy()).toHaveLength(1);
    expect(heavy()[0]!.message).toContain("Heavy stone");
  });

  it("does not warn at 30 or less, or when the card says it can be carried", () => {
    expect(adventureWith(card({ weight: 30 })).heavy()).toEqual([]);
    expect(adventureWith(card({ weight: 90, portable: true })).heavy()).toEqual([]);
    expect(adventureWith(card({})).heavy()).toEqual([]);
  });

  it("does not stop the player from taking it", () => {
    const { campaign } = adventureWith(card({ weight: 40 }));

    expect(
      campaign.scenes[0]!.encounter!.definition.interactions.some((a) =>
        a.label.startsWith("Take"),
      ),
    ).toBe(true);
  });
});

describe("weight in the description", () => {
  it("goes last, after the note", () => {
    expect(itemDescription({ note: "Grey.", weight: 40 })).toBe("Grey.\n\nWeight: 40");
    expect(itemDescription({ note: "", weight: 40 })).toBe("Weight: 40");
    expect(itemDescription({ note: "Grey." })).toBe("Grey.");
  });

  it("is written by sync, once, however often it runs", () => {
    const stone = card({ weight: 40 });
    const { built, campaign } = adventureWith(stone);
    const library = {
      characters: built.characters,
      objects: [...built.objects, stone],
      places: built.places,
      rulesets: [],
    };

    const once = syncAdventure(campaign, library);
    const twice = syncAdventure(once, library);

    const text = (c: typeof once) =>
      c.scenes[0]!.encounter!.definition.items.find((i) => i.id === stone.id)!.description;
    expect(text(once)).toBe("Grey.\n\nWeight: 40");
    expect(text(twice)).toBe(text(once));
  });
});
