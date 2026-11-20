import { CutsceneSchema } from "../../src/game/CutsceneSchema";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";

export function cutsceneAdventure() {
  const built = connectedAdventureExample();
  const { campaign } = built;
  const [village, tower] = campaign.scenes;
  const [out, back] = campaign.sceneLinks;
  const lead = out!.requiresFlags[0]!;
  out!.setsFlags = ["road-travelled"];
  out!.minutes = 20;
  campaign.cutscenes = [
    {
      id: "arrival",
      title: "The watchtower",
      paragraphs: ["The tower rises above the field."],
      trigger: { kind: "scene", sceneId: tower!.id, every: true },
    },
    {
      id: "bells",
      title: "The bells",
      paragraphs: ["The bells answer from the valley."],
      trigger: { kind: "facts", flags: [lead, "road-travelled"] },
    },
    {
      id: "intro",
      title: "A morning in the village",
      paragraphs: ["The roofs are still wet.", "A light comes on by the well."],
      trigger: { kind: "scene", sceneId: village!.id },
      setsFlags: ["woke"],
      minutes: 10,
    },
    {
      id: "road",
      title: "The road",
      paragraphs: ["Mist gathers in the hollows."],
      trigger: { kind: "link", linkId: out!.id },
      setsFlags: ["heard-the-wind"],
      minutes: 15,
    },
    {
      id: "wind",
      title: "The wind",
      paragraphs: ["The wind carries a voice."],
      trigger: { kind: "facts", flags: ["heard-the-wind"] },
      setsFlags: ["road-travelled", "heard-the-wind"],
    },
    {
      id: "last",
      title: "The messenger returns",
      paragraphs: ["A figure appears in the road."],
      trigger: { kind: "facts", flags: campaign.goal!.requiresFlags },
    },
  ].map((value) => CutsceneSchema.parse(value));
  const start = () =>
    startPlayableCampaign(campaign, village!, built.places, "cutscene-game", [built.realm], {
      characters: built.characters,
    });
  return { ...built, start, village: village!, tower: tower!, out: out!, back: back!, lead };
}
