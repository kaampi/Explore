import { useMemo, useRef, useState, type ComponentProps } from "react";
import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import type { RealmTemplate } from "../../library/LibrarySchema";
import { adventureMapPlaces, chooseAdventureMap } from "../../library/adventureMap";
import { describeOpenWorld, scaffoldIntoAdventure } from "../../library/worldScaffold";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
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
  const t = useTranslate();
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
  // Worked out again only when the adventure, the map or the cards change, not on every redraw.
  const openWorldNote = useMemo(
    () =>
      world
        ? describeOpenWorld(props.campaign, world, {
            characters: props.characters,
            objects: props.objects,
            places: props.places,
            rulesets: props.rulesets ?? [],
          })
        : undefined,
    [world, props.campaign, props.characters, props.objects, props.places, props.rulesets],
  );
  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    setMapError("");
    try {
      await onRefresh();
    } catch (e) {
      setMapError(e instanceof Error ? e.message : t("seCouldNotRefresh"));
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
          ? `${t(result.added === 1 ? "seAddedOne" : "seAddedMany", { count: result.added })}${
              result.reconnected.length
                ? t("seNewWaysOut", { names: result.reconnected.join(", ") })
                : ""
            }${result.skipped.length ? t("seLeftOut", { list: result.skipped.join("; ") }) : ""}`
          : (result.skipped[0] ?? t("seNothingToAdd")),
      );
    } catch (e) {
      setMapError(e instanceof Error ? e.message : t("seCouldNotBuild"));
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
      title={t("seTitle", { name: props.campaign.name })}
      wide
      onClose={() => {
        if (!props.busy && !refreshing) onClose();
      }}
    >
      <div className="storyboard-editor-window">
        {worlds && (
          <div className="storyboard-map-toolbar">
            <label>
              {t("seAdventureMap")}
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
                  {t("seNotLinked")}
                </option>
                {props.campaign.mapWorldId && !world && (
                  <option value={props.campaign.mapWorldId}>{t("seMapUnavailable")}</option>
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
                {t("seOpenMapStudio")}
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                disabled={props.busy || refreshing}
                onClick={() => void refresh()}
              >
                {refreshing ? t("seRefreshing") : t("seRefreshPlaces")}
              </button>
            )}
            {world?.worldMap && (
              <button
                type="button"
                disabled={props.busy || refreshing}
                title={t("seBuildTitle")}
                onClick={() => void buildFromMap()}
              >
                {t("seBuildScenes")}
              </button>
            )}
            <span>{entries ? t("seMapPlaces", { count: entries.length }) : t("seLinkMap")}</span>
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
            <span role="status">{built || notice || t("seFooterHint")}</span>
          )}
        </footer>
      </div>
      {mapOpen && repo && mapWorldId && (
        <Modal
          title={t("seMapStudioTitle", {
            name: worlds?.find((w) => w.id === mapWorldId)?.name ?? t("seWorld"),
          })}
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
          title={t("seUnsaved")}
          onClose={() => {
            if (!refreshing) setConfirmMapClose(false);
          }}
        >
          <p>{t("seSaveBefore")}</p>
          <div className="map-library__close-actions">
            <button
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  if (await mapSave.current?.()) await closeMap();
                } catch (e) {
                  setMapError(e instanceof Error ? e.message : t("seCouldNotSave"));
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {t("seSaveReturn")}
            </button>
            <button disabled={refreshing} onClick={() => void closeMap()}>
              {t("seDiscard")}
            </button>
            <button disabled={refreshing} onClick={() => setConfirmMapClose(false)}>
              {t("seKeepEditing")}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
