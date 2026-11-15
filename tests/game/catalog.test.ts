import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { publicCommands } from "../../src/game/catalog";
import { encounterCommands } from "../../src/game/intention";
import type { EncounterGame } from "../../src/game/EncounterSchema";

function messengerGame(): EncounterGame {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "catalog-test",
    [built.realm],
  );
  return structuredClone(session.encounter!);
}

describe("publicCommands", () => {
  it("numbers the actions a1, a2 and so on", () => {
    const commands = publicCommands(messengerGame());

    expect(commands.map((c) => c.ref)).toEqual(commands.map((_, i) => `a${i + 1}`));
  });

  it("never shows an opportunity whose conditions are not met", () => {
    const game = messengerGame();
    const secret = newOpportunity("Ask about the secret", "The secret.");
    secret.requiresFlags = ["knows-secret"];
    game.definition.interactions.push(secret);

    const before = publicCommands(game).map((c) => c.label);
    expect(before).not.toContain("Ask about the secret");

    game.state.flags.push("knows-secret");
    const after = publicCommands(game).map((c) => c.label);
    expect(after).toContain("Ask about the secret");
  });

  it("hides an opportunity once an excluding flag is set", () => {
    const game = messengerGame();
    const gone = newOpportunity("Ask while they are here", "Here.");
    gone.excludesFlags = ["left"];
    game.definition.interactions.push(gone);
    game.state.flags.push("left");

    expect(publicCommands(game).map((c) => c.label)).not.toContain("Ask while they are here");
  });

  it("keeps blocked actions and says why", () => {
    const game = messengerGame();
    const ask = game.definition.interactions[0]!;
    game.state.attempts.push(ask.id);

    const entry = publicCommands(game).find(
      (c) => c.action.kind === "interaction" && c.action.interactionId === ask.id,
    );

    expect(entry?.blocked).toMatch(/already resolved/i);
  });

  it("never puts ids, flags or other internals in what it exposes to a prompt", () => {
    const game = messengerGame();
    const ask = game.definition.interactions[0]!;
    const shown = JSON.stringify(
      publicCommands(game).map(({ ref, label, blocked }) => ({ ref, label, blocked })),
    );

    expect(shown).not.toContain(ask.id);
    expect(shown).not.toContain("done:");
    expect(shown).not.toContain("npc:");
  });

  it("is never longer than the full command list", () => {
    const game = messengerGame();

    expect(publicCommands(game).length).toBeLessThanOrEqual(encounterCommands(game).length);
  });
});
