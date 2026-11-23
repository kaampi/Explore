import type { EncounterGame } from "../game/EncounterSchema";
import type { CampaignTemplate, ObjectTemplate } from "./LibrarySchema";

/** Keep linked card text current for guide adventures, with explicit adventure-local overrides. */
export function syncAdventureItemText(
  campaign: CampaignTemplate,
  game: EncounterGame,
  objects: ObjectTemplate[],
): void {
  for (const item of game.definition.items) {
    const override = campaign.guideItemText?.[item.id];
    const card = objects.find(({ id }) => id === item.id);
    if (override !== undefined || card) {
      const text = override ?? card?.readableContent;
      if (text) item.readableContent = text;
      else delete item.readableContent;
    }
  }
}
