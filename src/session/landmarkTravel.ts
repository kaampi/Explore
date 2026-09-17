import {
  EXAMPLE_AURORA_BRIEF,
  EXAMPLE_AURORA_LORE,
  EXAMPLE_AURORA_NOTE,
  EXAMPLE_PLACE_ID
} from "@library/exampleTemplates";
import type { PlaceTemplate, RealmTemplate } from "@library/LibrarySchema";
import { placeVisualFromTemplate } from "@session/campaignStart";
import type { LandmarkTravelPatch } from "@state/landmarkTravel";
import { copyAudioFields } from "@state/placeAudio";
import { copyPictureFields } from "@state/placePictures";

/** Live scene + place layers for walking to another landmark. */
export function landmarkTravelPatch(place: PlaceTemplate, _realm?: RealmTemplate): LandmarkTravelPatch {
  const visual = placeVisualFromTemplate(place);
  const note = place.note.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_NOTE : "");
  const brief = place.brief?.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_BRIEF : "");
  const placeForModel = brief || note;
  const lore = place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_LORE : [];
  const placeLayers: LandmarkTravelPatch["placeLayers"] = [];
  if (placeForModel) {
    placeLayers.push({
      id: "layer-place",
      type: "environment",
      priority: 10,
      content: placeForModel,
      active: true,
      aiGenerated: false
    });
  }
  lore.forEach((item, index) => {
    const content = item.content.trim();
    if (!content) return;
    const keywords = (item.keywords ?? []).map((word) => word.trim()).filter(Boolean);
    placeLayers.push({
      id: `layer-place-lore-${index + 1}`,
      type: "environment",
      priority: 20 + index,
      content,
      ...(keywords.length > 0 ? { keywords } : {}),
      active: true,
      aiGenerated: false
    });
  });
  return {
    placeId: place.id,
    location: place.name,
    lighting: place.lighting,
    noise: place.noise,
    music: place.music,
    ...(note ? { note } : {}),
    ...(brief ? { brief } : {}),
    ...copyPictureFields(visual),
    ...copyAudioFields(visual),
    ...(visual.rooms && visual.rooms.length > 0 ? { rooms: visual.rooms } : {}),
    placeLayers
  };
}
