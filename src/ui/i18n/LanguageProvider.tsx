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
