import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { CharacterTemplate, CampaignTemplate, RealmTemplate } from "@library/LibrarySchema";
import type { Lorebook } from "../../lore/LorebookSchema";
import { IMPORT_FORMAT_LABELS, readWorldFile, type ImportFormat } from "../../lore/worldImports";
import { materializeWorld, selectedWorldEntries } from "../../lore/materializeWorld";
import { LoreReview } from "./LoreReview";
import { aventurasLibraryPreview } from "../../lore/aventurasLibrary";
import { downloadJson } from "../studio/studioShared";

export function LoreStudio({ repo }: { repo: IndexedDBRepository }) {
  const [books, setBooks] = useState<Lorebook[]>([]);
  const [draft, setDraft] = useState<Lorebook | null>(null);
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [format, setFormat] = useState<ImportFormat>("auto");
  const [createWorld, setCreateWorld] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function refresh() {
    const [catalog, people, worlds, regions] = await Promise.all([repo.listLorebooks(), repo.listCharacters(), repo.listCampaigns(), repo.listRealms()]);
    setBooks(catalog.entries); setCharacters(people); setCampaigns(worlds); setRealms(regions);
    if (catalog.unreadable) setError(`${catalog.unreadable} unreadable lorebook(s) retained in storage.`);
  }
  useEffect(() => { void refresh().catch(err => setError(String(err))); }, [repo]);
  async function importFile(picked?: File) {
    if (!picked || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { setDraft(await readWorldFile(picked, format)); setCreateWorld(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not read import file."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save() {
    if (!draft || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      let saved = draft;
      let notice = "Lorebook saved. Changes apply to new conversations only.";
      if (createWorld) {
        const result = materializeWorld(draft);
        await repo.saveWorldImport(result);
        saved = result.book;
        notice = `World saved with ${result.characters.length} characters and ${result.places.length} places. Open My space, select the world and choose a place and a character to explore. ` +
          (result.characters.length ? "Characters can also be opened directly from My space." : "Create a character or use one from your library to begin.");
      } else await repo.saveLorebook(draft);
      // Commit succeeded. Do not offer a duplicate retry merely because a later catalog refresh fails.
      setBooks(current => [...current.filter(book => book.id !== saved.id), saved]);
      setDraft(null); setCreateWorld(false); setMessage(notice);
      try { await refresh(); } catch { setError("Saved successfully. Reopen this screen to refresh the library list."); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save import."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function saveAventurasLibrary() {
    if (!draft || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const preview = aventurasLibraryPreview(draft);
      if (!preview.characters.length && !preview.stories.length) throw new Error("Select at least one supported character or scenario entry first.");
      // Retain original JSON before materializing any derived templates.
      await repo.saveLorebook(draft);
      for (const person of preview.characters) await repo.saveCharacter(person);
      for (const story of preview.stories) await repo.saveStory(story);
      setMessage(`Saved ${preview.characters.length} characters and ${preview.stories.length} stories to your library. Original JSON retained in Lorebooks.`);
      setDraft(null);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save Aventuras library items."); }
    finally { pending.current = false; setBusy(false); }
  }
  const selected = draft ? selectedWorldEntries(draft) : [];
  const characterCount = selected.filter(e => e.entity!.kind === "character").length;
  const placeCount = selected.filter(e => e.entity!.kind === "location").length;
  const canCreate = draft?.origin && !draft.materializedRealmId && !books.some(book => book.id === draft.id);
  const needsTarget = draft && ["character", "campaign", "realm"].includes(draft.binding.kind) && !draft.binding.targetId;
  return <section className="sb-lore-studio">
    <h1>Lorebooks</h1>
    <p>Import SillyTavern lore, AI Dungeon, OnlyWorlds, Azgaar, or Aventuras character, lorebook and scenario JSON.
      Each import creates a separate copy with its original retained.</p>
    <input ref={file} type="file" accept=".json,.png,application/json,image/png" hidden
      onChange={event => { const picked = event.target.files?.[0]; event.target.value = ""; void importFile(picked); }} />
    {!draft && <>
      <label className="sb-field">Import format<select disabled={busy} value={format} onChange={e => setFormat(e.target.value as ImportFormat)}>
        {Object.entries(IMPORT_FORMAT_LABELS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select></label>
      <button className="sb-button sb-button--primary" disabled={busy} onClick={() => file.current?.click()}>Import JSON or lorebook</button>
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {draft ? <>
      {draft.origin && <p className="sb-eyebrow">{IMPORT_FORMAT_LABELS[draft.origin.format]}</p>}
      {draft.importNotes?.map(note => <p className="sb-muted" key={note}>{note}</p>)}
      <label className="sb-field">Lorebook name<input maxLength={200} value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      {canCreate && <div className="sb-world-import-choice">
        <label><input type="checkbox" checked={createWorld} disabled={busy} onChange={e => setCreateWorld(e.target.checked)} /> Also create a world in my library</label>
        <p>From selected entries: {characterCount} characters and {placeCount} places. The new world receives its own lore binding.
          Source geometry, combat rules, scripts and images are retained in the original. Existing library cards are kept.</p>
      </div>}
      {!createWorld && <>
        <label className="sb-field">Use in new conversations<select disabled={busy} value={draft.binding.kind}
          onChange={e => setDraft({ ...draft, binding: { kind: e.target.value as Lorebook["binding"]["kind"], targetId: "" } })}>
          <option value="none">Keep in library, unlinked</option><option value="character">With a character</option>
          <option value="campaign">In a campaign</option><option value="realm">In a world</option><option value="all">All new conversations</option>
        </select></label>
        {["character", "campaign", "realm"].includes(draft.binding.kind) && <label className="sb-field">Link to<select disabled={busy} value={draft.binding.targetId}
          onChange={e => setDraft({ ...draft, binding: { ...draft.binding, targetId: e.target.value } })}>
          <option value="">Choose…</option>{(draft.binding.kind === "character" ? characters : draft.binding.kind === "realm" ? realms : campaigns).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
      </>}
      <LoreReview book={draft} onChange={setDraft} disabled={busy} />
      {draft.origin?.format === "aventuras" && ["character", "scenario"].includes((draft.raw as { entity?: string })?.entity ?? "") && <div className="sb-world-import-choice">
        <p>Native library preview: {aventurasLibraryPreview(draft).characters.length} characters, {aventurasLibraryPreview(draft).stories.length} stories. Only approved entries are converted; original JSON is retained. Imported prompts and greetings are not executed.</p>
        {aventurasLibraryPreview(draft).warnings.map(warning => <p className="sb-muted" key={warning}>{warning}</p>)}
        <button className="sb-button" disabled={busy || !draft.name.trim() || !selected.length} onClick={() => void saveAventurasLibrary()}>Save approved items to library</button>
      </div>}
      <div className="sb-dialog__actions"><button className="sb-button" disabled={busy} onClick={() => { setDraft(null); setCreateWorld(false); }}>Cancel</button>
        <button className="sb-button sb-button--primary" disabled={busy || !draft.name.trim() || (createWorld ? characterCount + placeCount === 0 : Boolean(needsTarget))} onClick={() => void save()}>{createWorld ? "Save world & lore" : "Save lorebook"}</button></div>
    </> : <div className="sb-conversation-grid">{books.map(book => <article className="sb-conversation-card" key={book.id}>
      <h2>{book.name}</h2>{book.origin && <span className="sb-eyebrow">{IMPORT_FORMAT_LABELS[book.origin.format]}</span>}
      <p>{book.entries.filter(e => e.approved && e.mode !== "dormant").length} selected · {book.entries.filter(e => e.mode === "dormant").length} dormant · {book.binding.kind === "none" ? "unlinked" : book.binding.kind}</p>
      <button className="sb-button" onClick={() => { setDraft(structuredClone(book)); setCreateWorld(false); }}>Review & link</button>
      <button className="sb-button" onClick={() => { try { downloadJson(`${book.name.replace(/[^a-z0-9-]/gi, "_")}-original.json`, book.raw); } catch (err) { setError(String(err)); } }}>Export original</button>
    </article>)}</div>}
  </section>;
}
