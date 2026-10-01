import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { deriveStoryTitle, newStoryTemplate, type LibrarySource, type StoryTemplate } from "@library/LibrarySchema";
import { withOriginalTimestamps } from "@library/fromForm";
import { StudioList } from "./StudioList";
import { FormSection } from "./FormSection";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, sourceCaption } from "./studioShared";

type Draft = {
  id: string | null;
  name: string;
  premise: string;
  storyline: string;
  source: LibrarySource;
  createdAt?: string;
};

function emptyDraft(): Draft {
  return { id: null, name: "", premise: "", storyline: "", source: "player" };
}

function draftFrom(template: StoryTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    premise: template.premise,
    storyline: template.storyline ?? "",
    source: template.source,
    createdAt: template.createdAt
  };
}

export function StoryStudio({ repo }: { repo: IndexedDBRepository }) {
  const [library, setLibrary] = useState<StoryTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLibrary(await repo.listStories());
  }

  useEffect(() => {
    let cancelled = false;
    repo
      .listStories()
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load stories.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));

  function open(id: string) {
    const item = library.find((row) => row.id === id);
    if (!item) return;
    setSelectedId(id);
    setDraft(draftFrom(item));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!draft) return;
    const premise = draft.premise.trim();
    if (!premise) {
      setError("Write the premise of this world.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newStoryTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name: deriveStoryTitle(draft.name, premise),
        premise,
        storyline: draft.storyline.trim(),
        source: draft.source
      });
      const previous = library.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(built, previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined));
      await repo.saveStory(saved);
      await refresh();
      setSelectedId(saved.id);
      setDraft(draftFrom(saved));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !savedIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this story")) return;
    await repo.deleteStory(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Stories"
        items={library.map((item) => ({
          id: item.id,
          name: item.name,
          caption: sourceCaption(item.source, true)
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
        empty="No ground stories yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && (
          <p className="inspector-empty">The world so far — Bag End and Mount Doom can share the same story.</p>
        )}
        {draft && (
          <>
            <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
            <SheetNameField
              ariaLabel="Story title"
              value={draft.name}
              placeholder="New story"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <FormSection title="The world, so far" lede="World lore shared by all play modes. Keep planned events, quests and required outcomes in Storyline below.">
              <textarea
                className="setup-field__story"
                value={draft.premise}
                onChange={(e) => setDraft({ ...draft, premise: e.target.value })}
                placeholder="In the Second Age, the Dark Lord Sauron secretly forged the One Ring…"
              />
            </FormSection>
            <FormSection title="Storyline" lede="Optional. Only included in Adventure; excluded from Free exploration and Fan Fiction.">
              <textarea className="setup-field__story" value={draft.storyline} onChange={(e) => setDraft({ ...draft, storyline: e.target.value })} placeholder="The planned adventure and its possible developments…" />
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

