import { describe, expect, it } from "vitest";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { playerReferenceFor, referenceFor } from "../../src/library/characterReference";
import {
  parseCampaignTemplate,
  parseCharacterTemplate,
  newCampaignTemplate,
  newCharacterTemplate,
  type CampaignTemplate,
  type CharacterTemplate,
} from "../../src/library/LibrarySchema";
import {
  MAX_VERSIONS,
  addReferenceCard,
  chooseCardVersion,
  removeReferenceCard,
  renameReferenceCard,
  saveCardVersion,
  setDefaultCard,
  newReferenceCard,
  type CardDraft,
  type CharacterReferences,
  type ReferenceCard,
} from "../../src/library/referenceCards";
import { sketchAdventure } from "../fixtures/authoring-sketch";

const NOW = "2026-11-26T10:00:00.000Z";
/** A draft whose hair is `label`, so that versions can be told apart. */
const draft = (label: string, extra: Partial<CardDraft> = {}): CardDraft => ({
  imageDataUrl: `data:image/png;base64,IMG-${label}`,
  thumbDataUrl: `data:image/png;base64,THUMB-${label}`,
  imageHash: `hash-${label}`,
  facts: { hair: label, other: [] },
  palette: [],
  source: { kind: "local" },
  ...extra,
});
const hairOf = (card: ReferenceCard, version: number) =>
  card.versions.find((item) => item.version === version)!.facts.hair;

function emma(references?: CharacterReferences): CharacterTemplate {
  return {
    ...newCharacterTemplate({
      id: "emma",
      name: "Emma",
      personality: "Curious.",
      appearance: "Tall.",
    }),
    ...(references ? { references } : {}),
  };
}
/**
 * Two cards: Fantasy (default) and Sci-fi. Emma's ordinary portrait is copied to Fantasy when Sci-fi
 * is added, since that portrait showed the only look there was.
 */
function twoCards(): CharacterTemplate {
  const fantasy = addReferenceCard(undefined, {
    cardId: "fantasy",
    name: "Fantasy",
    draft: draft("brown"),
    now: NOW,
  });
  if (!fantasy.ok) throw new Error(fantasy.reason);
  const sci = addReferenceCard(fantasy.value, {
    cardId: "sci-fi",
    name: "Sci-fi",
    draft: draft("silver"),
    now: NOW,
    characterPortrait: "data:image/png;base64,PORTRAIT",
  });
  if (!sci.ok) throw new Error(sci.reason);
  return emma(sci.value);
}

describe("1. versions, per card", () => {
  it("a new card is version 1, and the next saved change is version 2", () => {
    const card = newReferenceCard("fantasy", "Fantasy", draft("brown"), NOW);
    expect(card).toMatchObject({ activeVersion: 1, latestVersion: 1 });
    const saved = saveCardVersion(card, draft("auburn"), NOW);
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") return;
    expect(saved.card).toMatchObject({ activeVersion: 2, latestVersion: 2 });
    expect(saved.card.versions[0]).toMatchObject({ version: 2, basedOn: 1 });
  });

  it("choosing version 1 makes it active without a new number; a change from it is version 4, based on 1", () => {
    let card = newReferenceCard("fantasy", "Fantasy", draft("brown"), NOW);
    for (const label of ["auburn", "black"]) {
      const saved = saveCardVersion(card, draft(label), NOW);
      if (saved.status !== "saved") throw new Error("unexpected");
      card = saved.card;
    }
    const chosen = chooseCardVersion(card, 1);
    if (!chosen.ok) throw new Error(chosen.reason);
    expect(chosen.value).toMatchObject({
      activeVersion: 1,
      latestVersion: 3,
      versions: card.versions,
    });
    expect(hairOf(chosen.value, 1)).toBe("brown");
    const changed = saveCardVersion(chosen.value, draft("red"), NOW);
    if (changed.status !== "saved") throw new Error("unexpected");
    expect(changed.card).toMatchObject({ activeVersion: 4, latestVersion: 4 });
    expect(changed.card.versions.find((item) => item.version === 4)).toMatchObject({ basedOn: 1 });
    expect(hairOf(changed.card, 1)).toBe("brown");
  });

  it("a draft that is not saved creates no version", () => {
    const card = newReferenceCard("fantasy", "Fantasy", draft("brown"), NOW);
    // A draft is only what the caller holds; without saveCardVersion the card is unchanged.
    expect(card.versions).toHaveLength(1);
    expect(card.latestVersion).toBe(1);
  });

  it("after pruning no number is used again, and the active version is never pruned", () => {
    let card = newReferenceCard("fantasy", "Fantasy", draft("v1"), NOW);
    for (let n = 2; n <= MAX_VERSIONS; n++) {
      const saved = saveCardVersion(card, draft(`v${n}`), NOW);
      if (saved.status !== "saved") throw new Error("unexpected");
      card = saved.card;
    }
    expect(card.versions).toHaveLength(MAX_VERSIONS);
    // Make the oldest one active: it must stay, and the next oldest goes.
    card = (chooseCardVersion(card, 1) as { ok: true; value: ReferenceCard }).value;
    const seventh = saveCardVersion(card, draft("v7"), NOW);
    expect(seventh).toEqual({ status: "needs-prune", oldest: 2 });
    const pruned = saveCardVersion(card, draft("v7"), NOW, { confirmPrune: true });
    if (pruned.status !== "saved") throw new Error("unexpected");
    expect(pruned.card.versions.map((item) => item.version)).toEqual([7, 6, 5, 4, 3, 1]);
    expect(pruned.card).toMatchObject({ activeVersion: 7, latestVersion: 7 });
    // Pruning versions does not make a number free again.
    const eighth = saveCardVersion(
      (chooseCardVersion(pruned.card, 6) as { ok: true; value: ReferenceCard }).value,
      draft("v8"),
      NOW,
      { confirmPrune: true },
    );
    if (eighth.status !== "saved") throw new Error("unexpected");
    expect(eighth.card.latestVersion).toBe(8);
  });

  it("cancelling the seventh version changes nothing: the card and its history are as they were", () => {
    let card = newReferenceCard("fantasy", "Fantasy", draft("v1"), NOW);
    for (let n = 2; n <= MAX_VERSIONS; n++) {
      const saved = saveCardVersion(card, draft(`v${n}`), NOW);
      if (saved.status !== "saved") throw new Error("unexpected");
      card = saved.card;
    }
    const before = structuredClone(card);
    const outcome = saveCardVersion(card, draft("v7"), NOW);
    expect(outcome.status).toBe("needs-prune");
    expect(card).toEqual(before);
  });

  it("another card's numbers are not changed by a new version of this card", () => {
    const { character } = { character: twoCards() };
    const refs = character.references!;
    const fantasy = refs.cards.find((card) => card.cardId === "fantasy")!;
    const saved = saveCardVersion(fantasy, draft("auburn"), NOW);
    if (saved.status !== "saved") throw new Error("unexpected");
    const next = refs.cards.map((card) => (card.cardId === "fantasy" ? saved.card : card));
    expect(next.find((card) => card.cardId === "sci-fi")).toMatchObject({
      activeVersion: 1,
      latestVersion: 1,
    });
  });
});

describe("2. several cards", () => {
  it("the first card is the default; a second card keeps it; the default can move", () => {
    const character = twoCards();
    expect(character.references).toMatchObject({ defaultCardId: "fantasy" });
    const moved = setDefaultCard(character.references!, "sci-fi");
    if (!moved.ok) throw new Error(moved.reason);
    expect(moved.value.defaultCardId).toBe("sci-fi");
  });

  it("the default cannot be removed while other cards exist; a non-default card can", () => {
    const refs = twoCards().references!;
    expect(removeReferenceCard(refs, "fantasy")).toEqual({
      ok: false,
      reason: "Choose another default card before this one is removed.",
    });
    const removed = removeReferenceCard(refs, "sci-fi");
    if (!removed.ok) throw new Error(removed.reason);
    expect(removed.value?.cards.map((card) => card.cardId)).toEqual(["fantasy"]);
  });

  it("removing the last card removes the references", () => {
    const only = addReferenceCard(undefined, {
      cardId: "a",
      name: "A",
      draft: draft("x"),
      now: NOW,
    });
    if (!only.ok) throw new Error(only.reason);
    expect(removeReferenceCard(only.value, "a")).toEqual({ ok: true, value: undefined });
  });

  it("adding a second card gives the first card the ordinary portrait, if it has none of its own", () => {
    const refs = twoCards().references!;
    expect(refs.cards[0]!.portraitDataUrl).toBe("data:image/png;base64,PORTRAIT");
  });

  it("names are trimmed and must not be empty", () => {
    const refs = twoCards().references!;
    expect(renameReferenceCard(refs, "sci-fi", "  Stars  ")).toMatchObject({ ok: true });
    expect(renameReferenceCard(refs, "sci-fi", "  ")).toEqual({
      ok: false,
      reason: "Name the card.",
    });
  });
});

describe("3. which card applies", () => {
  it("the adventure's choice, then the default, then no card and the ordinary portrait", () => {
    const character = twoCards();
    const base = sketchAdventure().campaign;
    const plain = referenceFor(character, base);
    expect(plain.card?.cardId).toBe("fantasy");
    const chosen: CampaignTemplate = {
      ...base,
      characterLooks: [{ characterId: "emma", cardId: "sci-fi" }],
    };
    expect(referenceFor(character, chosen).card?.cardId).toBe("sci-fi");
    const bare = emma();
    expect(referenceFor({ ...bare, portraitDataUrl: "data:image/png;base64,ORD" })).toEqual({
      portraitDataUrl: "data:image/png;base64,ORD",
    });
  });

  it("a choice that points at a removed card falls back to the default and says so", () => {
    const character = twoCards();
    const campaign: CampaignTemplate = {
      ...sketchAdventure().campaign,
      characterLooks: [{ characterId: "emma", cardId: "gone" }],
    };
    const found = referenceFor(character, campaign);
    expect(found.card?.cardId).toBe("fantasy");
    expect(found.choiceGone).toEqual({ cardId: "gone" });
  });

  it("Emma in two adventures gives two cards at once, and a new version of one changes only that adventure", () => {
    const character = twoCards();
    const base = sketchAdventure().campaign;
    const alvskogen = base;
    const stjarnhamnen: CampaignTemplate = {
      ...base,
      id: "stjarnhamnen",
      characterLooks: [{ characterId: "emma", cardId: "sci-fi" }],
    };
    expect(referenceFor(character, alvskogen).card?.cardId).toBe("fantasy");
    expect(referenceFor(character, stjarnhamnen).card?.cardId).toBe("sci-fi");
    const fantasy = character.references!.cards.find((card) => card.cardId === "fantasy")!;
    const saved = saveCardVersion(fantasy, draft("auburn"), NOW);
    if (saved.status !== "saved") throw new Error("unexpected");
    const changed = emma({
      ...character.references!,
      cards: character.references!.cards.map((card) =>
        card.cardId === "fantasy" ? saved.card : card,
      ),
    });
    expect(referenceFor(changed, alvskogen).reference?.version).toBe(2);
    expect(referenceFor(changed, stjarnhamnen).reference?.version).toBe(1);
  });
});

describe("5. the player role", () => {
  /** Two library characters called Emma. The player role is the second one. */
  const first = emma(twoCards().references);
  const second: CharacterTemplate = { ...first, id: "emma-2", name: "Emma" };
  const characters = [first, second];

  it("is the character whose id it holds, and the card chosen for that character is used", () => {
    const base = sketchAdventure().campaign;
    const campaign: CampaignTemplate = {
      ...base,
      player: { ...base.player!, name: "Emma", characterId: "emma-2" },
      characterLooks: [{ characterId: "emma-2", cardId: "sci-fi" }],
    };
    const found = playerReferenceFor(campaign, characters);
    expect(found.character?.id).toBe("emma-2");
    expect(found.card?.cardId).toBe("sci-fi");
    // The same campaign, reopened from its saved form.
    const reopened = parseCampaignTemplate(JSON.parse(JSON.stringify(campaign)));
    expect(playerReferenceFor(reopened, characters).character?.id).toBe("emma-2");
  });

  it("without a characterId there is no card, even when a character has the same name", () => {
    const base = sketchAdventure().campaign;
    const campaign: CampaignTemplate = { ...base, player: { ...base.player!, name: "Emma" } };
    expect(playerReferenceFor(campaign, characters)).toEqual({});
  });

  it("when its character is gone, the role keeps its own copies and says so", () => {
    const base = sketchAdventure().campaign;
    const campaign: CampaignTemplate = {
      ...base,
      player: { ...base.player!, characterId: "removed" },
    };
    expect(playerReferenceFor(campaign, characters)).toEqual({ characterGone: true });
  });
});

describe("6–7. what does not follow a card into a game", () => {
  it("a card is not copied into a playing session, and its picture is not in the saved session", () => {
    const character = twoCards();
    const sketch = sketchAdventure();
    const scene = sketch.campaign.scenes[0]!;
    const campaign: CampaignTemplate = {
      ...sketch.campaign,
      people: [{ characterId: "emma", stats: {}, lore: [] }],
      scenes: [
        {
          ...scene,
          people: [
            {
              characterId: "emma",
              position: "",
              mood: "",
              clothing: "",
              holding: "",
              trust: "20",
              familiarity: "10",
              tension: "5",
            },
          ],
        },
        ...sketch.campaign.scenes.slice(1),
      ],
    };
    const session = startPlayableCampaign(
      campaign,
      campaign.scenes[0]!,
      sketch.library.places ?? [],
      "run",
      [],
      {
        characters: [character],
        objects: sketch.library.objects,
      },
    );
    const text = JSON.stringify(session);
    expect(text).not.toContain("IMG-brown");
    expect(text).not.toContain("IMG-silver");
    expect(text).not.toContain("references");
  });

  it("the library backup keeps the cards, as the author's own material", () => {
    const character = twoCards();
    const back = parseCharacterTemplate(JSON.parse(JSON.stringify(character)));
    expect(back.references?.cards.map((card) => card.cardId)).toEqual(["fantasy", "sci-fi"]);
    expect(back.references?.defaultCardId).toBe("fantasy");
  });

  it("a character and an adventure without the new fields work exactly as before", () => {
    const plain = newCharacterTemplate({
      id: "plain",
      name: "Plain",
      personality: "",
      appearance: "",
    });
    expect(referenceFor(plain)).toEqual({});
    const campaign = newCampaignTemplate({ id: "adv-plain", name: "Plain" });
    expect(campaign.characterLooks).toBeUndefined();
    expect(campaign.player?.characterId).toBeUndefined();
  });
});
