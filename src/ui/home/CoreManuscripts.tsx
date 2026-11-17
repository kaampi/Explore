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
        <h2>Manuscripts from kaampi Write</h2>
        <button type="button" className="sb-link" disabled={busy} onClick={() => void refresh()}>
          {entries ? "Refresh" : "Find shared manuscripts"}
        </button>
      </div>
      <p className="sb-section-description">
        Only manuscripts explicitly shared with kaampi Explore appear here. Reading one does not
        change your local sessions or kaampi Write's manuscript.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Reading from kaampi Codex…</p>}
      {entries?.length === 0 && <p>No manuscripts are currently shared with kaampi Explore.</p>}
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
          }}
          wide
        >
          <div className="sb-core-preview">
            <p className="sb-section-description">
              Read-only kaampi Write manuscript · {selected.language || "Language not specified"} ·
              Revision {selected.revision}
            </p>
            <h3>Synopsis</h3>
            <p>{selected.manuscript.synopsis || "No synopsis yet."}</p>
            {selected.manuscript.chapters.map((chapter) => (
              <section key={chapter.id}>
                <h3>{chapter.title || "Untitled chapter"}</h3>
                <p className="sb-core-prose">{chapter.prose}</p>
              </section>
            ))}
            <h3>Story Bible</h3>
            <p className="sb-section-description">
              Only kaampi Write's approved, visible information is shared. This is a read-only view;
              copying a character, place, thing or faction makes an independent kaampi Explore card.
            </p>
            {selected.manuscript.bible.length === 0 && (
              <p>No shared Story Bible entries in this manuscript.</p>
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
                            Copy to kaampi Explore library / Review updates
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
                <p>
                  Only selected changes will be saved. Unselected changes and your other local
                  fields are preserved.
                </p>
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
                    {change.conflict && (
                      <p role="note">
                        You edited this locally. Selecting this change will replace your local
                        value.
                      </p>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  disabled={importing || !approved.length}
                  onClick={() => void saveReview()}
                >
                  Apply selected updates
                </button>
                <button type="button" disabled={importing} onClick={() => setReview(null)}>
                  Cancel review
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
