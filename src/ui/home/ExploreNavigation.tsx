import { MenuButton, type MenuItem } from "../components/Menu";
import { useTranslate, type TranslationKey } from "../i18n/LanguageProvider";
import type { StudioView } from "../studio/types";

const buildGroups = [
  {
    title: "navCharacters",
    entries: [
      ["characters", "characters"],
      ["anatomy", "navAnatomy"],
    ],
  },
  {
    title: "navWorld",
    entries: [
      ["place-templates", "navLocationTemplates"],
      ["maps", "navWorldMaps"],
      ["factions", "navFactions"],
      ["objects", "navObjects"],
      ["lorebooks", "lorebooks"],
    ],
  },
  {
    title: "navStory",
    entries: [
      ["voices", "navVoices"],
      ["stories", "navStories"],
      ["cutscenes", "cutsceneShelf"],
      ["rulesets", "navRulesets"],
    ],
  },
] as const satisfies readonly {
  title: TranslationKey;
  entries: readonly (readonly [StudioView, TranslationKey])[];
}[];

export function ExploreNavigation({
  view,
  openStudio,
  onIdeas,
  onConversations,
  onContinue,
  resumeDisabled,
  backup,
}: {
  view: StudioView | "home" | "ideas" | "conversations" | "guide";
  openStudio: (view: StudioView) => void;
  onIdeas: () => void;
  onConversations: () => void;
  onContinue: (() => void) | undefined;
  resumeDisabled: boolean;
  backup: { busy: boolean; exportLibrary: () => Promise<void>; chooseBackup: () => void };
}) {
  const t = useTranslate();
  const file: MenuItem[] = [
    { label: t("navImportLore"), onSelect: () => openStudio("import-lore") },
    { kind: "separator" },
    {
      label: t("navExportLibrary"),
      disabled: backup.busy,
      onSelect: () => void backup.exportLibrary(),
    },
    { label: t("navImportBackup"), disabled: backup.busy, onSelect: backup.chooseBackup },
  ];
  const build: MenuItem[] = [{ label: t("adventures"), onSelect: () => openStudio("campaigns") }];
  for (const { title, entries } of buildGroups) {
    build.push({ kind: "separator" }, { kind: "heading", label: t(title) });
    for (const [destination, label] of entries)
      build.push({ label: t(label), onSelect: () => openStudio(destination) });
  }
  const inBuild =
    view === "campaigns" ||
    view === "adventure" ||
    buildGroups.some(({ entries }) => entries.some(([destination]) => destination === view));

  return (
    <nav className="sb-main-nav" aria-label={t("navExplore")}>
      <MenuButton bare label={t("navFile")} items={file} current={view === "import-lore"}>
        {t("navFile")} <span aria-hidden="true">⌄</span>
      </MenuButton>
      <MenuButton bare label={t("navBuild")} items={build} current={inBuild}>
        {t("navBuild")} <span aria-hidden="true">⌄</span>
      </MenuButton>
      <button type="button" aria-current={view === "ideas" ? "page" : undefined} onClick={onIdeas}>
        {t("ideas")}
      </button>
      <button
        type="button"
        aria-current={view === "conversations" ? "page" : undefined}
        onClick={onConversations}
      >
        {t("conversations")}
      </button>
      {onContinue && (
        <button type="button" disabled={resumeDisabled} onClick={onContinue}>
          {t("continue")}
        </button>
      )}
    </nav>
  );
}
