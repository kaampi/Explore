import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type InterfaceLanguage = "en" | "sv" | "nb";
const STORAGE_KEY = "sandboxai:interface-language";
const labels = {
  en: { library: "My library", language: "English", space: "My space", conversations: "My conversations", ideas: "My ideas", characters: "Characters", lorebooks: "Lorebooks", places: "Worlds & places", adventures: "Adventures", guide: "Guide", settings: "Settings", continue: "Continue exploring", eyebrow: "YOUR CREATIVE SPACE", appearance: "Appearance & Themes", ai: "AI Settings", tagline: "Every story has more to discover.", themeLight: "Light", themeDark: "Dark" },
  sv: { library: "Mitt bibliotek", language: "Svenska", space: "Min värld", conversations: "Mina konversationer", ideas: "Mina idéer", characters: "Karaktärer", lorebooks: "Loreböcker", places: "Världar och platser", adventures: "Äventyr", guide: "Guide", settings: "Inställningar", continue: "Fortsätt utforska", eyebrow: "DIN KREATIVA VÄRLD", appearance: "Utseende och teman", ai: "AI-inställningar", tagline: "Varje berättelse har mer att upptäcka.", themeLight: "Ljust", themeDark: "Mörkt" },
  nb: { library: "Mitt bibliotek", language: "Norsk bokmål", space: "Mitt univers", conversations: "Mine samtaler", ideas: "Mine ideer", characters: "Karakterer", lorebooks: "Lorebøker", places: "Verdener og steder", adventures: "Eventyr", guide: "Guide", settings: "Innstillinger", continue: "Fortsett å utforske", eyebrow: "DITT KREATIVE UNIVERS", appearance: "Utseende og temaer", ai: "AI-innstillinger", tagline: "Hver fortelling har mer å oppdage.", themeLight: "Lyst", themeDark: "Mørkt" }
} as const;
export type TranslationKey = Exclude<keyof typeof labels.en, "language">;
type LanguageContextValue = { language: InterfaceLanguage; setLanguage: (language: InterfaceLanguage) => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);
function savedLanguage(): InterfaceLanguage {
  try { const value = localStorage.getItem(STORAGE_KEY); return value === "sv" || value === "nb" ? value : "en"; } catch { return "en"; }
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<InterfaceLanguage>(savedLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Storage may be blocked */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: (key) => labels[language][key] }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider");
  return value;
}
export const languageOptions: { value: InterfaceLanguage; label: string }[] = [
  { value: "en", label: labels.en.language }, { value: "sv", label: labels.sv.language }, { value: "nb", label: labels.nb.language }
];
