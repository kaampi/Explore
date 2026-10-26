import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { AnatomyTemplateSchema, type AnatomyTemplate } from "@state/StateSchema";
import { BUILTIN_ANATOMY_TEMPLATES, isBuiltInAnatomy } from "@state/builtinAnatomy";

type Part = AnatomyTemplate["parts"][number];
const CAPABILITIES = ["grasp", "support", "locomote", "sense", "manipulate"] as const;
const emptyPart = (id: string, group: string): Part => ({ id, label: id.replaceAll("_", " "), group, capabilities: [] });
const groupsOf = (parts: Part[]) => [...new Set(parts.map((part) => part.group || "Other"))];

export function AnatomyStudio({ repo }: { repo: IndexedDBRepository }) {
  const [custom, setCustom] = useState<AnatomyTemplate[]>([]);
  const [selected, setSelected] = useState<AnatomyTemplate | null>(null);
  const [draft, setDraft] = useState<AnatomyTemplate | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => setCustom(await repo.listAnatomyTemplates());
  useEffect(() => { void refresh().catch((e: unknown) => setError(String(e))); }, [repo]);

  const templates = [...BUILTIN_ANATOMY_TEMPLATES, ...custom.filter((item) => !isBuiltInAnatomy(item.id))];
  const current = draft?.parts.find((part) => part.id === partId);

  function open(item: AnatomyTemplate) {
    setSelected(item);
    setDraft(structuredClone(item));
    setEditing(false);
    setExpanded(groupsOf(item.parts)[0] || "");
    setPartId("");
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
    setSelected(null);
    setEditing(true);
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
      setSelected(null);
      setDraft(null);
      setEditing(false);
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

  return <section className="studio-panel" aria-label="Anatomy library">
    <h2>Anatomy Library</h2>
    <p>Reusable body plans for characters and creatures. Built-in templates are read-only; duplicate one to customize it.</p>
    {draft ? <>
      <div className="studio-actions">
        <button type="button" onClick={() => { setDraft(null); setSelected(null); setEditing(false); }}>← Back to library</button>
        {!editing && <button type="button" onClick={() => setEditing(true)}>View body parts</button>}
        <button type="button" onClick={duplicate}>Duplicate & customize</button>
      </div>
      <h3>{draft.name}</h3>
      <p>{draft.parts.length} body parts · {groupsOf(draft.parts).length} groups {isBuiltInAnatomy(draft.id) ? "· Built-in" : "· Custom"}</p>
      {!editing ? <>
        <p>Example images and anatomical reference gallery will appear here when image assets are added.</p>
        <div className="studio-actions"><button type="button" onClick={() => setEditing(true)}>Open anatomy editor</button></div>
      </> : <>
        {!isBuiltInAnatomy(draft.id) && <label className="setup-field"><span className="setup-field__label">Template name</span><input value={draft.name} onChange={(e) => patch({ name: e.target.value })}/></label>}
        <div className="studio-anatomy-groups">
          {groupsOf(draft.parts).map((group) => <div key={group} className="studio-panel">
            <button type="button" aria-expanded={expanded === group} onClick={() => setExpanded(expanded === group ? "" : group)}>{expanded === group ? "▾" : "▸"} {group} ({draft.parts.filter((part) => (part.group || "Other") === group).length})</button>
            {expanded === group && <div className="studio-actions">
              {draft.parts.filter((part) => (part.group || "Other") === group).map((part) => <button type="button" key={part.id} aria-pressed={partId === part.id} onClick={() => setPartId(part.id)}>{part.label}</button>)}
              {!isBuiltInAnatomy(draft.id) && <button type="button" onClick={() => addPart(group)}>+ Add body part</button>}
            </div>}
          </div>)}
        </div>
        {current && <div className="studio-panel">
          <h3>{current.label}</h3>
          <label className="setup-field"><span className="setup-field__label">Name</span><input value={current.label} disabled={isBuiltInAnatomy(draft.id)} onChange={(e) => patchPart({ label: e.target.value })}/></label>
          <label className="setup-field"><span className="setup-field__label">Group</span><input value={current.group || ""} disabled={isBuiltInAnatomy(draft.id)} onChange={(e) => patchPart({ group: e.target.value })}/></label>
          <label className="setup-field"><span className="setup-field__label">Description</span><textarea value={current.description || ""} disabled={isBuiltInAnatomy(draft.id)} onChange={(e) => patchPart({ description: e.target.value })}/></label>
          <fieldset disabled={isBuiltInAnatomy(draft.id)}><legend>Capabilities</legend>
            {CAPABILITIES.map((capability) => <label key={capability}><input type="checkbox" checked={current.capabilities.includes(capability)} onChange={(e) => patchPart({ capabilities: e.target.checked ? [...current.capabilities, capability] : current.capabilities.filter((value) => value !== capability) })}/>{capability} </label>)}
          </fieldset>
          {!isBuiltInAnatomy(draft.id) && <button type="button" onClick={() => { patch({ parts: draft.parts.filter((part) => part.id !== partId) }); setPartId(""); }}>Remove body part</button>}
        </div>}
        {!isBuiltInAnatomy(draft.id) && <div className="studio-actions"><button type="button" onClick={() => void save()}>Save anatomy</button><button type="button" onClick={() => void remove()}>Delete anatomy</button></div>}
      </>}
    </> : <>
      <div className="studio-actions"><button type="button" onClick={() => { const item = { id: crypto.randomUUID(), name: "New anatomy", version: 1, parts: [emptyPart("head", "Head")] }; setDraft(item); setSelected(null); setEditing(true); setExpanded("Head"); setPartId("head"); }}>+ New anatomy</button></div>
      <div className="studio-anatomy-library" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "12px" }}>
        {templates.map((item) => <button type="button" key={item.id} onClick={() => open(item)} style={{ textAlign: "left", padding: "16px", minHeight: "115px" }}>
          <strong>{item.name}</strong><br/><small>{isBuiltInAnatomy(item.id) ? "Built-in" : "Custom"} · {groupsOf(item.parts).length} groups</small>
        </button>)}
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
