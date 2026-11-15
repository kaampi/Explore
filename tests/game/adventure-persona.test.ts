import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newVoiceTemplate } from "../../src/library/LibrarySchema";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { AdventureRunSchema } from "../../src/game/AdventureSchema";

function start(
  built = connectedAdventureExample(),
  sources?: Parameters<typeof startPlayableCampaign>[5],
) {
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "persona-test",
    [built.realm],
    sources,
  );
  return { built, run: session.adventure! };
}

describe("adventure cast and narration", () => {
  it("carries what the author wrote about each person", () => {
    const built = connectedAdventureExample();
    const edda = { ...built.characters[0]!, personality: "Watchful.", speech: "Short sentences." };

    const { run } = start(built, { characters: [edda] });

    expect(run.cast[`npc:${edda.id}`]).toMatchObject({
      name: edda.name,
      personality: "Watchful.",
      speech: "Short sentences.",
    });
  });

  it("cuts long fields to 600 characters", () => {
    const built = connectedAdventureExample();
    const edda = { ...built.characters[0]!, personality: "x".repeat(2000) };

    const { run } = start(built, { characters: [edda] });

    expect(run.cast[`npc:${edda.id}`]!.personality).toHaveLength(600);
  });

  it("carries the narrator voice and background story", () => {
    const built = connectedAdventureExample();
    built.campaign.startPrompt = "A quiet village before a storm.";
    const voice = newVoiceTemplate({
      name: "Plain",
      instruction: "Tell it plainly.",
      source: "player",
    });
    built.campaign.voiceId = voice.id;
    const session = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "voice-test",
      [built.realm],
      { characters: built.characters, voices: [voice] },
    );

    expect(session.adventure!.narration).toEqual({
      voice: "Tell it plainly.",
      background: "A quiet village before a storm.",
      freeReplies: true,
    });
  });

  it("has no cast and no voice when nothing was supplied", () => {
    const { run } = start();

    expect(run.cast).toEqual({});
    expect(run.narration?.voice).toBeUndefined();
  });

  it("opens an older run that has neither field", () => {
    const built = connectedAdventureExample();
    const { run } = start(built, { characters: built.characters });
    const older = JSON.parse(JSON.stringify(run));
    delete older.cast;
    delete older.narration;

    const loaded = AdventureRunSchema.parse(older);

    expect(loaded.cast).toEqual({});
    expect(loaded.narration).toBeUndefined();
  });
});
