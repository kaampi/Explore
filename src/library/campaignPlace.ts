import {
  inferCampaignRealmId,
  newPlaceTemplate,
  newRealmTemplate,
  type CampaignTemplate,
  type PlaceTemplate,
  type RealmTemplate,
} from "./LibrarySchema";

const MAX_PLACE_NAME = 120;

export type NewPlacePlan = {
  place: PlaceTemplate;
  /** Set only when the adventure had no world yet, so one had to be made. */
  realm?: RealmTemplate;
  /** The adventure to continue with. It names the world the place belongs to. */
  campaign: CampaignTemplate;
};

/**
 * Work out a new place for an adventure. The place goes in the adventure's world.
 * An adventure with no world yet gets a new one named after the adventure.
 * Nothing is saved here.
 */
export function planNewPlace(
  campaign: CampaignTemplate,
  knownPlaces: PlaceTemplate[],
  name: string,
): NewPlacePlan {
  const trimmed = name.trim().slice(0, MAX_PLACE_NAME);
  if (!trimmed) throw new Error("Give the place a name.");
  const existingRealmId = inferCampaignRealmId(campaign, knownPlaces);
  const realm = existingRealmId
    ? undefined
    : newRealmTemplate({
        name: campaign.name.trim() || "New world",
        note: "",
        source: "player",
      });
  const realmId = existingRealmId || realm!.id;
  const place = newPlaceTemplate({ name: trimmed, realmId, note: "" });
  return {
    place,
    ...(realm ? { realm } : {}),
    campaign: campaign.realmId === realmId ? campaign : { ...campaign, realmId },
  };
}
