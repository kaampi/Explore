import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type InterfaceLanguage = "en" | "sv" | "nb";
const STORAGE_KEY = "sandboxai:interface-language";
const labels = {
  en: {
    library: "My library",
    language: "English",
    space: "My space",
    conversations: "My conversations",
    ideas: "My ideas",
    characters: "Characters",
    lorebooks: "Lorebooks",
    places: "Worlds & places",
    adventures: "Adventures",
    guide: "Guide",
    settings: "Settings",
    continue: "Continue exploring",
    eyebrow: "YOUR CREATIVE SPACE",
    appearance: "Appearance & Themes",
    ai: "AI Settings",
    tagline: "Every story has more to discover.",
    themeLight: "Light",
    themeDark: "Dark",
    showPictureArchive: "Show picture archive",
    showingPictures: "Showing 3 of {count} pictures",
    pictureArchive: "Picture archive",
    pictureArchiveHint:
      "Drag pictures to change their order. The first picture becomes the default portrait.",
    noPicturesYet: "No pictures yet. Select + to add pictures.",
    voiceInstructionPlaceholder: "You are the Game Master…",
    startPathsLabel: "Choose how to begin",
    pathFreeKicker: "01 · FOLLOW YOUR CURIOSITY",
    pathFreeNote: "No rule-set required",
    pathFreeTitle: "Free play",
    pathFreeText:
      "A familiar face, an unexpected turn. Let the conversation lead, and shape the story as you go.",
    pathRulesKicker: "02 · LET THE DICE DECIDE",
    pathRulesNote: "Your story, with a system",
    pathRulesTitle: "With rules",
    pathRulesText:
      "Give your choices weight. Explore rule-sets where abilities, checks and consequences help shape what happens.",
    pathAdventureKicker: "03 · STEP INTO A STORY",
    pathAdventureNote: "Play freely or bring rules",
    pathAdventureTitle: "Adventure",
    pathAdventureText:
      "Places to discover. People with something to hide. Enter a prepared adventure and make it your own.",
    yourAdventures: "Your adventures",
    untitledAdventure: "Untitled adventure",
    noScenesYet: "No scenes yet",
    sceneOne: "{count} scene",
    sceneMany: "{count} scenes",
    playArrow: "Play →",
    noAdventuresYet: "No adventures yet. Build your first one.",
    moreInBuilder: "{count} more in the Adventure Builder.",
    openBuilder: "Open the Adventure Builder →",
    worldsWaiting: "Your worlds, waiting",
    manageWorlds: "Manage worlds & places ↗",
    worldsIntro: "Step into a place you've imagined, or follow a prepared adventure.",
    worldBadge: "WORLD",
    worldNoteEmpty: "There is more to discover here.",
    placeCount: "{count} places",
    preparedAdventure: "PREPARED ADVENTURE",
    adventureIntroEmpty: "Choose a scene and enter the story.",
    worldLater: "A world can come later.",
    worldLaterHint: "Start with a conversation, or build a setting in your library.",
    createWorld: "Create a world →",
    exploreWorldLink: "Explore this world…",
    exploreTitle: "Explore {name}",
    exploreIntro:
      "Every place on the map becomes somewhere you can go, and the world remembers what you do there. Nothing is added to your library.",
    yourName: "Your name",
    howYouLook: "How you look",
    whoYouAre: "Who you are",
    optional: "optional",
    startAt: "Start at",
    ruleSet: "Rule-set",
    basicRules: "Basic rules",
    noPlacesOnMap: "This world has no places on its map yet. Draw some first.",
    exploreButton: "Explore this world →",
    opening: "Opening…",
    lookingAround: "Looking around…",
    rememberThis: "Remember this",
    rememberedAt: "Remembered at {place}.",
    rememberedHeading: "Remembered",
    rememberedHint:
      "Lines you chose to keep. The story AI is told them whenever you are in that place.",
    forget: "Forget",
    hereMark: "here",
    yourWorld: "YOUR WORLD",
    yourAdventureEyebrow: "YOUR ADVENTURE",
    freePlayHint:
      "Look around, talk to people and move on when you like. The places you leave remember what happened, and your progress is saved.",
  },
  sv: {
    library: "Mitt bibliotek",
    language: "Svenska",
    space: "Min värld",
    conversations: "Mina konversationer",
    ideas: "Mina idéer",
    characters: "Karaktärer",
    lorebooks: "Loreböcker",
    places: "Världar och platser",
    adventures: "Äventyr",
    guide: "Guide",
    settings: "Inställningar",
    continue: "Fortsätt utforska",
    eyebrow: "DIN KREATIVA VÄRLD",
    appearance: "Utseende och teman",
    ai: "AI-inställningar",
    tagline: "Varje berättelse har mer att upptäcka.",
    themeLight: "Ljust",
    themeDark: "Mörkt",
    showPictureArchive: "Visa bildarkiv",
    showingPictures: "Visar 3 av {count} bilder",
    pictureArchive: "Bildarkiv",
    pictureArchiveHint:
      "Dra bilder för att ändra ordning. Den första bilden blir standardporträtt.",
    noPicturesYet: "Inga bilder ännu. Klicka på + för att lägga till bilder.",
    voiceInstructionPlaceholder: "Du är Spelledare…",
    startPathsLabel: "Välj hur du vill börja",
    pathFreeKicker: "01 · FÖLJ DIN NYFIKENHET",
    pathFreeNote: "Inget regelsystem behövs",
    pathFreeTitle: "Fritt spel",
    pathFreeText:
      "Ett bekant ansikte, en oväntad vändning. Låt samtalet leda och forma berättelsen allteftersom.",
    pathRulesKicker: "02 · LÅT TÄRNINGEN AVGÖRA",
    pathRulesNote: "Din berättelse, med ett system",
    pathRulesTitle: "Med regler",
    pathRulesText:
      "Ge dina val tyngd. Utforska regelsystem där förmågor, slag och följder hjälper till att forma det som händer.",
    pathAdventureKicker: "03 · STIG IN I EN BERÄTTELSE",
    pathAdventureNote: "Spela fritt eller ta med regler",
    pathAdventureTitle: "Äventyr",
    pathAdventureText:
      "Platser att upptäcka. Personer med något att dölja. Gå in i ett färdigt äventyr och gör det till ditt eget.",
    yourAdventures: "Dina äventyr",
    untitledAdventure: "Äventyr utan namn",
    noScenesYet: "Inga scener ännu",
    sceneOne: "{count} scen",
    sceneMany: "{count} scener",
    playArrow: "Spela →",
    noAdventuresYet: "Inga äventyr ännu. Bygg ditt första.",
    moreInBuilder: "{count} till i äventyrsbyggaren.",
    openBuilder: "Öppna äventyrsbyggaren →",
    worldsWaiting: "Dina världar väntar",
    manageWorlds: "Hantera världar och platser ↗",
    worldsIntro: "Kliv in på en plats du har föreställt dig, eller följ ett färdigt äventyr.",
    worldBadge: "VÄRLD",
    worldNoteEmpty: "Det finns mer att upptäcka här.",
    placeCount: "{count} platser",
    preparedAdventure: "FÄRDIGT ÄVENTYR",
    adventureIntroEmpty: "Välj en scen och gå in i berättelsen.",
    worldLater: "En värld kan komma senare.",
    worldLaterHint: "Börja med ett samtal, eller bygg en miljö i ditt bibliotek.",
    createWorld: "Skapa en värld →",
    exploreWorldLink: "Utforska den här världen…",
    exploreTitle: "Utforska {name}",
    exploreIntro:
      "Varje plats på kartan blir något du kan gå till, och världen minns vad du gör där. Inget läggs till i ditt bibliotek.",
    yourName: "Ditt namn",
    howYouLook: "Hur du ser ut",
    whoYouAre: "Vem du är",
    optional: "valfritt",
    startAt: "Börja vid",
    ruleSet: "Regelsystem",
    basicRules: "Grundregler",
    noPlacesOnMap: "Den här världen har inga platser på kartan ännu. Rita några först.",
    exploreButton: "Utforska den här världen →",
    opening: "Öppnar…",
    lookingAround: "Tittar sig omkring…",
    rememberThis: "Kom ihåg detta",
    rememberedAt: "Kom ihåg vid {place}.",
    rememberedHeading: "Ihågkommet",
    rememberedHint:
      "Rader du valt att behålla. Berättar-AI:n får veta dem så länge du är på den platsen.",
    forget: "Glöm",
    hereMark: "här",
    yourWorld: "DIN VÄRLD",
    yourAdventureEyebrow: "DITT ÄVENTYR",
    freePlayHint:
      "Se dig omkring, prata med människor och gå vidare när du vill. Platserna du lämnar minns vad som hände, och dina framsteg sparas.",
  },
  nb: {
    library: "Mitt bibliotek",
    language: "Norsk bokmål",
    space: "Mitt univers",
    conversations: "Mine samtaler",
    ideas: "Mine ideer",
    characters: "Karakterer",
    lorebooks: "Lorebøker",
    places: "Verdener og steder",
    adventures: "Eventyr",
    guide: "Guide",
    settings: "Innstillinger",
    continue: "Fortsett å utforske",
    eyebrow: "DITT KREATIVE UNIVERS",
    appearance: "Utseende og temaer",
    ai: "AI-innstillinger",
    tagline: "Hver fortelling har mer å oppdage.",
    themeLight: "Lyst",
    themeDark: "Mørkt",
    showPictureArchive: "Vis bildearkiv",
    showingPictures: "Viser 3 av {count} bilder",
    pictureArchive: "Bildearkiv",
    pictureArchiveHint:
      "Dra bilder for å endre rekkefølgen. Det første bildet blir standardportrett.",
    noPicturesYet: "Ingen bilder ennå. Trykk på + for å legge til bilder.",
    voiceInstructionPlaceholder: "Du er spilleder…",
    startPathsLabel: "Velg hvordan du vil begynne",
    pathFreeKicker: "01 · FØLG NYSGJERRIGHETEN",
    pathFreeNote: "Ingen regelsett nødvendig",
    pathFreeTitle: "Fritt spill",
    pathFreeText:
      "Et kjent ansikt, en uventet vending. La samtalen lede, og form historien underveis.",
    pathRulesKicker: "02 · LA TERNINGEN AVGJØRE",
    pathRulesNote: "Historien din, med et system",
    pathRulesTitle: "Med regler",
    pathRulesText:
      "Gi valgene dine tyngde. Utforsk regelsett der evner, slag og følger er med på å forme det som skjer.",
    pathAdventureKicker: "03 · STIG INN I EN FORTELLING",
    pathAdventureNote: "Spill fritt eller ta med regler",
    pathAdventureTitle: "Eventyr",
    pathAdventureText:
      "Steder å oppdage. Mennesker med noe å skjule. Gå inn i et ferdig eventyr og gjør det til ditt eget.",
    yourAdventures: "Dine eventyr",
    untitledAdventure: "Eventyr uten navn",
    noScenesYet: "Ingen scener ennå",
    sceneOne: "{count} scene",
    sceneMany: "{count} scener",
    playArrow: "Spill →",
    noAdventuresYet: "Ingen eventyr ennå. Bygg ditt første.",
    moreInBuilder: "{count} til i eventyrbyggeren.",
    openBuilder: "Åpne eventyrbyggeren →",
    worldsWaiting: "Verdenene dine venter",
    manageWorlds: "Administrer verdener og steder ↗",
    worldsIntro: "Gå inn på et sted du har forestilt deg, eller følg et ferdig eventyr.",
    worldBadge: "VERDEN",
    worldNoteEmpty: "Det er mer å oppdage her.",
    placeCount: "{count} steder",
    preparedAdventure: "FERDIG EVENTYR",
    adventureIntroEmpty: "Velg en scene og gå inn i fortellingen.",
    worldLater: "En verden kan komme senere.",
    worldLaterHint: "Begynn med en samtale, eller bygg et miljø i biblioteket ditt.",
    createWorld: "Lag en verden →",
    exploreWorldLink: "Utforsk denne verdenen…",
    exploreTitle: "Utforsk {name}",
    exploreIntro:
      "Hvert sted på kartet blir et sted du kan gå til, og verdenen husker hva du gjør der. Ingenting legges til i biblioteket ditt.",
    yourName: "Navnet ditt",
    howYouLook: "Hvordan du ser ut",
    whoYouAre: "Hvem du er",
    optional: "valgfritt",
    startAt: "Begynn ved",
    ruleSet: "Regelsett",
    basicRules: "Grunnregler",
    noPlacesOnMap: "Denne verdenen har ingen steder på kartet ennå. Tegn noen først.",
    exploreButton: "Utforsk denne verdenen →",
    opening: "Åpner…",
    lookingAround: "Ser seg omkring…",
    rememberThis: "Husk dette",
    rememberedAt: "Husket ved {place}.",
    rememberedHeading: "Husket",
    rememberedHint:
      "Linjer du har valgt å beholde. Fortelle-AI-en får vite dem så lenge du er på det stedet.",
    forget: "Glem",
    hereMark: "her",
    yourWorld: "VERDENEN DIN",
    yourAdventureEyebrow: "EVENTYRET DITT",
    freePlayHint:
      "Se deg omkring, snakk med folk og gå videre når du vil. Stedene du forlater husker hva som skjedde, og fremgangen din lagres.",
  },
} as const;
export type TranslationKey = Exclude<keyof typeof labels.en, "language">;
/** Values for {name} placeholders in a text. */
export type TranslationValues = Record<string, string | number>;
type Translate = (key: TranslationKey, values?: TranslationValues) => string;
type LanguageContextValue = {
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => void;
  t: Translate;
};

/** Look a text up in a language and fill in its {name} placeholders. */
export function translate(
  language: InterfaceLanguage,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const text: string = labels[language][key];
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Every text in every language, for tests that check the languages stay complete. */
export const allLabels = labels;
const LanguageContext = createContext<LanguageContextValue | null>(null);
function savedLanguage(): InterfaceLanguage {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "sv" || value === "nb" ? value : "en";
  } catch {
    return "en";
  }
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<InterfaceLanguage>(savedLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* Storage may be blocked */
    }
  }, [language]);
  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, t: (key, values) => translate(language, key, values) }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider");
  return value;
}
export const languageOptions: { value: InterfaceLanguage; label: string }[] = [
  { value: "en", label: labels.en.language },
  { value: "sv", label: labels.sv.language },
  { value: "nb", label: labels.nb.language },
];

/**
 * For components deep in the interface. Without a LanguageProvider (a test, a stand-alone
 * view) it gives English instead of failing.
 */
export function useTranslate(): Translate {
  const value = useContext(LanguageContext);
  return (key, values) => translate(value?.language ?? "en", key, values);
}
