import { useState } from "react";
import type { IndexedDBRepository, StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { StudioView } from "./types";
import { CampaignStudio } from "./CampaignStudio";
import { AdventureStudio } from "./AdventureStudio";
import { CharacterStudio } from "./CharacterStudio";
import { PlaceStudio } from "./PlaceStudio";
import { ObjectStudio } from "./ObjectStudio";
import { VoiceStudio } from "./VoiceStudio";
import { StoryStudio } from "./StoryStudio";
import { RulesetStudio } from "./RulesetStudio";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { LibraryBackupBar } from "./LibraryBackupBar";

const NAV: { id: StudioView; label: string; group: "library" | "play" }[] = [
  { id: "characters", label: "Characters", group: "library" },
  { id: "places", label: "Locations", group: "library" },
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
  onStart
}: {
  sessionId: string;
  repo: IndexedDBRepository;
  resume: StudioResume | null;
  onStart: (session: Session) => void;
}) {
  const [view, setView] = useState<StudioView>("campaigns");
  const [catalogTick, setCatalogTick] = useState(0);

  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Library">
        <span className="studio-nav__brand">AI SANDBOX ENGINE</span>
        {NAV.filter((item) => item.group === "library").map((item) => (
          <button
            key={item.id}
            type="button"
            className={`studio-nav__tab ${view === item.id ? "studio-nav__tab--active" : ""}`}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="studio-nav__rule" />
        {NAV.filter((item) => item.group === "play").map((item) => (
          <button
            key={item.id}
            type="button"
            className={`studio-nav__tab ${view === item.id ? "studio-nav__tab--active" : ""}`}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
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
          {view === "characters" && <CharacterStudio repo={repo} />}
          {view === "places" && <PlaceStudio repo={repo} />}
          {view === "objects" && <ObjectStudio repo={repo} />}
          {view === "voices" && <VoiceStudio repo={repo} />}
          {view === "stories" && <StoryStudio repo={repo} />}
          {view === "rulesets" && <RulesetStudio repo={repo} />}
        </StudioErrorBoundary>
      </div>
    </div>
  );
}
