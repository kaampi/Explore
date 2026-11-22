import { CutsceneLibrary, CutsceneLibraryProvider } from "../cutscenes/CutsceneLibrary";
import { PlaceBlueprintStudio } from "./PlaceBlueprintStudio";
import { FactionStudio } from "./FactionStudio";
import { MapLibrary } from "./MapLibrary";
import { LoreStudio } from "../lore/LoreStudio";
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

export function StudioShell({
  sessionId,
  repo,
  resume,
  onStart,
  onViewChange,
  onDirtyChange,
  view,
}: {
  view: StudioView;
  onViewChange: (view: StudioView) => void;
  onDirtyChange: (dirty: boolean) => void;
  sessionId: string;
  repo: IndexedDBRepository;
  resume: StudioResume | null;
  onStart: (session: Session) => void;
}) {
  return (
    <CutsceneLibraryProvider repo={repo}>
      <div className="studio">
        <div className="studio-body">
          <StudioErrorBoundary
            key={view}
            fallbackTitle="This screen failed. Choose another screen from Build and try again."
            onReset={() => onViewChange("campaigns")}
          >
            {view === "campaigns" && (
              <CampaignStudio
                sessionId={sessionId}
                repo={repo}
                resume={resume}
                onStart={onStart}
                onOpenShelf={onViewChange}
                onOneOff={() => onViewChange("adventure")}
              />
            )}
            {view === "adventure" && (
              <AdventureStudio
                sessionId={sessionId}
                repo={repo}
                onStart={onStart}
                onOpenShelf={onViewChange}
              />
            )}
            {(view === "lorebooks" || view === "import-lore") && (
              <LoreStudio
                repo={repo}
                importing={view === "import-lore"}
                onDirtyChange={onDirtyChange}
              />
            )}
            {view === "characters" && <CharacterStudio repo={repo} />}
            {view === "anatomy" && <AnatomyStudio repo={repo} />}
            {view === "place-templates" && (
              <PlaceBlueprintStudio repo={repo} onDirtyChange={onDirtyChange} />
            )}
            {view === "factions" && <FactionStudio repo={repo} onDirtyChange={onDirtyChange} />}
            {view === "maps" && <MapLibrary repo={repo} />}
            {view === "objects" && <ObjectStudio repo={repo} />}
            {view === "voices" && <VoiceStudio repo={repo} />}
            {view === "stories" && <StoryStudio repo={repo} />}
            {view === "cutscenes" && <CutsceneLibrary repo={repo} onDirtyChange={onDirtyChange} />}
            {view === "rulesets" && <RulesetStudio repo={repo} />}
          </StudioErrorBoundary>
        </div>
      </div>
    </CutsceneLibraryProvider>
  );
}
