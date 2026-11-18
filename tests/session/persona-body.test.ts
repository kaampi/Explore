import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import { PersonaSchema } from "../../src/game/AdventureSchema";
import { estimateTokens } from "../../src/context/tokenEstimate";

function start(extra: { anatomy?: string; factionIds?: string[] } = {}, withFactions = true) {
  const built = connectedAdventureExample();
  const edda = {
    ...built.characters[0]!,
    ...(extra.anatomy ? { anatomyTemplateId: extra.anatomy } : {}),
    ...(extra.factionIds ? { factionIds: extra.factionIds } : {}),
  };
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "persona-body",
    [built.realm],
    {
      characters: [edda],
      ...(withFactions ? { factions: [{ id: "guild", name: "Archivists' Guild" }] } : {}),
    },
  );
  return { session, eddaId: `npc:${edda.id}` };
}

const prompt = (session: ReturnType<typeof start>["session"], id: string) =>
  buildFreeReplyMessages(session, id, "Hello", [])
    .map((m) => m.content)
    .join("\n");

describe("a person's body and factions in an engine scene", () => {
  it("are written into the person when the game starts", () => {
    const { session, eddaId } = start({ anatomy: "builtin-arachnid", factionIds: ["guild"] });

    const persona = session.adventure!.cast[eddaId]!;

    expect(persona.body).toMatch(/^Arachnid: eight legs/);
    expect(persona.factions).toBe("Archivists' Guild");
    expect(PersonaSchema.parse(persona)).toEqual(persona);
  });

  it("reach the story AI's description of the person", () => {
    const { session, eddaId } = start({ anatomy: "builtin-arachnid", factionIds: ["guild"] });

    const text = prompt(session, eddaId);

    expect(text).toContain("Body: Arachnid: eight legs");
    expect(text).toContain("Belongs to: Archivists' Guild");
  });

  it("say nothing for an ordinary person, and an ordinary prompt is unchanged", () => {
    const { session, eddaId } = start();

    expect(session.adventure!.cast[eddaId]!.body).toBeUndefined();
    expect(session.adventure!.cast[eddaId]!.factions).toBeUndefined();
    const text = prompt(session, eddaId);
    expect(text).not.toContain("Body:");
    expect(text).not.toContain("Belongs to:");
  });

  it("skip a faction the library does not name, and stay short", () => {
    const { session, eddaId } = start({ anatomy: "builtin-arachnid", factionIds: ["gone"] }, false);

    expect(session.adventure!.cast[eddaId]!.factions).toBeUndefined();
    const added =
      estimateTokens(prompt(session, eddaId)) -
      estimateTokens(prompt(start().session, start().eddaId));
    expect(added).toBeLessThan(60);
  });

  it("let an older adventure open, since the fields are optional", () => {
    expect(PersonaSchema.parse({ name: "Old" })).toMatchObject({ name: "Old", personality: "" });
  });
});
