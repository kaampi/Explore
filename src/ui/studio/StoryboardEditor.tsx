import { useRef, useState, type ComponentProps } from "react";
import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import type { RealmTemplate } from "../../library/LibrarySchema";
import { adventureMapPlaces, chooseAdventureMap } from "../../library/adventureMap";
import { describeOpenWorld, scaffoldIntoAdventure } from "../../library/worldScaffold";
import { Modal } from "../components/Modal";
import { PlayableStoryboard } from "./PlayableStoryboard";
import { WorldMapStudio } from "./WorldMapStudio";

export function StoryboardEditor({
  onClose,
  error,
  notice,
  worlds,
  repo,
  onRefresh,
  ...props
}: ComponentProps<typeof PlayableStoryboard> & {
  onClose: () => void;
  error?: string | null;
  notice?: string | null;
  worlds?: RealmTemplate[];
  repo?: IndexedDBRepository;
  onRefresh?: () => Promise<unknown>;
}) {
  const [mapOpen, setMapOpen] = useState(false),
    [mapDirty, setMapDirty] = useState(false),
    [confirmMapClose, setConfirmMapClose] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [mapError, setMapError] = useState(""),
    [built, setBuilt] = useState("");
  const mapSave = useRef<(() => Promise<boolean>) | null>(null),
    world = worlds?.find((w) => w.id === props.campaign.mapWorldId),
    entries = props.campaign.mapWorldId ? adventureMapPlaces(world, props.places) : undefined;
  const mapWorldId = props.campaign.mapWorldId || props.campaign.realmId;
  const openWorldNote = world
    ? describeOpenWorld(props.campaign, world, {
        characters: props.characters,
        objects: props.objects,
        places: props.places,
        rulesets: props.rulesets ?? [],
      })
    : undefined;
  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    setMapError("");
    try {
      await onRefresh();
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "Could not refresh the map.");
    } finally {
      setRefreshing(false);
    }
  }
  /** Scenes and ways for the map's places that have none yet, added to the draft to write on. */
  async function buildFromMap() {
    if (!world) return;
    setRefreshing(true);
    setMapError("");
    setBuilt("");
    try {
      const [characters, objects, rulesets] = repo
        ? await Promise.all([repo.listCharacters(), repo.listObjects(), repo.listRulesets()])
        : [props.characters, props.objects, props.rulesets ?? []];
      const result = scaffoldIntoAdventure(props.campaign, world, {
        characters,
        objects,
        places: props.places,
        rulesets,
      });
      if (result.added > 0) props.onChange(result.campaign);
      setBuilt(
        result.added > 0
          ? `Added ${result.added} ${result.added === 1 ? "scene" : "scenes"} from the map.${
              result.reconnected.length
                ? ` New ways out were added from: ${result.reconnected.join(", ")}.`
                : ""
            }${result.skipped.length ? ` Left out: ${result.skipped.join("; ")}.` : ""}`
          : (result.skipped[0] ?? "Nothing to add."),
      );
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "Could not build scenes from the map.");
    } finally {
      setRefreshing(false);
    }
  }
  async function closeMap() {
    setMapOpen(false);
    setConfirmMapClose(false);
    setMapDirty(false);
    mapSave.current = null;
    await refresh();
  }
  return (
    <Modal
      title={`Storyboard Editor · ${props.campaign.name}`}
      wide
      onClose={() => {
        if (!props.busy && !refreshing) onClose();
      }}
    >
      <div className="storyboard-editor-window">
        {worlds && (
          <div className="storyboard-map-toolbar">
            <label>
              Adventure map
              <select
                aria-label="Adventure map"
                value={props.campaign.mapWorldId ?? ""}
                disabled={props.busy || refreshing}
                onChange={(e) => {
                  const selected = worlds.find((w) => w.id === e.target.value);
                  if (selected)
                    props.onChange(chooseAdventureMap(props.campaign, selected, props.places));
                }}
              >
                <option value="" disabled={!!props.campaign.mapWorldId}>
                  Not linked · choose a saved world map
                </option>
                {props.campaign.mapWorldId && !world && (
                  <option value={props.campaign.mapWorldId}>
                    Map unavailable — choose another
                  </option>
                )}
                {worlds
                  .filter((w) => w.worldMap || w.id === props.campaign.mapWorldId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {!w.worldMap && " · no map yet"}
                    </option>
                  ))}
              </select>
            </label>
            {repo && (
              <button
                type="button"
                disabled={props.busy || refreshing || !mapWorldId}
                onClick={() => {
                  setMapDirty(false);
                  setMapOpen(true);
                }}
              >
                Open Map Studio
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                disabled={props.busy || refreshing}
                onClick={() => void refresh()}
              >
                {refreshing ? "Refreshing…" : "Refresh map places"}
              </button>
            )}
            {world?.worldMap && (
              <button
                type="button"
                disabled={props.busy || refreshing}
                title="Adds a scene for every place on the map that has none, and the ways between them. Scenes you have already made are not changed."
                onClick={() => void buildFromMap()}
              >
                Build scenes from this map
              </button>
            )}
            <span>
              {entries
                ? `${entries.length} map places · includes places inside other places`
                : "Link a map to choose the world’s actual locations."}
            </span>
          </div>
        )}
        <PlayableStoryboard
          {...props}
          busy={props.busy || refreshing}
          places={entries ? entries.map((entry) => entry.place) : props.places}
          mapPlaces={entries}
          openWorldNote={openWorldNote}
          expanded
        />
        <footer className="storyboard-editor-status">
          {error || mapError ? (
            <span role="alert">{error || mapError}</span>
          ) : (
            <span role="status">
              {built ||
                notice ||
                "Right-click a scene, connection or empty workspace for actions. Closing keeps your draft; Save adventure stores it."}
            </span>
          )}
        </footer>
      </div>
      {mapOpen && repo && mapWorldId && (
        <Modal
          title={`Map Studio · ${worlds?.find((w) => w.id === mapWorldId)?.name ?? "World"}`}
          wide
          onClose={() => {
            if (mapDirty) setConfirmMapClose(true);
            else void closeMap();
          }}
        >
          <div className="map-studio-window">
            <WorldMapStudio
              repo={repo}
              initialWorldId={mapWorldId}
              onDirtyChange={setMapDirty}
              saveRef={mapSave}
            />
          </div>
        </Modal>
      )}
      {confirmMapClose && (
        <Modal
          title="Unsaved map changes"
          onClose={() => {
            if (!refreshing) setConfirmMapClose(false);
          }}
        >
          <p>Save the map before returning to Storyboard?</p>
          <div className="map-library__close-actions">
            <button
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  if (await mapSave.current?.()) await closeMap();
                } catch (e) {
                  setMapError(e instanceof Error ? e.message : "Could not save the map.");
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              Save & return
            </button>
            <button disabled={refreshing} onClick={() => void closeMap()}>
              Discard map changes
            </button>
            <button disabled={refreshing} onClick={() => setConfirmMapClose(false)}>
              Keep editing
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
