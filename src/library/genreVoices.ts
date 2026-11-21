import { VoiceTemplateSchema, type VoiceTemplate } from "./LibrarySchema";
import type { ExampleLanguage } from "./exampleRulesetTexts";

const stamp = "2026-01-01T00:00:00.000Z";
const boundary =
  "Tell the scene in the player's language. Use established world facts and preserve the game outcome. Leave the player's thoughts, feelings, speech and actions to them.";

const voices = [
  {
    id: "fantasy",
    names: { en: "Fantasy", sv: "Fantasy", nb: "Fantasy" },
    direction: [
      "Ground classic fantasy in tactile detail and hints of old grandeur. Let existing tools, stone, weather and light have weight and texture. When magic is present, make its effects felt through sound, warmth, pressure or shadow.",
      "Let exploration and parley breathe. Use shorter, sharper sentences in danger. Clarify visibility, distance and what can be reached when it helps the player choose. Describe clues and reactions the player can observe. Leave room for the player to act without forcing a cliffhanger. List choices only if the player asks.",
    ],
  },
  {
    id: "scifi",
    names: { en: "Sci-fi", sv: "Sci-fi", nb: "Sci-fi" },
    direction: [
      "Make technology concrete through what the player can observe: instrument changes, vibration, heat or the delay in a reply. Use technical language only when it clarifies the situation.",
      "Ground wonder in scale and distance. Under pressure, describe the signal and its consequences before lingering on atmosphere. Leave unknown mechanisms uncertain until the scene supplies an explanation.",
    ],
  },
  {
    id: "noir",
    names: { en: "Noir", sv: "Noir", nb: "Noir" },
    direction: [
      "Use lean prose, concrete details and dialogue with room for subtext. Notice what someone hesitates to say and how an ordinary object catches the light.",
      "Let existing clues and contradictions carry the weight. Separate what can be observed from what a character suspects. Leave room for silence after a revealing line. Avoid explaining motives the player has yet to discover.",
    ],
  },
  {
    id: "contemporary",
    names: { en: "Contemporary", sv: "Nutid", nb: "Samtid" },
    direction: [
      "Write in plain, contemporary language. Ground the scene in ordinary tasks, familiar places and what people do with their hands, attention and time.",
      "Let small practical or social consequences matter. Use natural pauses and differences in register. Give a quiet exchange space to stay quiet. When a choice matters, make its immediate stakes easy to understand.",
    ],
  },
  {
    id: "horror",
    names: { en: "Horror", sv: "Skräck", nb: "Skrekk" },
    direction: [
      "Build unease through changes in familiar sounds, light or distance already present in the scene. Let the player register what is wrong before giving it an explanation.",
      "Keep exits and immediate threats legible when known. Vary the pace between waiting and discovery. Keep unknown causes open and use direct, brief prose when the danger becomes visible.",
    ],
  },
  {
    id: "romance",
    names: { en: "Romance", sv: "Romantik", nb: "Romantikk" },
    direction: [
      "Build intimacy through what people notice, remember and choose to share. Let words, timing and small gestures carry subtext. Treat silence, hesitation and a change of subject as meaningful without assigning them a motive.",
      "Give invitations and refusals room to land. Let trust and attraction develop at the pace established in the scene. Keep room for the player to answer in their own way.",
    ],
  },
  {
    id: "cozy",
    names: { en: "Cozy", sv: "Cozy", nb: "Koselig" },
    direction: [
      "Use warm, attentive prose. Find texture in ordinary routines, familiar materials and acts of care already present. Let small discoveries feel satisfying.",
      "Give the player room to explore, make something or simply listen. Treat friction as an occasion for curiosity or repair when the scene allows it. Let a small moment of rest be a complete beat.",
    ],
  },
] as const;

export function genreVoiceTemplates(language: ExampleLanguage): VoiceTemplate[] {
  return voices.map(({ id, names, direction }) =>
    VoiceTemplateSchema.parse({
      id: `example-voice-${id}`,
      name: names[language],
      instruction: [boundary, ...direction].join("\n\n"),
      source: "example",
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );
}
