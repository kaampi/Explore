import { PlaceBlueprintStudio } from "./PlaceBlueprintStudio";
import { FactionStudio } from "./FactionStudio";
import { MapLibrary } from "./MapLibrary";
import { LoreStudio } from "../lore/LoreStudio";
import { useState } from "react";
import type { IndexedDBRepository, StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { StudioView } from "./types";
import { CampaignStudio } from "./CampaignStudio";
import { AdventureStudio } from "./AdventureStudio";
import { AnatomyStudio } from "./AnatomyStudio";
import { CharacterStudio } from "./CharacterStudio";
import { ObjectStudio } from "./ObjectStudio";
import { VoiceStudio } from "./VoiceStudio";
import { StoryStudio } from "./StoryStudio";
import { RulesetStudio } from "./RulesetStudio";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { LibraryBackupBar } from "./LibraryBackupBar";

const NAV: { id: StudioView; label: string; group: "library" | "play" }[] = [
  { id: "lorebooks", label: "Lorebooks", group: "library" },
  { id: "characters", label: "Characters", group: "library" },
  { id: "anatomy", label: "Anatomy", group: "library" },
  { id: "place-templates", label: "Location templates", group: "library" },
  { id: "factions", label: "Factions", group: "library" },
  { id: "maps", label: "World Maps", group: "library" },
  { id: "objects", label: "Objects", group: "library" },
  { id: "voices", label: "Voices", group: "library" },
  { id: "stories", label: "Stories", group: "library" },
  { id: "rulesets", label: "Rule-sets", group: "library" },
  { id: "campaigns", label: "Campaigns", group: "play" }
];

export function StudioShell({
  sessionId,
  repo,
  resume,
  onStart,
  onViewChange,
  initialView = "campaigns"
}: {
  initialView?: StudioView;
  onViewChange?: (view: StudioView) => void;
  sessionId: string;
  repo: IndexedDBRepository;
  resume: StudioResume | null;
  onStart: (session: Session) => void;
}) {
  const [view, updateView] = useState<StudioView>(initialView === "places" ? "maps" : initialView);
  const [templateDirty,setTemplateDirty]=useState(false);
  function setView(next: StudioView) { if(next!==view&&templateDirty&&!confirm("Discard unsaved changes?"))return;if(next!==view)setTemplateDirty(false); const destination = next === "places" ? "maps" : next; updateView(destination); onViewChange?.(destination); }
  const [catalogTick, setCatalogTick] = useState(0);

  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Library">
        {[
          { title: "Characters & creatures", ids: ["characters", "anatomy"] },
          { title: "World", ids: ["place-templates", "maps", "factions", "objects", "lorebooks"] },
          { title: "Story & play", ids: ["voices", "stories", "rulesets"] },
        ].map(group => <div className="studio-nav-group" role="group" aria-label={group.title} key={group.title}>
          <span className="studio-nav-group__title">{group.title}</span>
          <div>{group.ids.map(id => { const item = NAV.find(entry => entry.id === id)!; return <button key={item.id} type="button" className={`studio-nav__tab ${view === item.id ? "studio-nav__tab--active" : ""}`} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}>{item.label}</button>; })}</div>
        </div>)}
        {["campaigns", "adventure"].includes(view) && <button type="button" className="studio-nav__tab studio-nav__tab--active" aria-current="page" onClick={() => setView("campaigns")}>Adventures</button>}
        <LibraryBackupBar repo={repo} onRestored={() => setCatalogTick((tick) => tick + 1)} />
      </nav>
      <div className="studio-body">
        <StudioErrorBoundary
          key={`${view}-${catalogTick}`}
          fallbackTitle="This screen failed. Pick another tab and try again."
          onReset={() => setView("campaigns")}
        >
          {view === "campaigns" && (
            <CampaignStudio
              sessionId={sessionId}
              repo={repo}
              resume={resume}
              onStart={onStart}
              onOpenShelf={setView}
              onOneOff={() => setView("adventure")}
            />
          )}
          {view === "adventure" && (
            <AdventureStudio sessionId={sessionId} repo={repo} onStart={onStart} onOpenShelf={setView} />
          )}
          {view === "lorebooks" && <LoreStudio repo={repo} />}
          {view === "characters" && <CharacterStudio repo={repo} />}
          {view === "anatomy" && <AnatomyStudio repo={repo} />}
          {view === "place-templates" && <PlaceBlueprintStudio repo={repo} onDirtyChange={setTemplateDirty} />}
          {view === "factions" && <FactionStudio repo={repo} onDirtyChange={setTemplateDirty} />}
          {view === "maps" && <MapLibrary repo={repo} />}
          {view === "objects" && <ObjectStudio repo={repo} />}
          {view === "voices" && <VoiceStudio repo={repo} />}
          {view === "stories" && <StoryStudio repo={repo} />}
          {view === "rulesets" && <RulesetStudio repo={repo} />}
        </StudioErrorBoundary>
      </div>
    </div>
  );
}

