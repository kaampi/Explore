import type { CampaignTemplate, PlaceTemplate, RealmTemplate } from "../library/LibrarySchema";
import type { PlayTheme } from "../ui/themes/theme";

/**
 * The look an author gave a game: the adventure's own theme, otherwise the theme of its world,
 * otherwise none (the player's own appearance is then used). The world is the one the adventure
 * names, or else the one of the place it starts in.
 */
export function authorThemeFor(
  campaign: Pick<CampaignTemplate, "theme" | "realmId" | "mapWorldId">,
  realms: readonly RealmTemplate[] = [],
  startPlace?: Pick<PlaceTemplate, "realmId">,
): PlayTheme | undefined {
  if (campaign.theme) return campaign.theme;
  const worldId = campaign.realmId || campaign.mapWorldId || startPlace?.realmId;
  return realms.find((realm) => realm.id === worldId)?.theme;
}
