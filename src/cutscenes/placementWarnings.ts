import type { CampaignTemplate } from "../library/LibrarySchema";
import type { CutsceneFilm } from "./schema";

export type PlacementWarning = {
  id: string;
  title?: string | undefined;
  reason: "Film" | "Link" | "Scene" | "Fact" | "Steps" | "Image" | "Sound";
};

export function placementWarnings(
  campaign: CampaignTemplate,
  facts: ReadonlySet<string>,
  films: readonly CutsceneFilm[],
  tracks?: ReadonlySet<string>,
): PlacementWarning[] {
  const byFilm = new Map(films.map((film) => [film.id, film]));
  return campaign.cutscenes.flatMap(({ id, filmId, trigger }) => {
    const film = byFilm.get(filmId);
    const results: PlacementWarning[] = [];
    const add = (reason: PlacementWarning["reason"]) =>
      results.push({ id, title: film?.title, reason });
    if (!film) add("Film");
    if (trigger.kind === "link" && !campaign.sceneLinks.some((way) => way.id === trigger.linkId))
      add("Link");
    if (trigger.kind === "scene" && !campaign.scenes.some((scene) => scene.id === trigger.sceneId))
      add("Scene");
    if (trigger.kind === "facts" && trigger.flags.some((flag) => !facts.has(flag))) add("Fact");
    if (!film) return results;
    if (!film.beats.length) add("Steps");
    if (
      film.beats.some(({ image }) => {
        const source = image.source;
        return (
          source.kind === "set" && !film.images.some((picture) => picture.id === source.imageId)
        );
      })
    )
      add("Image");
    if (
      tracks &&
      film.beats.some(
        ({ sound }) =>
          (sound.action === "music" || sound.action === "effect") &&
          !!sound.trackId &&
          !tracks.has(sound.trackId),
      )
    )
      add("Sound");
    return results;
  });
}
