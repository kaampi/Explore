import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { CharacterTemplate, CampaignTemplate } from "@library/LibrarySchema";
import type { Lorebook } from "../../lore/LorebookSchema";
import { readLorebookFile } from "../../lore/sillyTavernLore";
import { LoreReview } from "./LoreReview";
import { downloadJson } from "../studio/studioShared";

export function LoreStudio({ repo }: { repo: IndexedDBRepository }) {
  const [books, setBooks] = useState<Lorebook[]>([]);
  const [draft, setDraft] = useState<Lorebook | null>(null);
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function refresh() {
    const [catalog, people, worlds] = await Promise.all([repo.listLorebooks(), repo.listCharacters(), repo.listCampaigns()]);
    setBooks(catalog.entries); setCharacters(people); setCampaigns(worlds);
    if (catalog.unreadable) setError(`${catalog.unreadable} unreadable lorebook(s) retained in storage.`);
  }
  useEffect(() => { void refresh().catch(err => setError(String(err))); }, [repo]);
  async function importFile(picked?: File) {
    if (!picked || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { setDraft(await readLorebookFile(picked)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not read lorebook."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      await repo.saveLorebook(draft);
      await refresh();
      setDraft(null);
      setMessage("Lorebook saved. Changes apply to new conversations only.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save lorebook."); }
    finally { setBusy(false); }
  }
  return <section className="sb-lore-studio">
    <h1>Lorebooks</h1>
    <p>Bring in SillyTavern World Info JSON, V2/V3 embedded character lore, or a V3 lorebook.
      Each import creates a separate copy; existing books and conversations are kept.</p>
    <input ref={file} type="file" accept=".json,.png,application/json,image/png" hidden
      onChange={event => { const picked = event.target.files?.[0]; event.target.value = ""; void importFile(picked); }} />
    {!draft && <button className="sb-button sb-button--primary" disabled={busy} onClick={() => file.current?.click()}>Import lorebook</button>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {draft ? <>
      <label className="sb-field">Lorebook name<input maxLength={200} value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="sb-field">Use in new conversations<select disabled={busy} value={draft.binding.kind}
        onChange={e => setDraft({ ...draft, binding: { kind: e.target.value as Lorebook["binding"]["kind"], targetId: "" } })}>
        <option value="none">Keep in library, unlinked</option><option value="character">With a character</option>
        <option value="campaign">In a campaign</option><option value="all">All new conversations</option>
      </select></label>
      {(draft.binding.kind === "character" || draft.binding.kind === "campaign") && <label className="sb-field">Link to<select disabled={busy} value={draft.binding.targetId}
        onChange={e => setDraft({ ...draft, binding: { ...draft.binding, targetId: e.target.value } })}>
        <option value="">Choose…</option>{(draft.binding.kind === "character" ? characters : campaigns).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <LoreReview book={draft} onChange={setDraft} disabled={busy} />
      <div className="sb-dialog__actions"><button className="sb-button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
        <button className="sb-button sb-button--primary" disabled={busy || !draft.name.trim() || ((draft.binding.kind === "character" || draft.binding.kind === "campaign") && !draft.binding.targetId)} onClick={() => void save()}>Save lorebook</button></div>
    </> : <div className="sb-conversation-grid">{books.map(book => <article className="sb-conversation-card" key={book.id}>
      <h2>{book.name}</h2><p>{book.entries.filter(e => e.approved && e.mode !== "dormant").length} selected · {book.entries.filter(e => e.mode === "dormant").length} dormant · {book.binding.kind === "none" ? "unlinked" : book.binding.kind}</p>
      <button className="sb-button" onClick={() => setDraft(structuredClone(book))}>Review & link</button>
      <button className="sb-button" onClick={() => { try { downloadJson(`${book.name.replace(/[^a-z0-9-]/gi, "_")}-original.json`, book.raw); } catch (err) { setError(String(err)); } }}>Export original</button>
    </article>)}</div>}
  </section>;
}
