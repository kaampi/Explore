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
    {
      label: t("navImportLore"),
      current: view === "import-lore",
      onSelect: () => openStudio("import-lore"),
    },
    { kind: "separator" },
    {
      label: t("navExportLibrary"),
      disabled: backup.busy,
      onSelect: () => void backup.exportLibrary(),
    },
    { label: t("navImportBackup"), disabled: backup.busy, onSelect: backup.chooseBackup },
  ];
  const inAdventures = view === "campaigns" || view === "adventure";
  const build: MenuItem[] = [
    { label: t("adventures"), current: inAdventures, onSelect: () => openStudio("campaigns") },
  ];
  for (const { title, entries } of buildGroups) {
    build.push({ kind: "separator" }, { kind: "heading", label: t(title) });
    for (const [destination, label] of entries)
      build.push({
        label: t(label),
        current: view === destination,
        onSelect: () => openStudio(destination),
      });
  }
  const inBuild =
    inAdventures ||
    buildGroups.some(({ entries }) => entries.some(([destination]) => destination === view));

  return (
    <nav className="sb-main-nav" aria-label={t("navExplore")}>
      <MenuButton
        bare
        label={t("navFile")}
        items={file}
        current={view === "import-lore"}
        menuClassName="ui-menu--top-nav"
      >
        {t("navFile")} <span className="sb-main-nav__chevron" aria-hidden="true" />
      </MenuButton>
      <MenuButton
        bare
        label={t("navBuild")}
        items={build}
        current={inBuild}
        menuClassName="ui-menu--top-nav"
      >
        {t("navBuild")} <span className="sb-main-nav__chevron" aria-hidden="true" />
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
