import {
  type CampaignPlayer,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
} from "../library/LibrarySchema";
import { adventureMapPlaces } from "../library/adventureMap";
import { scaffoldFromWorld } from "../library/worldScaffold";
import { startPlayableCampaign } from "./adventureStart";
import { pinSessionAnatomy, pinSessionFactions } from "../state/anatomy";
import type { AnatomyTemplate, Session } from "../state/StateSchema";

export type WorldLibrary = {
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
  rulesets: RulesetTemplate[];
  anatomyTemplates?: AnatomyTemplate[];
  factions?: { id: string; name: string }[];
};

/** The places of a world that a game can begin in. */
export function startablePlaces(world: RealmTemplate, places: PlaceTemplate[]) {
  return adventureMapPlaces(world, places)
    .filter(({ node }) => !node.isArea && node.visibility !== "hidden")
    .map(({ node, path }) => ({ nodeId: node.id, name: node.name, path }));
}

/**
 * Free play in a world: the map becomes an adventure, built here and started at once. Nothing is
 * added to the library, and the game keeps its own copy of everything it needs.
 */
export function startWorldExploration(
  world: RealmTemplate,
  library: WorldLibrary,
  options: { player: CampaignPlayer; startNodeId: string; rulesetId?: string | undefined },
  sessionId: string,
  model?: string,
): { session: Session; skipped: string[] } {
  const { campaign, skipped } = scaffoldFromWorld(world, library, options);
  if (model) campaign.model = model;
  const places = adventureMapPlaces(world, library.places).map((entry) => entry.place);
  const session = startPlayableCampaign(campaign, campaign.scenes[0]!, places, sessionId, [world], {
    characters: library.characters,
    rulesets: library.rulesets,
    ...(library.anatomyTemplates ? { anatomyTemplates: library.anatomyTemplates } : {}),
    ...(library.factions ? { factions: library.factions } : {}),
  });
  return {
    session: pinSessionFactions(
      pinSessionAnatomy(session, library.anatomyTemplates ?? []),
      library.factions ?? [],
    ),
    skipped,
  };
}
