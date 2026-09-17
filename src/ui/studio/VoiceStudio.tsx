import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { newVoiceTemplate, type LibrarySource, type VoiceTemplate } from "@library/LibrarySchema";
import { exampleVoiceTemplates, mergeWithExamples } from "@library/exampleTemplates";
import { withOriginalTimestamps } from "@library/fromForm";
import { StudioList } from "./StudioList";
import { FormSection } from "./FormSection";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, sourceCaption } from "./studioShared";

type Draft = {
  id: string | null;
  name: string;
  instruction: string;
  source: LibrarySource;
  createdAt?: string;
};

function emptyDraft(): Draft {
  return { id: null, name: "", instruction: "", source: "player" };
}

function draftFrom(template: VoiceTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    instruction: template.instruction,
    source: template.source,
    createdAt: template.createdAt
  };
}

export function VoiceStudio({ repo }: { repo: IndexedDBRepository }) {
  const [library, setLibrary] = useState<VoiceTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLibrary(await repo.listVoices());
  }

  useEffect(() => {
    let cancelled = false;
    repo
      .listVoices()
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load voices.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));
  const items = mergeWithExamples(library, exampleVoiceTemplates());

  function open(id: string) {
    const item = items.find((row) => row.id === id);
    if (!item) return;
    setSelectedId(id);
    setDraft(draftFrom(item));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!draft) return;
    const instruction = draft.instruction.trim();
    const name = draft.name.trim();
    if (!instruction) {
      setError("Write how this narrator should speak.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newVoiceTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name: name || "Untitled voice",
        instruction,
        source: draft.source
      });
      const previous = library.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(built, previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined));
      await repo.saveVoice(saved);
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
    if (!confirmRemove(draft.name.trim() || "this voice")) return;
    await repo.deleteVoice(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Voices"
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          caption: sourceCaption(item.source, savedIds.has(item.id))
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
        empty="No narrator voices yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && (
          <p className="inspector-empty">How the scene is told — not what the world is. Story lives on the other shelf.</p>
        )}
        {draft && (
          <>
            <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
            <SheetNameField
              ariaLabel="Voice name"
              value={draft.name}
              placeholder="New voice"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <FormSection
              title="Narrator instruction"
              lede="How the scene is told — not what the world is. Story lives on the other shelf."
            >
              <textarea
                className="setup-field__story"
                value={draft.instruction}
                onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
                placeholder="Du är Spelledare…"
              />
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
