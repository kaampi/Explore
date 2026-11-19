import type { IndexedDBRepository } from "../persistence/IndexedDBRepository";
import type {
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
} from "../library/LibrarySchema";

/** What a bundled example puts in the library: a world, its places and people, and the adventure. */
export type ExampleBundle = {
  realm: RealmTemplate;
  places: PlaceTemplate[];
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  rules?: RulesetTemplate | undefined;
  campaign: CampaignTemplate;
};

/** Everything of an example that is in the library, or nothing if any of it is missing. */
async function storedBundle(
  repo: IndexedDBRepository,
  campaign: CampaignTemplate,
): Promise<ExampleBundle | null> {
  try {
    const placeIds = [
      ...new Set([
        ...campaign.placeIds,
        ...campaign.scenes.flatMap((scene) => (scene.placeId ? [scene.placeId] : [])),
      ]),
    ];
    const characterIds = [
      ...new Set([
        ...campaign.people.map((person) => person.characterId),
        ...campaign.scenes.flatMap((scene) => scene.people.map((person) => person.characterId)),
      ]),
    ];
    return {
      campaign,
      realm: await repo.loadRealm(campaign.realmId ?? ""),
      places: await Promise.all(placeIds.map((id) => repo.loadPlace(id))),
      characters: await Promise.all(characterIds.map((id) => repo.loadCharacter(id))),
      objects: await Promise.all((campaign.objectIds ?? []).map((id) => repo.loadObject(id))),
      ...(campaign.rulesetId ? { rules: await repo.loadRuleset(campaign.rulesetId) } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Put a bundled example into the library, once. When its adventure is already there, with its
 * world, places and people, those are used and nothing new is made, so trying an example again does
 * not fill the library with copies. An example made before copies were kept apart is recognised by
 * its name. If a part of it has been deleted, a new whole copy is made beside it. Nothing is ever
 * removed or overwritten here: a copy the player has changed, even one with a part missing, stays
 * as it is.
 */
export async function installExampleOnce(
  repo: IndexedDBRepository,
  key: string,
  build: () => ExampleBundle,
): Promise<ExampleBundle> {
  const fresh = build();
  fresh.campaign.exampleId ??= key;
  // The same example: the same name, and either no mark from before marks were kept or its own.
  const known = (await repo.listCampaigns())
    .filter(
      (item) =>
        item.name === fresh.campaign.name &&
        (!item.exampleId || item.exampleId === key || item.exampleId === fresh.campaign.exampleId),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const campaign of known) {
    const stored = await storedBundle(repo, campaign);
    if (stored) return stored;
  }
  // Nothing whole to use: make a new copy. What is there already is left alone, and the new
  // parts have ids of their own, so nothing is written over.
  await repo.saveRealm(fresh.realm);
  if (fresh.rules) await repo.saveRuleset(fresh.rules);
  for (const place of fresh.places) await repo.savePlace(place);
  for (const person of fresh.characters) await repo.saveCharacter(person);
  for (const thing of fresh.objects) await repo.saveObject(thing);
  await repo.saveCampaign(fresh.campaign);
  return fresh;
}
