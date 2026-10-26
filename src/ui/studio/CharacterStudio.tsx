import type { AnatomyTemplate } from "@state/StateSchema";
import { importEmbeddedLore } from "../../lore/sillyTavernLore";
import type { Lorebook } from "../../lore/LorebookSchema";
import { LoreReview } from "../lore/LoreReview";
import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  formatTagList,
  ensureImportedTag,
  newCharacterTemplate,
  parseTagList,
  type CharacterTemplate,
  type LibrarySource
} from "@library/LibrarySchema";
import type { CharacterPronoun } from "@state/StateSchema";
import { BUILTIN_PRONOUNS, isBuiltinPronoun, normalizePronoun, pronounLabel } from "@state/pronouns";
import { PickChips } from "./ChoiceChips";
import { withOriginalTimestamps } from "@library/fromForm";
import { importSillyTavernFile } from "@library/sillyTavernImport";
import { slugifyCharacterId } from "@session/createSession";
import { formatPersonName, namesFromStored, splitPersonName } from "@library/personName";
import { portraitDataUrlFromFile, PortraitError, portraitSrc } from "./portrait";
import { StudioList } from "./StudioList";
import { CharacterImages } from "./CharacterImages";
import { SheetNameField } from "./SheetNameField";
import { SillyTavernImportReview } from "./SillyTavernImportReview";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import { confirmRemove, downloadJson } from "./studioShared";
import { CharacterGeneratorPanel } from "./CharacterGeneratorPanel";
import type { GeneratedCharacter } from "@library/characterGenerator";
import { compactCharacterCardWithOllama, compactFailureMessage } from "./compactCharacterCardWithOllama";
import type { CompactCardFields } from "@library/compactCharacterCard";
import {
  EMPTY_CHARACTER_SHELF_FILTERS,
  matchesCharacterShelf,
  type CharacterShelfFilters
} from "@library/characterShelfFilter";

async function loadCharacterCatalog(repo: IndexedDBRepository): Promise<{
  items: CharacterTemplate[];
  skipped: number;
}> {
  const catalog = (repo as IndexedDBRepository & { listCharacterCatalog?: unknown }).listCharacterCatalog;
  if (typeof catalog === "function") {
    return catalog.call(repo) as Promise<{ items: CharacterTemplate[]; skipped: number }>;
  }
  return { items: await repo.listCharacters(), skipped: 0 };
}

type Draft = {
  id: string | null;
  name: string;
  middleName: string;
  familyName: string;
  approximateAge: number | null;
  personality: string;
  appearance: string;
  anatomyTemplateId: string;
  mood: string;
  speech: string;
  pronoun: CharacterPronoun | null;
  portraitDataUrl: string;
  tags: string;
  source: LibrarySource;
  createdAt?: string;
};

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    middleName: "",
    familyName: "",
    approximateAge: null,
    personality: "",
    appearance: "",
    anatomyTemplateId: "",
    mood: "",
    speech: "",
    pronoun: null,
    portraitDataUrl: "",
    tags: "",
    source: "player"
  };
}

function draftFrom(template: CharacterTemplate): Draft {
  const names = namesFromStored(template.name, template.familyName, template.middleName);
  return {
    id: template.id,
    name: names.given,
    middleName: names.middle,
    familyName: names.family,
    approximateAge:
      typeof template.approximateAge === "number" && Number.isFinite(template.approximateAge)
        ? template.approximateAge
        : null,
    personality: template.personality ?? "",
    appearance: template.appearance ?? "",
    anatomyTemplateId: template.anatomyTemplateId ?? "",
    mood: template.mood ?? "",
    speech: template.speech ?? "",
    pronoun:
      template.pronoun && template.pronoun.length <= 32 ? template.pronoun : null,
    portraitDataUrl: portraitSrc(template.portraitDataUrl) ?? "",
    source: template.source,
    tags: formatTagList(ensureImportedTag(template.tags ?? [], template.source)),
    createdAt: template.createdAt
  };
}

export function CharacterStudio({ repo }: { repo: IndexedDBRepository }) {
  const [anatomyOptions, setAnatomyOptions] = useState<AnatomyTemplate[]>([]);
  useEffect(() => { void repo.listAnatomyTemplates().then(setAnatomyOptions).catch(() => {}); }, [repo]);
  const fileRef = useRef<HTMLInputElement>(null);
  const portraitRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<Draft | null>(null);
  const compactAbortRef = useRef<AbortController | null>(null);
  const importSessionRef = useRef<{
    lorebook?: Lorebook;
    rawText: string;
    fileLabel: string;
    remaining: File[];
    draft: Draft;
  } | null>(null);
  const [library, setLibrary] = useState<CharacterTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [titleText, setTitleText] = useState("");
  const [titleFocused, setTitleFocused] = useState(false);
  const [importSession, setImportSession] = useState<{
    lorebook?: Lorebook;
    rawText: string;
    fileLabel: string;
    remaining: File[];
    draft: Draft;
  } | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactUndo, setCompactUndo] = useState<CompactCardFields | null>(null);
  const [skippedCards, setSkippedCards] = useState(0);
  const [shelfFilter, setShelfFilter] = useState<CharacterShelfFilters>(EMPTY_CHARACTER_SHELF_FILTERS);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorKey, setGeneratorKey] = useState(0);
  draftRef.current = draft;
  importSessionRef.current = importSession;

  async function refresh() {
    const catalog = await loadCharacterCatalog(repo);
    setLibrary(catalog.items);
    setSkippedCards(catalog.skipped);
  }

  useEffect(() => {
    let cancelled = false;
    loadCharacterCatalog(repo)
      .then((catalog) => {
        if (cancelled) return;
        setLibrary(catalog.items);
        setSkippedCards(catalog.skipped);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load characters.");
      });
    return () => {
      cancelled = true;
      compactAbortRef.current?.abort();
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));
  const items = library.filter((item) => matchesCharacterShelf(item, shelfFilter));

  function patchShelfFilter(patch: Partial<CharacterShelfFilters>) {
    setShelfFilter((current) => ({ ...current, ...patch }));
  }

  function stopCompact() {
    compactAbortRef.current?.abort();
    compactAbortRef.current = null;
    setCompacting(false);
    setCompactUndo(null);
  }

  function applyCompactFields(fields: CompactCardFields) {
    setImportSession((session) => {
      if (!session) return session;
      return { ...session, draft: { ...session.draft, ...fields } };
    });
    setDraft((current) => {
      // Import review owns the form; do not mutate a hidden sheet draft.
      if (importSessionRef.current) return current;
      return current ? { ...current, ...fields } : current;
    });
  }

  function open(id: string) {
    if (id === selectedId && draftRef.current && !importSession) return;
    try {
      stopCompact();
      const fromLibrary = library.find((item) => item.id === id);
      const template = fromLibrary;
      if (!template) {
        setError("Could not open that character.");
        return;
      }
      setSelectedId(id);
      setDraft(draftFrom(template));
      setTitleFocused(false);
      setTitleText("");
      setError(null);
      setNotice(null);
      setImportSession(null);
      setGeneratorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that character.");
    }
  }

  function startNew() {
    stopCompact();
    setSelectedId(null);
    setDraft(emptyDraft());
    setTitleFocused(false);
    setTitleText("");
    setError(null);
    setNotice(null);
    setImportSession(null);
    setGeneratorOpen(false);
  }

  function openGenerator() {
    stopCompact();
    setSelectedId(null);
    setDraft(emptyDraft());
    setTitleFocused(false);
    setTitleText("");
    setError(null);
    setNotice(null);
    setImportSession(null);
    setGeneratorOpen(true);
    setGeneratorKey((key) => key + 1);
  }

  function applyGenerated(card: GeneratedCharacter) {
    setDraft((current) => ({
      ...emptyDraft(),
      portraitDataUrl: current?.id ? "" : (current?.portraitDataUrl ?? ""),
      name: card.name,
      middleName: card.middleName,
      familyName: card.familyName,
      approximateAge: card.approximateAge,
      personality: card.personality,
      appearance: card.appearance,
      mood: card.mood,
      speech: card.speech,
      pronoun: card.pronoun,
      tags: card.tags.join(", "),
      source: "player"
    }));
    setSelectedId(null);
    setTitleFocused(false);
    setTitleText("");
    setError(null);
    setNotice("Draft is on the sheet. Edit it, then Save.");
  }

  async function persistDraft(current: Draft, quiet = false, lorebook?: Lorebook): Promise<boolean> {
    const name = current.name.trim();
    if (!name) {
      setError("Give them a given name.");
      return false;
    }
    const years =
      current.approximateAge != null && Number.isFinite(current.approximateAge)
        ? Math.round(current.approximateAge)
        : undefined;
    const built = newCharacterTemplate({
      ...(current.id ? { id: current.id } : {}),
      name,
      familyName: current.familyName.trim(),
      middleName: current.middleName.trim(),
      ...(years != null && years >= 1 && years <= 130 ? { approximateAge: years } : {}),
      personality: current.personality,
      speech: current.speech.trim(),
      appearance: current.appearance,
      ...(current.anatomyTemplateId ? { anatomyTemplateId: current.anatomyTemplateId } : {}),
      mood: current.mood,
      tags: parseTagList(current.tags),
      position: "",
      scenario: "",
      source: current.source,
      ...(current.pronoun ? { pronoun: current.pronoun } : {}),
      ...(portraitSrc(current.portraitDataUrl) ? { portraitDataUrl: portraitSrc(current.portraitDataUrl) } : {}),
      lore: library.find((item) => item.id === current.id)?.lore ?? []
    });
    const previous = library.find((item) => item.id === built.id);
    const saved = withOriginalTimestamps(
      built,
      previous ?? (current.createdAt ? { createdAt: current.createdAt } : undefined)
    );
    if (lorebook) await repo.saveCharacterWithLorebook(saved, { ...lorebook, binding: { kind: "character", targetId: saved.id } });
    else await repo.saveCharacter(saved);
    await refresh();
    setSelectedId(saved.id);
    setDraft(draftFrom(saved));
    if (!quiet) {
      setTitleFocused(false);
      setNotice("Saved.");
    }
    return true;
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await persistDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPortrait(portraitDataUrl: string) {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, portraitDataUrl };
    setDraft(next);
    if (next.id) {
      await persistDraft(next, true);
    }
  }

  async function onPortraitFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const portraitDataUrl = await portraitDataUrlFromFile(file);
      if (importSession) {
        setImportSession({
          ...importSession,
          draft: { ...importSession.draft, portraitDataUrl }
        });
      } else {
        await applyPortrait(portraitDataUrl);
      }
    } catch (err) {
      setError(err instanceof PortraitError ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (portraitRef.current) portraitRef.current.value = "";
    }
  }

  async function remove() {
    if (!draft?.id || !savedIds.has(draft.id)) return;
    if (!confirmRemove(formatPersonName(draft.name, draft.familyName, draft.middleName) || "this character")) return;
    await repo.deleteCharacter(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  async function beginReview(files: File[]) {
    const [first, ...remaining] = files;
    if (!first) return;
    const review = await importSillyTavernFile(first);
    let portraitDataUrl = review.character.portraitDataUrl ?? "";
    const png = first.type === "image/png" || first.name.toLowerCase().endsWith(".png");
    if (png) {
      try {
        portraitDataUrl = await portraitDataUrlFromFile(first);
      } catch {
        // Keep the card even if pixels fail.
      }
    }
    setCompactUndo(null);
    setImportSession({
      ...(review.embeddedLore ? { lorebook: importEmbeddedLore(review.embeddedLore, `${first.name} lore`) } : {}),
      rawText: review.rawText,
      fileLabel: first.name,
      remaining,
      draft: { ...draftFrom(review.character), portraitDataUrl }
    });
    setError(null);
  }

  async function onImportFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await beginReview(Array.from(files));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that card.");
      setImportSession(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importSession) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await persistDraft({ ...importSession.draft, source: "sillytavern" }, true, importSession.lorebook);
      if (!ok) return;
      const remaining = importSession.remaining;
      if (remaining.length > 0) {
        await beginReview(remaining);
        setNotice("Imported. Next card is ready to check.");
      } else {
        setImportSession(null);
        setNotice("Imported.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that card.");
    } finally {
      setBusy(false);
    }
  }

  function undoCompact() {
    if (!compactUndo) return;
    applyCompactFields(compactUndo);
    setCompactUndo(null);
    setNotice("Restored the previous Looks, mood, and personality.");
  }

  async function compactCard() {
    const current = importSession?.draft ?? draft;
    if (!current) return;
    compactAbortRef.current?.abort();
    const ac = new AbortController();
    compactAbortRef.current = ac;
    setBusy(true);
    setCompacting(true);
    setError(null);
    setNotice(null);
    const before: CompactCardFields = {
      appearance: current.appearance,
      mood: current.mood,
      personality: current.personality
    };
    try {
      const next = await compactCharacterCardWithOllama(
        {
          name: formatPersonName(current.name, current.familyName, current.middleName),
          appearance: current.appearance,
          mood: current.mood,
          personality: current.personality,
          ...(importSession?.rawText ? { rawText: importSession.rawText } : {})
        },
        ac.signal
      );
      if (ac.signal.aborted) return;
      setCompactUndo(before);
      applyCompactFields(next);
      setNotice("Compacted. Check Looks, mood, and personality — Undo compact puts the previous text back.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "AbortError") return;
      setError(compactFailureMessage(err));
    } finally {
      if (compactAbortRef.current === ac) compactAbortRef.current = null;
      setBusy(false);
      setCompacting(false);
    }
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Characters"
        items={items.map((item) => {
          const thumb = portraitSrc(item.portraitDataUrl);
          return {
            id: item.id,
            name: formatPersonName(item.name, item.familyName, item.middleName),
            ...(thumb ? { thumb } : {})
          };
        })}
        selectedId={selectedId}
        onSelect={open}
        onNew={startNew}
        layout="portraits"
        columns={2}
        newLabel="Create new"
        empty={library.length === 0 ? "No one in the archive yet." : "No one matches."}
        secondaryAction={
          <>
            <button
              type="button"
              className="studio-list__btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Import SillyTavern
            </button>
            <button type="button" className="studio-list__btn" onClick={openGenerator} disabled={busy}>
              Generate
            </button>
          </>
        }
        filters={
          <div className="studio-list__filters">
            <label className="setup-check">
              <input
                type="checkbox"
                checked={shelfFilter.male}
                onChange={(e) => patchShelfFilter({ male: e.target.checked })}
              />
              Male
            </label>
            <label className="setup-check">
              <input
                type="checkbox"
                checked={shelfFilter.female}
                onChange={(e) => patchShelfFilter({ female: e.target.checked })}
              />
              Female
            </label>
            <label className="setup-check">
              <input
                type="checkbox"
                checked={shelfFilter.imported}
                onChange={(e) => patchShelfFilter({ imported: e.target.checked })}
              />
              Imported
            </label>
          </div>
        }
      />
      <section className={importSession ? "studio-sheet studio-sheet--character studio-sheet--import" : "studio-sheet studio-sheet--character"}>
        <input
          ref={fileRef}
          className="setup-file"
          type="file"
          accept=".png,.json,image/png,application/json"
          multiple
          tabIndex={-1}
          onChange={(e) => void onImportFiles(e.target.files)}
        />
        <input
          ref={portraitRef}
          className="setup-file"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(e) => void onPortraitFile(e.target.files?.[0] ?? null)}
        />
        {!importSession && !draft && (
          <p className="inspector-empty">
            {library.length === 0
              ? "Nothing saved on this address yet. Port 5174 keeps its own archive."
              : "Pick someone, or start a new card. Who they are lives here — not the room."}
          </p>
        )}
        {skippedCards > 0 && (
          <p className="setup-error">
            {skippedCards === 1
              ? "One saved card could not be read."
              : `${skippedCards} saved cards could not be read.`}
          </p>
        )}
        {error && !draft && !importSession && <p className="setup-error">{error}</p>}
        <StudioErrorBoundary
          key={importSession ? `import-${importSession.fileLabel}` : selectedId ?? draft?.id ?? "sheet"}
          fallbackTitle="This card could not be opened. Close and pick someone else — the list is still there."
          onReset={() => {
            setImportSession(null);
            setDraft(null);
            setSelectedId(null);
            setError(null);
          }}
        >
        {importSession && (
          <>
          <SillyTavernImportReview
            rawText={importSession.rawText}
            fileLabel={importSession.fileLabel}
            draft={importSession.draft}
            busy={busy}
            error={error}
            notice={importSession.lorebook ? `${notice ?? ""} Included lorebook: ${importSession.lorebook.entries.length} entries. Review the lore section below; no entries are selected automatically.` : notice}
            onChange={(next) => setImportSession({ ...importSession, draft: { ...importSession.draft, ...next } })}
            onPickPortrait={() => portraitRef.current?.click()}
            onRemovePortrait={() =>
              setImportSession({
                ...importSession,
                draft: { ...importSession.draft, portraitDataUrl: "" }
              })
            }
            onImport={() => void confirmImport()}
            onCancel={() => {
              stopCompact();
              setImportSession(null);
              setError(null);
              setNotice(null);
            }}
            compacting={compacting}
            canUndoCompact={Boolean(compactUndo)}
            onCompact={() => void compactCard()}
            onUndoCompact={undoCompact}
          />
          {importSession.lorebook && <section className="sb-embedded-lore"><h2>Included lorebook</h2><p>Saved with this character. Choose entries to use in new conversations.</p><LoreReview book={importSession.lorebook} disabled={busy} onChange={lorebook => setImportSession({ ...importSession, lorebook })} /></section>}
          </>
        )}
        {!importSession && draft && (
          <>
            {generatorOpen && (
              <CharacterGeneratorPanel key={generatorKey} busy={busy} onApply={applyGenerated} />
            )}
            <SheetNameField
              ariaLabel="Full name"
              value={
                titleFocused
                  ? titleText
                  : formatPersonName(draft.name, draft.familyName, draft.middleName)
              }
              placeholder="New character"
              onFocus={() => {
                setTitleText(formatPersonName(draft.name, draft.familyName, draft.middleName));
                setTitleFocused(true);
              }}
              onBlur={() => setTitleFocused(false)}
              onChange={(raw) => {
                const parsed = splitPersonName(raw);
                setTitleText(raw);
                setDraft({
                  ...draft,
                  name: parsed.given,
                  middleName: parsed.middle,
                  familyName: parsed.family
                });
              }}
            />
            {!saved && <div className="studio-portrait studio-portrait--character">
              <div className="studio-portrait__frame">
                {portraitSrc(draft.portraitDataUrl) ? (
                  <img className="studio-portrait__img" src={portraitSrc(draft.portraitDataUrl)} alt="" />
                ) : (
                  <div className="studio-portrait__empty" aria-hidden="true" />
                )}
                {portraitSrc(draft.portraitDataUrl) ? (
                  <button
                    type="button"
                    className="studio-portrait__trash"
                    aria-label="Remove portrait"
                    disabled={busy}
                    onClick={() =>
                      void applyPortrait("").catch((err) => {
                        setError(err instanceof Error ? err.message : "Could not save.");
                      })
                    }
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.2 4.2h9.6M6.2 4.2V3.1A.9.9 0 0 1 7.1 2.2h1.8a.9.9 0 0 1 .9.9v1.1M5.1 4.2l.5 8.2a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.5-8.2M6.8 6.4v5M9.2 6.4v5"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="studio-portrait__btn"
                disabled={busy}
                onClick={() => portraitRef.current?.click()}
              >
                {draft.portraitDataUrl ? "Change portrait" : "Add portrait"}
              </button>
            </div>}
            {saved && draft.id && <CharacterImages key={draft.id} characterId={draft.id} repo={repo} portrait={draft.portraitDataUrl} onPortrait={applyPortrait} />}
            <div className="setup-field">
              <span className="setup-field__label">Pronoun</span>
              <PickChips
                ariaLabel="Pronoun"
                choices={[
                  ...BUILTIN_PRONOUNS,
                  ...(draft.pronoun && !isBuiltinPronoun(draft.pronoun) ? [draft.pronoun] : [])
                ]}
                value={draft.pronoun ?? undefined}
                labelFor={pronounLabel}
                addPlaceholder="they…"
                onPick={(choice) =>
                  setDraft({ ...draft, pronoun: draft.pronoun === choice ? null : choice })
                }
                onAdd={(label) => {
                  const next = normalizePronoun(label);
                  setDraft({ ...draft, pronoun: next });
                }}
              />
            </div>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Approximate age</span>
              <input
                type="number"
                min={1}
                max={130}
                inputMode="numeric"
                value={draft.approximateAge ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraft({
                    ...draft,
                    approximateAge: raw === "" ? null : Number(raw)
                  });
                }}
                placeholder="28"
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Looks</span>
              <textarea
                className="setup-field__story setup-field__looks"
                value={draft.appearance}
                onChange={(e) => setDraft({ ...draft, appearance: e.target.value })}
                placeholder="body and face, not clothes"
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Anatomy (optional)</span>
              <select value={draft.anatomyTemplateId} onChange={(e) => setDraft({ ...draft, anatomyTemplateId: e.target.value })}>
                <option value="">No anatomy template</option>
                {anatomyOptions.map((template) => <option key={template.id} value={template.id}>{template.name} (v{template.version})</option>)}
              </select>
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Typical mood</span>
              <input
                value={draft.mood}
                onChange={(e) => setDraft({ ...draft, mood: e.target.value })}
                placeholder="not a scene"
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">How they speak</span>
              <input
                value={draft.speech}
                onChange={(e) => setDraft({ ...draft, speech: e.target.value })}
                placeholder="Clipped. Few words, no padding."
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                Tags
                <span className="setup-optional">this person only</span>
              </span>
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="middle-aged, double nature"
              />
            </label>
            <label className="setup-field">
              <span className="setup-field__label">Personality</span>
              <textarea
                className="setup-field__story"
                value={draft.personality}
                onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
                placeholder="Dry-witted, slow to open up, speaks in short sentences…"
              />
            </label>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button type="button" className="setup-start" disabled={busy} onClick={() => void save()}>
                Save
              </button>
              <button type="button" className="setup-example" disabled={busy} onClick={() => void compactCard()}>
                {compacting ? "Compacting…" : "Compact"}
              </button>
              {compactUndo ? (
                <button type="button" className="setup-example" disabled={busy} onClick={undoCompact}>
                  Undo compact
                </button>
              ) : null}
              {saved && draft.id && (
                <button
                  type="button"
                  className="setup-example"
                  onClick={() => {
                    const record = library.find((item) => item.id === draft.id);
                    if (!record) return;
                    downloadJson(
                      `${slugifyCharacterId(formatPersonName(record.name, record.familyName, record.middleName))}.json`,
                      record
                    );
                  }}
                >
                  Export JSON
                </button>
              )}
              {saved && (
                <button type="button" className="setup-example" onClick={() => void remove()}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
        </StudioErrorBoundary>
      </section>
    </div>
  );
}

