import { useEffect, useState } from "react";
import "./anatomy.css";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { AnatomyTemplateSchema, type AnatomyTemplate } from "@state/StateSchema";
import { BUILTIN_ANATOMY_TEMPLATES, isBuiltInAnatomy } from "@state/builtinAnatomy";

type Part = AnatomyTemplate["parts"][number];
const CAPABILITY_LABELS = { grasp: "Grip and hold", support: "Bear weight", locomote: "Move the body", sense: "Sense surroundings", manipulate: "Handle objects" };
const CAPABILITIES = ["grasp", "support", "locomote", "sense", "manipulate"] as const;
const emptyPart = (id: string, group: string): Part => ({ id, label: id.replaceAll("_", " "), group, capabilities: [] });
const groupsOf = (parts: Part[]) => [...new Set(parts.map((part) => part.group || "Other"))];

export function AnatomyStudio({ repo }: { repo: IndexedDBRepository }) {
  const [custom, setCustom] = useState<AnatomyTemplate[]>([]);
  const [draft, setDraft] = useState<AnatomyTemplate | null>(null);
  const [expanded, setExpanded] = useState("");
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => setCustom(await repo.listAnatomyTemplates());
  useEffect(() => { void refresh().catch((e: unknown) => setError(String(e))); }, [repo]);

  const templates = [...BUILTIN_ANATOMY_TEMPLATES, ...custom.filter((item) => !isBuiltInAnatomy(item.id))];
  const current = draft?.parts.find((part) => part.id === partId);
  function open(item: AnatomyTemplate) {
    setDraft(structuredClone(item));
    setExpanded(groupsOf(item.parts)[0] || "");
    setPartId(item.parts[0]?.id || "");
    setError("");
    setNotice("");
  }
  function patch(update: Partial<AnatomyTemplate>) {
    setDraft((value) => value ? { ...value, ...update } : value);
  }
  function patchPart(update: Partial<Part>) {
    if (!draft || !current) return;
    patch({ parts: draft.parts.map((part) => part.id === partId ? { ...part, ...update } : part) });
  }
  function duplicate() {
    if (!draft) return;
    const copy = { ...structuredClone(draft), id: crypto.randomUUID(), name: `${draft.name} (Custom)`, version: 1 };
    setDraft(copy);
    setNotice("Custom copy ready to edit.");
  }
  async function save() {
    if (!draft || isBuiltInAnatomy(draft.id)) return;
    try {
      const previous = custom.find((item) => item.id === draft.id);
      const parsed = AnatomyTemplateSchema.parse({ ...draft, version: previous ? previous.version + 1 : 1 });
      await repo.saveAnatomyTemplate(parsed);
      await refresh();
      open(parsed);
      setNotice("Anatomy template saved.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function remove() {
    if (!draft || isBuiltInAnatomy(draft.id) || !window.confirm("Delete this anatomy template?")) return;
    try {
      await repo.deleteAnatomyTemplate(draft.id);
      await refresh();
      setDraft(null);
    } catch (e) { setError(String(e)); }
  }
  function addPart(group: string) {
    if (!draft) return;
    const base = "new_part";
    let id = base;
    let n = 2;
    while (draft.parts.some((part) => part.id === id)) id = `${base}_${n++}`;
    patch({ parts: [...draft.parts, emptyPart(id, group)] });
    setPartId(id);
  }

  const builtIn = !!draft && isBuiltInAnatomy(draft.id);
  return <section className="anatomy" aria-label="Anatomy library">
    <header className="anatomy-header">
      <div><span className="anatomy-eyebrow">CHARACTER FOUNDATIONS</span><h2>{draft ? draft.name : "Anatomy Library"}</h2>
      <p>{draft ? "Explore the body, one part at a time." : "A shared structure for every kind of body."}</p></div>
      {draft ? <button className="anatomy-button" onClick={() => { setDraft(null); setError(""); setNotice(""); }}>← All body plans</button> :
      <button className="anatomy-button anatomy-primary" onClick={() => open({ id: crypto.randomUUID(), name: "New anatomy", version: 1, parts: [emptyPart("head", "Head")] })}>+ New body plan</button>}
    </header>
    {draft ? <>
      <div className="anatomy-summary"><div><span className="anatomy-badge">{builtIn ? "Built-in body plan" : "Custom body plan"}</span><span>{draft.parts.length} parts · {groupsOf(draft.parts).length} groups</span></div>
        <button className="anatomy-button" onClick={duplicate}>Customize a copy</button>
      </div>
      <p className="anatomy-muted">Explore uses this body plan to identify body parts and track physical interactions in a scene.</p>
      {draft.id === "builtin-humanoid" && <aside className="anatomy-tip"><strong>One structure. Many characters.</strong><p>Humans, elves and dwarves share this body plan. Describe appearance and size on the character; customize anatomy when the body structure changes.</p></aside>}
      {!builtIn && <label className="anatomy-field">Body plan name<input value={draft.name} onChange={e => patch({ name: e.target.value })}/></label>}
      <div className="anatomy-workspace">
        <nav className="anatomy-navigation" aria-label="Body parts"><div className="anatomy-nav-title">BODY REGIONS <span>Select a part to explore</span></div>
          {groupsOf(draft.parts).map(group => <div className="anatomy-region" key={group}>
            <button className="anatomy-region-button" aria-expanded={expanded === group} onClick={() => { setExpanded(expanded === group ? "" : group); const first = draft.parts.find(part => (part.group || "Other") === group); if (first) setPartId(first.id); }}><span>{group}</span><span>{draft.parts.filter(part => (part.group || "Other") === group).length} {expanded === group ? "−" : "+"}</span></button>
            {expanded === group && <div className="anatomy-part-list">{draft.parts.filter(part => (part.group || "Other") === group).map(part => <button key={part.id} className="anatomy-part" aria-pressed={partId === part.id} onClick={() => setPartId(part.id)}><span>{part.label}</span><span aria-hidden="true">→</span></button>)}
              {!builtIn && <button className="anatomy-add" onClick={() => addPart(group)}>+ Add part</button>}
            </div>}
          </div>)}
        </nav>
        <section className="anatomy-detail" aria-label="Selected body part">
          {current ? <><span className="anatomy-eyebrow">{current.group || "Other"}</span><h3>{current.label}</h3>
            {builtIn ? <>
              {current.description && <p className="anatomy-description">{current.description}</p>}
              <h4>Functions in a scene</h4>
              {current.capabilities.length ? <div className="anatomy-functions">{current.capabilities.map(capability => <span className="anatomy-function" key={capability}><span aria-hidden="true">✓</span> {CAPABILITY_LABELS[capability]}</span>)}</div> : <p className="anatomy-muted">No additional action functions are configured for this part.</p>}
              <div className="anatomy-detail-note"><strong>About this view</strong><p>Built-in plans are ready to use. To change a part or its functions, customize a copy.</p></div>
            </> : <div className="anatomy-editor">
              <label className="anatomy-field">Part name<input value={current.label} onChange={e => patchPart({ label: e.target.value })}/></label>
              <label className="anatomy-field">Body region<input value={current.group || ""} onChange={e => patchPart({ group: e.target.value })}/></label>
              <label className="anatomy-field">Description<textarea rows={3} value={current.description || ""} onChange={e => patchPart({ description: e.target.value })}/></label>
              <fieldset className="anatomy-capabilities"><legend>Functions in a scene</legend>{CAPABILITIES.map(capability => <label key={capability}><input type="checkbox" checked={current.capabilities.includes(capability)} onChange={e => patchPart({ capabilities: e.target.checked ? [...current.capabilities, capability] : current.capabilities.filter(value => value !== capability) })}/>{CAPABILITY_LABELS[capability]}</label>)}</fieldset>
              <button className="anatomy-button anatomy-danger" onClick={() => { patch({ parts: draft.parts.filter(part => part.id !== partId) }); setPartId(""); }}>Remove part</button>
            </div>}
          </> : <div className="anatomy-empty"><h3>Select a body part</h3><p>Choose a region on the left, then a part to see its functions.</p></div>}
        </section>
      </div>
      {!builtIn && <footer className="anatomy-footer"><button className="anatomy-button anatomy-danger" onClick={() => void remove()}>Delete body plan</button><button className="anatomy-button anatomy-primary" onClick={() => void save()}>Save body plan</button></footer>}
    </> : <>
      <aside className="anatomy-tip"><strong>Choose a structure, not an appearance.</strong><p>A body plan defines parts and physical functions. Characters with the same structure can share a plan.</p></aside>
      <div className="anatomy-library">{templates.map(item => <button className="anatomy-card" key={item.id} onClick={() => open(item)}>
        {BUILTIN_ANATOMY_TEMPLATES.some(template => template.id === item.id) && <span className="anatomy-card-illustration"><img src={`/anatomy/${item.id.replace("builtin-", "")}.png`} alt="" loading="lazy" /></span>}
        <span className="anatomy-badge">{isBuiltInAnatomy(item.id) ? "Built-in" : "Custom"}</span><strong>{item.name}</strong><span>{item.parts.length} parts · {groupsOf(item.parts).length} regions</span><span className="anatomy-card-link">Explore body plan →</span></button>)}</div>
    </>}
    {error && <p className="anatomy-feedback anatomy-danger" role="alert">{error}</p>}
    {notice && <p className="anatomy-feedback" role="status">{notice}</p>}
  </section>;
}
