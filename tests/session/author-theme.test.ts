import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { authorThemeFor } from "../../src/session/authorTheme";
import { sessionFromCampaignScene } from "../../src/session/campaignStart";
import { CampaignTemplateSchema, RealmTemplateSchema } from "../../src/library/LibrarySchema";
import { PlayThemeSchema, PRESET_THEMES } from "../../src/ui/themes/theme";
import { activatePlayTheme, applyPlayTheme } from "../../src/ui/themes/conversationTheme";
import { defaultThemeLibrary } from "../../src/ui/themes/theme";

const fantasy = PRESET_THEMES.find((theme) => theme.id === "fantasy")!;
const scifi = PRESET_THEMES.find((theme) => theme.id === "scifi")!;
const quiet = PRESET_THEMES.find((theme) => theme.id === "quiet")!;

function example() {
  const built = connectedAdventureExample();
  const start = (overrides: { campaign?: object; realm?: object } = {}, id = "author") => {
    const campaign = { ...built.campaign, ...overrides.campaign } as typeof built.campaign;
    const realm = { ...built.realm, ...overrides.realm } as typeof built.realm;
    return startPlayableCampaign(campaign, campaign.scenes[0]!, built.places, id, [realm], {
      characters: built.characters,
    });
  };
  return { built, start };
}

describe("authorThemeFor", () => {
  it("is the adventure's theme first, then the world's, and none when neither has one", () => {
    const { built } = example();
    const realm = { ...built.realm, theme: scifi };
    const campaign = { ...built.campaign, theme: fantasy };

    expect(authorThemeFor(campaign, [realm])).toEqual(fantasy);
    expect(authorThemeFor({ ...campaign, theme: undefined }, [realm])).toEqual(scifi);
    expect(authorThemeFor({ ...built.campaign }, [built.realm])).toBeUndefined();
    expect(authorThemeFor({ ...built.campaign }, [])).toBeUndefined();
  });

  it("finds the world by the adventure's world, by its map, or by the place it starts in", () => {
    const { built } = example();
    const realm = { ...built.realm, theme: scifi };
    const bare = { ...built.campaign, theme: undefined };
    expect(authorThemeFor({ ...bare, realmId: realm.id }, [realm])).toEqual(scifi);
    expect(authorThemeFor({ ...bare, realmId: undefined, mapWorldId: realm.id }, [realm])).toEqual(
      scifi,
    );
    expect(
      authorThemeFor({ ...bare, realmId: undefined, mapWorldId: undefined }, [realm], {
        realmId: realm.id,
      }),
    ).toEqual(scifi);
    // Another world's theme is not used.
    expect(authorThemeFor({ ...bare, realmId: "elsewhere" }, [realm])).toBeUndefined();
  });
});

describe("a game that starts", () => {
  it("keeps the adventure's theme, else the world's, else none", () => {
    const { start } = example();
    expect(start({ campaign: { theme: fantasy }, realm: { theme: scifi } }).authorTheme).toEqual(
      fantasy,
    );
    expect(start({ realm: { theme: scifi } }).authorTheme).toEqual(scifi);
    expect(start().authorTheme).toBeUndefined();
  });

  it("also in the chat track's way of starting from a scene", () => {
    const { built } = example();
    const args = {
      campaign: { ...built.campaign, theme: fantasy },
      scene: built.campaign.scenes[0]!,
      places: built.places,
      realms: [built.realm],
      characters: built.characters,
      objects: built.objects,
      voices: [],
      rulesets: [],
    };
    const started = sessionFromCampaignScene(args, "chat-track");
    expect(started.ok && started.session.authorTheme).toEqual(fantasy);
  });
});

describe("the theme on an adventure and on a world", () => {
  it("is saved as written, checked as a theme, and absent in an older template", () => {
    const { built } = example();
    const campaign = CampaignTemplateSchema.parse({ ...built.campaign, theme: fantasy });
    expect(campaign.theme).toEqual(fantasy);
    const realm = RealmTemplateSchema.parse({ ...built.realm, theme: scifi });
    expect(realm.theme).toEqual(scifi);
    expect(CampaignTemplateSchema.parse(built.campaign).theme).toBeUndefined();
    expect(RealmTemplateSchema.parse(built.realm).theme).toBeUndefined();
    // A theme with a colour that is not a colour is refused, so it cannot carry anything else.
    expect(() =>
      CampaignTemplateSchema.parse({ ...built.campaign, theme: { ...fantasy, accent: "red" } }),
    ).toThrow();
    expect(PlayThemeSchema.parse(fantasy)).toEqual(fantasy);
  });
});

describe("which look a game has", () => {
  it("is the author's the first time, and the player's default is not replaced by it", () => {
    const library = defaultThemeLibrary();
    const active = activatePlayTheme(library, "game-1", fantasy);

    expect(active.active).toEqual(fantasy);
    expect(active.conversations["game-1"]).toEqual(fantasy);
    // The player's own default is what it was.
    expect(active.defaultPlay).toEqual(library.active);
    // Another game with no author's look has the player's default.
    expect(activatePlayTheme(active, "game-2").active).toEqual(library.active);
  });

  it("lets the player change it while playing, and the change stays when the game is opened again", () => {
    let library = activatePlayTheme(defaultThemeLibrary(), "game-1", fantasy);
    library = applyPlayTheme(library, quiet, "game-1");
    expect(library.active).toEqual(quiet);

    // Leave, and come back with the same author's theme to hand: the player's choice wins.
    library = activatePlayTheme(library, null);
    expect(library.active).not.toEqual(quiet);
    library = activatePlayTheme(library, "game-1", fantasy);
    expect(library.active).toEqual(quiet);
    expect(library.conversations["game-1"]).toEqual(quiet);
  });

  it("is not the author's in a game already begun before the author gave it one", () => {
    const library = activatePlayTheme(defaultThemeLibrary(), "old-game");
    const opened = activatePlayTheme(library, "old-game", fantasy);
    expect(opened.conversations["old-game"]).toEqual(library.conversations["old-game"]);
    expect(opened.active).not.toEqual(fantasy);
  });

  it("uses no author's look outside a game", () => {
    const library = defaultThemeLibrary();
    expect(activatePlayTheme(library, null, fantasy).active).toEqual(library.active);
  });
});
