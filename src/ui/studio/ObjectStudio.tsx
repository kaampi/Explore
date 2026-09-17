import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  formatTagList,
  newObjectTemplate,
  parseTagList,
  type LibrarySource,
  type ObjectTemplate,
  type PlaceTemplate,
  type StoryTemplate
} from "@library/LibrarySchema";
import { exampleObjectTemplates, mergeWithExamples } from "@library/exampleTemplates";
import { withOriginalTimestamps } from "@library/fromForm";
import { FormSection } from "./FormSection";
import { StudioList } from "./StudioList";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, shelfCaption, sourceCaption } from "./studioShared";

type Draft = {
  id: string | null;
  name: string;
  note: string;
  tags: string;
  storyId: string;
  placeId: string;
  weight: string;
  difficulty: string;
  checkAttribute: string;
  source: LibrarySource;
  createdAt?: string;
};

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    note: "",
    tags: "",
    storyId: "",
    placeId: "",
    weight: "",
    difficulty: "",
    checkAttribute: "",
    source: "player"
  };
}

function draftFrom(template: ObjectTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    note: template.note,
    tags: formatTagList(template.tags),
    storyId: template.storyId ?? "",
    placeId: template.placeId ?? "",
    weight: template.weight !== undefined ? String(template.weight) : "",
    difficulty: template.difficulty !== undefined ? String(template.difficulty) : "",
    checkAttribute: template.checkAttribute ?? "",
    source: template.source,
    createdAt: template.createdAt
  };
}

function parseOptionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

export function ObjectStudio({ repo }: { repo: IndexedDBRepository }) {
  const [library, setLibrary] = useState<ObjectTemplate[]>([]);
  const [stories, setStories] = useState<StoryTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLibrary(await repo.listObjects());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([repo.listObjects(), repo.listStories(), repo.listPlaces()])
      .then(([nextObjects, nextStories, nextPlaces]) => {
        if (cancelled) return;
        setLibrary(nextObjects);
        setStories(nextStories);
        setPlaces(nextPlaces);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load objects.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));
  const items = mergeWithExamples(library, exampleObjectTemplates());

  function open(id: string) {
    const fromLibrary = library.find((item) => item.id === id);
    const fromExample = exampleObjectTemplates().find((item) => item.id === id);
    const template = fromLibrary ?? fromExample;
    if (!template) return;
    setSelectedId(id);
    setDraft(draftFrom(template));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name the object.");
      return;
    }
    const weight = parseOptionalNumber(draft.weight);
    const difficulty = parseOptionalNumber(draft.difficulty);
    if (Number.isNaN(weight) || Number.isNaN(difficulty)) {
      setError("Weight and difficulty must be empty or a number 0 or more.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newObjectTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name,
        note: draft.note.trim(),
        tags: parseTagList(draft.tags),
        ...(draft.storyId ? { storyId: draft.storyId } : {}),
        ...(draft.placeId ? { placeId: draft.placeId } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
        ...(draft.checkAttribute.trim() ? { checkAttribute: draft.checkAttribute.trim() } : {}),
        source: draft.source
      });
      const previous = library.find((item) => item.id === built.id);
      const savedItem = withOriginalTimestamps(
        built,
        previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined)
      );
      await repo.saveObject(savedItem);
      await refresh();
      setSelectedId(savedItem.id);
      setDraft(draftFrom(savedItem));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !savedIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this object")) return;
    await repo.deleteObject(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Objects"
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          caption: shelfCaption(item.source, savedIds.has(item.id), item.tags),
        }))}
        selectedId={selectedId}
        onSelect={open}
        onNew={() => {
          setSelectedId(null);
          setDraft(emptyDraft());
          setError(null);
          setNotice(null);
        }}
        layout="portraits"
        columns={2}
        newLabel="Create new"
        empty="No objects yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && (
          <p className="inspector-empty">
            A named thing that can sit in a room. Tags filter the shelf; a story or place is a home, not a lock.
          </p>
        )}
        {draft && (
          <>
            <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
            <SheetNameField
              ariaLabel="Object name"
              value={draft.name}
              placeholder="New object"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                Note
                <span className="setup-optional">what it is, in this world</span>
              </span>
              <textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="A plain gold band. It must not leave this company unwatched."
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                Tags
                <span className="setup-optional">this object only</span>
              </span>
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="relic, key, weapon"
              />
            </label>
            <FormSection title="Home" lede="A hint, not a lock.">
            <div className="setup-row">
              <label className="setup-field">
                <span className="setup-field__label">
                  Home story
                  <span className="setup-optional">optional</span>
                </span>
                <select
                  value={draft.storyId}
                  onChange={(e) => setDraft({ ...draft, storyId: e.target.value })}
                >
                  <option value="">None</option>
                  {stories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="setup-field">
                <span className="setup-field__label">
                  Home place
                  <span className="setup-optional">optional</span>
                </span>
                <select
                  value={draft.placeId}
                  onChange={(e) => setDraft({ ...draft, placeId: e.target.value })}
                >
                  <option value="">None</option>
                  {places.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            </FormSection>
            <FormSection title="For later checks" lede="Stored for rolls that are not wired yet.">
            <div className="setup-row">
              <label className="setup-field">
                Weight <span className="setup-optional">optional</span>
                <input
                  value={draft.weight}
                  onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                  placeholder="40"
                  inputMode="decimal"
                />
              </label>
              <label className="setup-field">
                Difficulty <span className="setup-optional">optional</span>
                <input
                  value={draft.difficulty}
                  onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
                  placeholder="14"
                  inputMode="decimal"
                />
              </label>
            </div>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                Check attribute
                <span className="setup-optional">e.g. strength — unused until rolls exist</span>
              </span>
              <input
                value={draft.checkAttribute}
                onChange={(e) => setDraft({ ...draft, checkAttribute: e.target.value })}
                placeholder="strength"
              />
            </label>
            </FormSection>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button type="button" className="setup-start" disabled={busy} onClick={() => void save()}>
                Save
              </button>
              {saved && (
                <button type="button" className="setup-example" onClick={() => void remove()}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
