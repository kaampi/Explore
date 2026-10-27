import { useState } from "react";
import { Modal } from "../components/Modal";

type Entry = {
  workspaceId: string; projectId: string; title: string; language: string;
  translationGroupId: string; revision: number; updatedAt: string;
};
type Chapter = { id: string; title: string; prose: string };
type SharedManuscript = Entry & { manuscript: { title: string; synopsis: string; chapters: Chapter[]; bible: unknown[] } };

async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "omit", cache: "no-store" });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Could not reach Core.");
  return data as T;
}

export function CoreManuscripts() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<SharedManuscript | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true); setError(""); setSelected(null);
    try { setEntries(await read<Entry[]>("/api/core/manuscripts")); }
    catch (reason) { setEntries(null); setError(reason instanceof Error ? reason.message : "Could not reach Core."); }
    finally { setBusy(false); }
  }
  async function open(entry: Entry) {
    setBusy(true); setError("");
    try { setSelected(await read<SharedManuscript>(`/api/core/manuscripts/${entry.workspaceId}`)); }
    catch (reason) { setSelected(null); setError(reason instanceof Error ? reason.message : "Could not read this manuscript."); }
    finally { setBusy(false); }
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
        <p className="sb-section-description">Approved Story Bible information is included in the shared manuscript for future Sandbox integration. This preview leaves the manuscript unchanged.</p>
      </div>
    </Modal>}
  </section>;
}
