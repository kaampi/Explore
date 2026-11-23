import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import { sessionFromAdventureStart } from "../../session/campaignStart";

export async function startSavedGuideAdventure(
  repo: IndexedDBRepository,
  campaignId: string,
  sessionId: string,
) {
  const [campaign, places, realms, characters, factions, objects, voices, rulesets] =
    await Promise.all([
      repo.loadCampaign(campaignId),
      repo.listPlaces(),
      repo.listRealms(),
      repo.listCharacters(),
      repo.listFactions(),
      repo.listObjects(),
      repo.listVoices(),
      repo.listRulesets(),
    ]);
  const built = sessionFromAdventureStart(
    { campaign, places, realms, characters, factions, objects, voices, rulesets },
    sessionId,
  );
  if (!built.ok) throw new Error(built.reason);
  return built.session;
}
