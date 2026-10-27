import { useState } from "react";
import { Modal } from "../components/Modal";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { copyCoreCharacter } from "../../integrations/coreBible";
import type { CoreBibleSection, CoreBibleEntity } from "../../integrations/coreBibleSchema";
import { portraitSrc } from "../studio/portrait";

type Entry = {
  workspaceId: string; projectId: string; title: string; language: string;
  translationGroupId: string; revision: number; updatedAt: string;
};
type Chapter = { id: string; title: string; prose: string };
type SharedManuscript = Entry & { manuscript: { title: string; synopsis: string; chapters: Chapter[]; bible: CoreBibleSection[] } };

async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "omit", cache: "no-store" });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Could not reach Core.");
  return data as T;
}

export function CoreManuscripts({ repo }: { repo: IndexedDBRepository }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<SharedManuscript | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importing, setImporting] = useState(false);

  async function refresh() {
    setBusy(true); setError(""); setSelected(null); setImportNotice("");
    try { setEntries(await read<Entry[]>("/api/core/manuscripts")); }
    catch (reason) { setEntries(null); setError(reason instanceof Error ? reason.message : "Could not reach Core."); }
    finally { setBusy(false); }
  }
  async function open(entry: Entry) {
    setBusy(true); setError(""); setImportNotice("");
    try { setSelected(await read<SharedManuscript>(`/api/core/manuscripts/${entry.workspaceId}`)); }
    catch (reason) { setSelected(null); setError(reason instanceof Error ? reason.message : "Could not read this manuscript."); }
    finally { setBusy(false); }
  }
  async function copy(entity: CoreBibleEntity) {
    if (!selected || importing) return;
    setImporting(true); setImportNotice("");
    try {
      const origin = { workspaceId: selected.workspaceId, projectId: selected.projectId, revision: selected.revision };
      const existing = await repo.listCharacters();
      if (existing.some(person => person.coreOrigin?.workspaceId === origin.workspaceId && person.coreOrigin.entityRef === entity.entity_ref && person.coreOrigin.revision === origin.revision)) {
        setImportNotice(`${entity.name} is already in your Sandbox library from this version.`);
        return;
      }
      const local = copyCoreCharacter(entity, origin);
      await repo.saveCharacter(local);
      setImportNotice(`${local.name} was copied to your Sandbox character library. Storybook was not changed.`);
    } catch (reason) { setImportNotice(reason instanceof Error ? reason.message : "Could not copy this character."); }
    finally { setImporting(false); }
  }
  return <section className="sb-home-section sb-core-shelf" aria-label="Manuscripts shared with Sandbox">
    <div className="sb-section-heading"><h2>Manuscripts from Storybook</h2><button type="button" className="sb-link" disabled={busy} onClick={() => void refresh()}>{entries ? "Refresh" : "Find shared manuscripts"}</button></div>
    <p className="sb-section-description">Only manuscripts explicitly shared with Sandbox appear here. Reading one does not change your local sessions or Storybook's manuscript.</p>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Reading from Core…</p>}
    {entries?.length === 0 && <p>No manuscripts are currently shared with Sandbox.</p>}
    {entries && entries.length > 0 && <ul className="sb-core-list">{entries.map(entry => <li key={entry.workspaceId}><button type="button" disabled={busy} onClick={() => void open(entry)}><strong>{entry.title}</strong><small>{entry.language || "Language not specified"} · Revision {entry.revision}</small></button></li>)}</ul>}
    {selected && <Modal title={selected.manuscript.title} onClose={() => setSelected(null)} wide>
      <div className="sb-core-preview">
        <p className="sb-section-description">Read-only Storybook manuscript · {selected.language || "Language not specified"} · Revision {selected.revision}</p>
        <h3>Synopsis</h3><p>{selected.manuscript.synopsis || "No synopsis yet."}</p>
        {selected.manuscript.chapters.map(chapter => <section key={chapter.id}><h3>{chapter.title || "Untitled chapter"}</h3><p className="sb-core-prose">{chapter.prose}</p></section>)}
        <h3>Story Bible</h3>
        <p className="sb-section-description">Only Storybook's approved, visible information is shared. This is a read-only view; copying a character makes an independent Sandbox card.</p>
        {selected.manuscript.bible.length === 0 && <p>No shared Story Bible entries in this manuscript.</p>}
        {selected.manuscript.bible.map((section, index) => <section key={`${section.kind}-${index}`}><h4>{section.label}</h4>
          <div className="sb-core-entities">{section.entities.map(entity => <article key={entity.entity_ref} className="sb-core-entity">
            <div className="sb-section-heading"><h5>{entity.name}</h5>{section.kind === "characters" && <button type="button" className="sb-link" disabled={importing} onClick={() => void copy(entity)}>Copy to Sandbox library</button>}</div>
            {portraitSrc(entity.referenceImages[0]) && <img src={portraitSrc(entity.referenceImages[0])} alt="" className="sb-core-portrait" />}
            {entity.pronoun && <p>Pronoun: {entity.pronoun}</p>}
            {entity.approximateAge && <p>Approximate age: {entity.approximateAge}</p>}
            {entity.looks && <p>Appearance: {entity.looks}</p>}
            {entity.personality && <p>Personality: {entity.personality}</p>}
            {entity.facts.length > 0 && <ul>{entity.facts.map((fact, factIndex) => <li key={`${fact.predicate}-${factIndex}`}><strong>{fact.label}:</strong> {fact.value}</li>)}</ul>}
          </article>)}</div>
        </section>)}
        {importNotice && <p role="status">{importNotice}</p>}
      </div>
    </Modal>}
  </section>;
}
