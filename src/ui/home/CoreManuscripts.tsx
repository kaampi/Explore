import { useTranslate } from "../i18n/LanguageProvider";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createCoreManuscriptReader } from "../../integrations/coreManuscriptReader";
import { useState } from "react";
import { Modal } from "../components/Modal";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { copyCoreCharacter } from "../../integrations/coreBible";
import type { CoreBibleSection, CoreBibleEntity } from "../../integrations/coreBibleSchema";
import { portraitSrc } from "../studio/portrait";
import type { CharacterTemplate, ObjectTemplate, PlaceTemplate } from "@library/LibrarySchema";
import type { Faction } from "@library/factions";
import { addEventDrafts, updateEventDraft, type DraftChange } from "../../integrations/coreEvents";
import { newCampaignTemplate, type CampaignTemplate } from "@library/LibrarySchema";
import {
  IMPORTABLE_KINDS,
  importManuscriptBatch,
  importableEntries,
} from "../../integrations/coreBatch";
import {
  applyCoreEntityChanges,
  copyCoreEntity,
  manuscriptWorld,
  reviewCoreEntity,
  sameCoreEntity,
  type CoreEntityKind,
} from "../../integrations/coreEntities";
import {
  applyCoreCharacterChanges,
  reviewCoreCharacter,
  sameCoreCharacter,
  type CoreCharacterChange,
} from "../../integrations/coreCharacterUpdates";

type Entry = {
  workspaceId: string;
  projectId: string;
  title: string;
  language: string;
  translationGroupId: string;
  revision: number;
  updatedAt: string;
};
type Chapter = { id: string; title: string; prose: string };
type SharedManuscript = Entry & {
  manuscript: { title: string; synopsis: string; chapters: Chapter[]; bible: CoreBibleSection[] };
};

async function read<T>(path: string): Promise<T> {
  if (isTauri()) {
    const reader = createCoreManuscriptReader(undefined, fetch, (corePath) =>
      invoke("core_read", { path: corePath }),
    );
    return (
      path === "/api/core/manuscripts"
        ? await reader.catalog()
        : await reader.manuscript(path.slice("/api/core/manuscripts/".length))
    ) as T;
  }
  const response = await fetch(path, { credentials: "omit", cache: "no-store" });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error((data as { error?: string }).error ?? "Could not reach kaampi Codex.");
  return data as T;
}

export function CoreManuscripts({ repo }: { repo: IndexedDBRepository }) {
  const t = useTranslate();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<SharedManuscript | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [review, setReview] = useState<{
    kind: "characters" | CoreEntityKind;
    character: CharacterTemplate | PlaceTemplate | ObjectTemplate | Faction;
    entity: CoreBibleEntity;
    changes: CoreCharacterChange[];
  } | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [draftEvents, setDraftEvents] = useState<Set<string> | null>(null);
  const [draftTarget, setDraftTarget] = useState("new");
  const [adventures, setAdventures] = useState<CampaignTemplate[]>([]);
  const [changedDrafts, setChangedDrafts] = useState<{
    campaignId: string;
    items: DraftChange[];
  } | null>(null);

  async function refresh() {
    setBusy(true);
    setError("");
    setSelected(null);
    setImportNotice("");
    try {
      setEntries(await read<Entry[]>("/api/core/manuscripts"));
    } catch (reason) {
      setEntries(null);
      setError(reason instanceof Error ? reason.message : "Could not reach kaampi Codex.");
    } finally {
      setBusy(false);
    }
  }
  async function open(entry: Entry) {
    setBusy(true);
    setError("");
    setImportNotice("");
    try {
      setSelected(await read<SharedManuscript>(`/api/core/manuscripts/${entry.workspaceId}`));
    } catch (reason) {
      setSelected(null);
      setError(reason instanceof Error ? reason.message : "Could not read this manuscript.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(entity: CoreBibleEntity, kind: "characters" | CoreEntityKind) {
    if (!selected || importing) return;
    setImporting(true);
    setImportNotice("");
    try {
      const origin = {
        workspaceId: selected.workspaceId,
        projectId: selected.projectId,
        revision: selected.revision,
      };
      const here = { ...origin, entityRef: entity.entity_ref };
      const existing: CharacterTemplate | PlaceTemplate | ObjectTemplate | Faction | undefined =
        kind === "characters"
          ? (await repo.listCharacters()).find((person) => sameCoreCharacter(person, here))
          : kind === "locations"
            ? (await repo.listPlaces()).find((card) => sameCoreEntity(card, here))
            : kind === "objects"
              ? (await repo.listObjects()).find((card) => sameCoreEntity(card, here))
              : (await repo.listFactions()).find((card) => sameCoreEntity(card, here));
      if (existing) {
        if (!existing.coreSnapshot) {
          setImportNotice(
            "This older copy has no comparison history. Your local card was preserved; automatic comparison is unavailable.",
          );
          return;
        }
        if (origin.revision < existing.coreOrigin!.revision) {
          setImportNotice("This manuscript version is older than your local copy.");
          return;
        }
        const changes =
          kind === "characters"
            ? reviewCoreCharacter(
                existing as CharacterTemplate,
                (existing as CharacterTemplate).coreSnapshot!,
                entity,
              )
            : reviewCoreEntity(
                existing as PlaceTemplate | ObjectTemplate | Faction,
                kind,
                existing.coreSnapshot as { name: string; text: string },
                entity,
              );
        setApproved([]);
        setReview(changes.length ? { kind, character: existing, entity, changes } : null);
        setImportNotice(
          changes.length
            ? "Select the facts you want to update."
            : `${entity.name} has no new facts to review.`,
        );
        return;
      }
      if (kind === "characters") {
        const local = copyCoreCharacter(entity, origin);
        await repo.saveCharacter(local);
        setImportNotice(
          `${local.name} was copied to your kaampi Explore character library. kaampi Write was not changed.`,
        );
      } else if (kind === "locations") {
        const { realm, created } = manuscriptWorld(
          await repo.listRealms(),
          origin,
          selected.manuscript.title,
        );
        if (created) await repo.saveRealm(realm);
        const place = copyCoreEntity(kind, entity, origin, { realmId: realm.id });
        await repo.savePlace(place);
        setImportNotice(
          `${place.name} was copied into the world “${realm.name}”. kaampi Write was not changed.`,
        );
      } else if (kind === "objects") {
        const thing = copyCoreEntity(kind, entity, origin);
        await repo.saveObject(thing);
        setImportNotice(`${thing.name} was copied to your things. kaampi Write was not changed.`);
      } else {
        const faction = copyCoreEntity(kind, entity, origin);
        await repo.saveFaction(faction);
        setImportNotice(
          `${faction.name} was copied to your factions. kaampi Write was not changed.`,
        );
      }
    } catch (reason) {
      setImportNotice(reason instanceof Error ? reason.message : "Could not copy this.");
    } finally {
      setImporting(false);
    }
  }
  /** Turn the chosen events into scene drafts, last in an adventure the author chooses. */
  async function createDrafts() {
    if (!selected || !draftEvents || importing) return;
    setImporting(true);
    setImportNotice("");
    try {
      const [campaigns, characters, places, objects] = await Promise.all([
        repo.listCampaigns(),
        repo.listCharacters(),
        repo.listPlaces(),
        repo.listObjects(),
      ]);
      const events = selected.manuscript.bible
        .filter((section) => section.kind === "events")
        .flatMap((section) => section.entities);
      const target =
        draftTarget === "new"
          ? newCampaignTemplate({ name: selected.manuscript.title.trim() || "Manuscript" })
          : campaigns.find((item) => item.id === draftTarget);
      if (!target) throw new Error("That adventure is gone. Choose another.");
      const result = addEventDrafts({
        campaign: target,
        title: selected.manuscript.title,
        events,
        chosen: draftEvents,
        source: {
          workspaceId: selected.workspaceId,
          projectId: selected.projectId,
          revision: selected.revision,
        },
        library: { characters, places, objects },
      });
      if (result.added > 0 || draftTarget === "new") await repo.saveCampaign(result.campaign);
      setImportNotice(
        `${result.added} scene draft${result.added === 1 ? "" : "s"} added to “${result.campaign.name}”.${
          result.alreadyThere.length
            ? ` Already there, left as they are: ${result.alreadyThere.join(", ")}.`
            : ""
        }${result.changed.length ? ` ${result.changed.length} changed in the manuscript; review them below.` : ""}${
          result.clipped ? ` ${result.clipped} more were left out; one import takes 100.` : ""
        } kaampi Write was not changed.`,
      );
      setChangedDrafts(
        result.changed.length ? { campaignId: result.campaign.id, items: result.changed } : null,
      );
      setDraftEvents(null);
    } catch (reason) {
      setImportNotice(reason instanceof Error ? reason.message : "Could not create the drafts.");
    } finally {
      setImporting(false);
    }
  }
  /** Bring one draft's notes up to date from the newer manuscript, or keep them as they are. */
  async function updateDraft(change: DraftChange, update: boolean) {
    if (!selected || !changedDrafts || importing) return;
    setImporting(true);
    try {
      if (update) {
        const [campaigns, characters, places, objects] = await Promise.all([
          repo.listCampaigns(),
          repo.listCharacters(),
          repo.listPlaces(),
          repo.listObjects(),
        ]);
        const target = campaigns.find((item) => item.id === changedDrafts.campaignId);
        const scene = target?.scenes.find((item) => item.id === change.sceneId);
        if (!target || !scene) throw new Error("That scene is gone.");
        const updated = updateEventDraft(
          scene,
          change.event,
          {
            workspaceId: selected.workspaceId,
            projectId: selected.projectId,
            revision: selected.revision,
          },
          { characters, places, objects },
        );
        await repo.saveCampaign({
          ...target,
          scenes: target.scenes.map((item) => (item.id === scene.id ? updated : item)),
        });
        setImportNotice(`The notes for “${change.name}” were updated.`);
      }
      const rest = changedDrafts.items.filter((item) => item.sceneId !== change.sceneId);
      setChangedDrafts(rest.length ? { ...changedDrafts, items: rest } : null);
    } catch (reason) {
      setImportNotice(reason instanceof Error ? reason.message : "Could not update the notes.");
    } finally {
      setImporting(false);
    }
  }
  /** Copy everything chosen at once, into a world made from the manuscript. */
  async function createWorld() {
    if (!selected || !chosen || importing) return;
    setImporting(true);
    setImportNotice("");
    try {
      const [realms, characters, places, objects, factions] = await Promise.all([
        repo.listRealms(),
        repo.listCharacters(),
        repo.listPlaces(),
        repo.listObjects(),
        repo.listFactions(),
      ]);
      const result = importManuscriptBatch({
        title: selected.manuscript.title,
        bible: selected.manuscript.bible,
        source: {
          workspaceId: selected.workspaceId,
          projectId: selected.projectId,
          revision: selected.revision,
        },
        chosen,
        library: { realms, characters, places, objects, factions },
      });
      if (result.realmIsNew) await repo.saveRealm(result.realm);
      for (const card of result.characters) await repo.saveCharacter(card);
      for (const card of result.places) await repo.savePlace(card);
      for (const card of result.objects) await repo.saveObject(card);
      for (const card of result.factions) await repo.saveFaction(card);
      const parts = [
        [result.characters.length, "character"],
        [result.places.length, "place"],
        [result.objects.length, "thing"],
        [result.factions.length, "faction"],
      ]
        .filter(([count]) => (count as number) > 0)
        .map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);
      setImportNotice(
        `${result.realmIsNew ? "Created" : "Added to"} the world “${result.realm.name}”${
          parts.length ? ` with ${parts.join(", ")}` : ""
        }.${
          result.alreadyThere.length
            ? ` Already in your library, left as they are: ${result.alreadyThere.join(", ")}.`
            : ""
        }${
          result.failed.length
            ? ` Could not copy: ${result.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}.`
            : ""
        } kaampi Write was not changed.`,
      );
      setChosen(null);
    } catch (reason) {
      setImportNotice(reason instanceof Error ? reason.message : "Could not create the world.");
    } finally {
      setImporting(false);
    }
  }
  async function saveReview() {
    if (!review || !selected || importing || !approved.length) return;
    setImporting(true);
    try {
      const target = {
        workspaceId: selected.workspaceId,
        projectId: selected.projectId,
        revision: selected.revision,
        entityRef: review.entity.entity_ref,
      };
      const id = review.character.id;
      const kind = review.kind;
      const current =
        kind === "characters"
          ? (await repo.listCharacters()).find((card) => card.id === id)
          : kind === "locations"
            ? (await repo.listPlaces()).find((card) => card.id === id)
            : kind === "objects"
              ? (await repo.listObjects()).find((card) => card.id === id)
              : (await repo.listFactions()).find((card) => card.id === id);
      if (!current || JSON.stringify(current) !== JSON.stringify(review.character))
        throw new Error(
          "The local card changed. Close this review and review the latest card again.",
        );
      let name: string;
      if (kind === "characters") {
        const updated = applyCoreCharacterChanges(
          current as CharacterTemplate,
          review.entity,
          approved,
          target,
        );
        await repo.saveCharacter(updated);
        name = updated.name;
      } else if (kind === "locations") {
        const updated = applyCoreEntityChanges(
          current as PlaceTemplate,
          kind,
          review.entity,
          approved,
          target,
        );
        await repo.savePlace(updated);
        name = updated.name;
      } else if (kind === "objects") {
        const updated = applyCoreEntityChanges(
          current as ObjectTemplate,
          kind,
          review.entity,
          approved,
          target,
        );
        await repo.saveObject(updated);
        name = updated.name;
      } else {
        const updated = applyCoreEntityChanges(
          current as Faction,
          kind,
          review.entity,
          approved,
          target,
        );
        await repo.saveFaction(updated);
        name = updated.name;
      }
      setReview(null);
      setImportNotice(`${name} was updated in your kaampi Explore library.`);
    } catch (reason) {
      setImportNotice(reason instanceof Error ? reason.message : "Could not update this.");
    } finally {
      setImporting(false);
    }
  }
  return (
    <section
      className="sb-home-section sb-core-shelf"
      aria-label="Manuscripts shared with kaampi Explore"
    >
      <div className="sb-section-heading">
        <h2>{t("cmManuscriptsFromKaampiWrite")}</h2>
        <button type="button" className="sb-link" disabled={busy} onClick={() => void refresh()}>
          {entries ? "Refresh" : "Find shared manuscripts"}
        </button>
      </div>
      <p className="sb-section-description">{t("cmOnlyManuscriptsExplicitlyShared")}</p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{t("cmReadingFromKaampiCodex")}</p>}
      {entries?.length === 0 && <p>{t("cmNoManuscriptsAreCurrently")}</p>}
      {entries && entries.length > 0 && (
        <ul className="sb-core-list">
          {entries.map((entry) => (
            <li key={entry.workspaceId}>
              <button type="button" disabled={busy} onClick={() => void open(entry)}>
                <strong>{entry.title}</strong>
                <small>
                  {entry.language || "Language not specified"} · Revision {entry.revision}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Modal
          title={selected.manuscript.title}
          onClose={() => {
            setSelected(null);
            setReview(null);
            setChosen(null);
            setDraftEvents(null);
            setChangedDrafts(null);
          }}
          wide
        >
          <div className="sb-core-preview">
            <p className="sb-section-description">
              Read-only kaampi Write manuscript · {selected.language || "Language not specified"} ·
              Revision {selected.revision}
            </p>
            <h3>{t("cmSynopsis")}</h3>
            <p>{selected.manuscript.synopsis || "No synopsis yet."}</p>
            {selected.manuscript.chapters.map((chapter) => (
              <section key={chapter.id}>
                <h3>{chapter.title || "Untitled chapter"}</h3>
                <p className="sb-core-prose">{chapter.prose}</p>
              </section>
            ))}
            <h3>{t("cmStoryBible")}</h3>
            <p className="sb-section-description">
              Only kaampi Write's approved, visible information is shared. This is a read-only view;
              copying a character, place, thing or faction makes an independent kaampi Explore card.
            </p>
            {selected.manuscript.bible.length === 0 && <p>{t("cmNoSharedStoryBible")}</p>}
            {importableEntries(selected.manuscript.bible).length > 0 && !chosen && (
              <button
                type="button"
                disabled={importing || !!review}
                onClick={() =>
                  setChosen(
                    new Set(importableEntries(selected.manuscript.bible).map((entry) => entry.key)),
                  )
                }
              >
                {t("cmCreateWorldFromThis")}
              </button>
            )}
            {selected.manuscript.bible.some(
              (section) => section.kind === "events" && section.entities.length > 0,
            ) &&
              !draftEvents && (
                <button
                  type="button"
                  disabled={importing || !!review}
                  onClick={() => {
                    void repo.listCampaigns().then(setAdventures);
                    setDraftTarget("new");
                    setDraftEvents(
                      new Set(
                        selected.manuscript.bible
                          .filter((section) => section.kind === "events")
                          .flatMap((section) =>
                            section.entities.map((entity) => entity.entity_ref),
                          ),
                      ),
                    );
                  }}
                >
                  {t("cmCreateSceneDrafts")}
                </button>
              )}
            {changedDrafts && (
              <section aria-label="The manuscript has changed">
                <h3>{t("cmTheManuscriptHasChanged")}</h3>
                <p>{t("cmTheEventsBelowHave")}</p>
                {changedDrafts.items.map((change) => (
                  <div key={change.sceneId}>
                    <h4>{change.name}</h4>
                    <div>
                      <strong>{t("cmBefore")}</strong>
                      <ul>
                        {change.before.map((fact, index) => (
                          <li key={index}>
                            {fact.label}: {fact.value}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>{t("cmNow")}</strong>
                      <ul>
                        {change.after.map((fact, index) => (
                          <li key={index}>
                            {fact.label}: {fact.value}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => void updateDraft(change, true)}
                    >
                      {t("cmUpdateNotes")}
                    </button>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => void updateDraft(change, false)}
                    >
                      {t("cmKeep")}
                    </button>
                  </div>
                ))}
              </section>
            )}
            {draftEvents && (
              <section aria-label="Create scene drafts">
                <h3>{t("cmCreateSceneDraftsFrom")}</h3>
                <p>{t("cmEachChosenEventBecomes")}</p>
                <label>
                  {t("cmAddThemTo")}
                  <select
                    aria-label="Adventure for the drafts"
                    value={draftTarget}
                    onChange={(event) => setDraftTarget(event.target.value)}
                  >
                    <option value="new">{t("cmANewAdventureNamed")}</option>
                    {adventures.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend>{t("cmEvents")}</legend>
                  {selected.manuscript.bible
                    .filter((section) => section.kind === "events")
                    .flatMap((section) => section.entities)
                    .map((entity) => (
                      <label key={entity.entity_ref}>
                        <input
                          type="checkbox"
                          checked={draftEvents.has(entity.entity_ref)}
                          disabled={importing}
                          onChange={(event) => {
                            const next = new Set(draftEvents);
                            if (event.target.checked) next.add(entity.entity_ref);
                            else next.delete(entity.entity_ref);
                            setDraftEvents(next);
                          }}
                        />
                        {entity.name}
                      </label>
                    ))}
                </fieldset>
                <button type="button" disabled={importing} onClick={() => void createDrafts()}>
                  Add drafts ({draftEvents.size})
                </button>
                <button type="button" disabled={importing} onClick={() => setDraftEvents(null)}>
                  {t("psCancel")}
                </button>
              </section>
            )}
            {chosen && (
              <section aria-label="Create world from manuscript">
                <h3>Create a world from “{selected.manuscript.title}”</h3>
                <p>
                  Choose what to copy. Everything becomes your own cards in a new world named after
                  the manuscript; anything copied before is left as it is. Nothing is written to
                  kaampi Write.
                </p>
                {IMPORTABLE_KINDS.map((kind) => {
                  const entries = importableEntries(selected.manuscript.bible).filter(
                    (entry) => entry.kind === kind,
                  );
                  return entries.length === 0 ? null : (
                    <fieldset key={kind}>
                      <legend>
                        {
                          {
                            characters: "Characters",
                            locations: "Places",
                            objects: "Things",
                            groups: "Factions",
                          }[kind]
                        }
                      </legend>
                      {entries.map((entry) => (
                        <label key={entry.key}>
                          <input
                            type="checkbox"
                            checked={chosen.has(entry.key)}
                            disabled={importing}
                            onChange={(event) => {
                              const next = new Set(chosen);
                              if (event.target.checked) next.add(entry.key);
                              else next.delete(entry.key);
                              setChosen(next);
                            }}
                          />
                          {entry.entity.name}
                        </label>
                      ))}
                    </fieldset>
                  );
                })}
                <button
                  type="button"
                  disabled={importing}
                  onClick={() =>
                    setChosen(
                      new Set(
                        importableEntries(selected.manuscript.bible).map((entry) => entry.key),
                      ),
                    )
                  }
                >
                  {t("cmChooseAll")}
                </button>
                <button type="button" disabled={importing} onClick={() => setChosen(new Set())}>
                  {t("cmChooseNone")}
                </button>
                <button type="button" disabled={importing} onClick={() => void createWorld()}>
                  Create world ({chosen.size})
                </button>
                <button type="button" disabled={importing} onClick={() => setChosen(null)}>
                  {t("psCancel")}
                </button>
              </section>
            )}
            {selected.manuscript.bible.map((section, index) => (
              <section key={`${section.kind}-${index}`}>
                <h4>{section.label}</h4>
                <div className="sb-core-entities">
                  {section.entities.map((entity) => (
                    <article key={entity.entity_ref} className="sb-core-entity">
                      <div className="sb-section-heading">
                        <h5>{entity.name}</h5>
                        {(section.kind === "characters" ||
                          section.kind === "locations" ||
                          section.kind === "objects" ||
                          section.kind === "groups") && (
                          <button
                            type="button"
                            className="sb-link"
                            disabled={importing || !!review}
                            onClick={() =>
                              void copy(entity, section.kind as "characters" | CoreEntityKind)
                            }
                          >
                            {t("cmCopyToKaampiExplore")}
                          </button>
                        )}
                      </div>
                      {portraitSrc(entity.referenceImages[0]) && (
                        <img
                          src={portraitSrc(entity.referenceImages[0])}
                          alt=""
                          className="sb-core-portrait"
                        />
                      )}
                      {entity.pronoun && <p>Pronoun: {entity.pronoun}</p>}
                      {entity.approximateAge && <p>Approximate age: {entity.approximateAge}</p>}
                      {entity.looks && <p>Appearance: {entity.looks}</p>}
                      {entity.personality && <p>Personality: {entity.personality}</p>}
                      {entity.facts.length > 0 && (
                        <ul>
                          {entity.facts.map((fact, factIndex) => (
                            <li key={`${fact.predicate}-${factIndex}`}>
                              <strong>{fact.label}:</strong> {fact.value}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {review && (
              <section aria-label="Review updates">
                <h3>Review updates for {review.character.name}</h3>
                <p>{t("cmOnlySelectedChangesWill")}</p>
                {review.changes.map((change) => (
                  <div key={change.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={approved.includes(change.key)}
                        disabled={importing}
                        onChange={(event) =>
                          setApproved((keys) =>
                            event.target.checked
                              ? [...keys, change.key]
                              : keys.filter((key) => key !== change.key),
                          )
                        }
                      />
                      {change.label}
                    </label>
                    <p>Previously shared: {change.previous || "(empty)"}</p>
                    <p>Your local value: {change.local || "(empty)"}</p>
                    <p>New shared value: {change.incoming || "(empty)"}</p>
                    {change.conflict && <p role="note">{t("cmYouEditedThisLocally")}</p>}
                  </div>
                ))}
                <button
                  type="button"
                  disabled={importing || !approved.length}
                  onClick={() => void saveReview()}
                >
                  {t("cmApplySelectedUpdates")}
                </button>
                <button type="button" disabled={importing} onClick={() => setReview(null)}>
                  {t("cmCancelReview")}
                </button>
              </section>
            )}
            {importNotice && <p role="status">{importNotice}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}
