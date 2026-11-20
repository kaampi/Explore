import art from "../ui/assets/fight-background.jpg?inline";
import { connectedAdventureExample } from "../library/playableCampaign";
import { CutsceneFilmSchema, CutscenePlacementSchema } from "./schema";

export const CUTSCENE_EXAMPLE = "bundled:before-the-bells";

export function cutsceneExample() {
  const built = connectedAdventureExample();
  const { campaign } = built;
  campaign.name = "Before the bells";
  campaign.exampleId = CUTSCENE_EXAMPLE;
  campaign.source = "example";
  const [square] = campaign.scenes;
  const [north] = campaign.sceneLinks;
  north!.minutes = 20;
  campaign.cutsceneFilms = [
    {
      id: `${campaign.id}:morning`,
      title: "Morning in Brookmere",
      images: [{ id: "dawn", dataUrl: art, thumbDataUrl: art, alt: "Light and drifting embers" }],
      beats: [
        {
          id: "dawn",
          image: {
            source: { kind: "set", imageId: "dawn" },
            in: { effect: "fade", seconds: 2 },
            out: { effect: "fade" },
          },
          sound: { action: "effect", caption: "[A low hum]" },
          text: {
            text: "You wake up with a terrible headache.",
            in: { effect: "typewriter", seconds: 2, delay: 0.5 },
            out: { effect: "stay" },
          },
        },
        {
          id: "knock",
          text: {
            text: "Someone is at the door.",
            style: "whisper",
            in: { effect: "fade", seconds: 0.5 },
            out: { effect: "stay" },
          },
          sound: { action: "effect", caption: "[Three knocks]" },
        },
      ],
    },
    {
      id: `${campaign.id}:road`,
      title: "The north path",
      display: "fullscreen",
      beats: [
        {
          id: "road",
          text: {
            text: "The fields give way to stone as you take the north path.",
            in: { effect: "fade" },
            out: { effect: "stay" },
            position: "middle",
            align: "center",
          },
        },
      ],
    },
    {
      id: `${campaign.id}:bells`,
      title: "Warning bells",
      beats: [
        {
          id: "bells",
          sound: { action: "effect", caption: "[Bells in the valley]" },
          text: {
            text: "A bell answers another in the valley below.",
            in: { effect: "fade" },
            out: { effect: "stay" },
          },
        },
      ],
    },
    {
      id: `${campaign.id}:ending`,
      title: "The messenger returns",
      beats: [
        {
          id: "ending",
          text: {
            text: "A figure comes into view on the north path. Edda recognises him before you do.",
            in: { effect: "fade" },
            out: { effect: "stay" },
          },
        },
      ],
    },
  ].map((film) =>
    CutsceneFilmSchema.parse({
      ...film,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    }),
  );
  const clues = north!.requiresFlags;
  campaign.cutscenes = [
    { trigger: { kind: "scene", sceneId: square!.id } },
    { trigger: { kind: "link", linkId: north!.id }, minutes: 15 },
    { trigger: { kind: "facts", flags: clues } },
    { trigger: { kind: "facts", flags: campaign.goal!.requiresFlags } },
  ].map((entry, index) =>
    CutscenePlacementSchema.parse({
      ...entry,
      id: `${campaign.id}:placement:${index}`,
      filmId: campaign.cutsceneFilms![index]!.id,
    }),
  );
  return built;
}
