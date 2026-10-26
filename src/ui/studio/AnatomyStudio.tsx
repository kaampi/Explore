import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { AnatomyTemplateSchema, type AnatomyTemplate } from "@state/StateSchema";

const STARTERS = [
  { id: "human", name: "Human", parts: "head, torso, left_arm, right_arm, left_hand, right_hand, left_leg, right_leg" },
  { id: "quadruped", name: "Quadruped", parts: "head, torso, front_left_leg, front_right_leg, back_left_leg, back_right_leg, tail" },
  { id: "eight-armed", name: "Eight-armed being", parts: "head, torso, arm_1, arm_2, arm_3, arm_4, arm_5, arm_6, arm_7, arm_8" }
];
const partsText = (parts: AnatomyTemplate["parts"]) => parts.map((part) => part.id).join(", ");
const parseParts = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean).map((id) => ({ id, label: id.replaceAll("_", " "), capabilities: [] }));

export function AnatomyStudio({ repo }: { repo: IndexedDBRepository }) {
  const [items, setItems] = useState<AnatomyTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [parts, setParts] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => setItems(await repo.listAnatomyTemplates());
  useEffect(() => { void refresh().catch((e: unknown) => setError(String(e))); }, [repo]);

  function open(item: AnatomyTemplate) {
    setSelected(item.id);
    setName(item.name);
    setParts(partsText(item.parts));
    setError("");
  }
  function create() {
    setSelected("");
    setName("");
    setParts("");
    setError("");
    setNotice("");
  }
  async function save() {
    try {
      const previous = items.find((item) => item.id === selected);
      const parsed = AnatomyTemplateSchema.parse({
        id: selected || crypto.randomUUID(),
        name: name.trim(),
        version: previous ? previous.version + 1 : 1,
        parts: parseParts(parts)
      });
      await repo.saveAnatomyTemplate(parsed);
      await refresh();
      open(parsed);
      setNotice("Anatomy template saved.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function remove() {
    if (!selected || !window.confirm("Delete this anatomy template? Characters using it will retain their reference.")) return;
    try {
      await repo.deleteAnatomyTemplate(selected);
      await refresh();
      create();
    } catch (e) { setError(String(e)); }
  }

  return <section className="studio-panel" aria-label="Anatomy library">
    <h2>Anatomy library</h2>
    <p>Reusable body plans for characters. No human anatomy is assumed. Existing characters without a template remain valid.</p>
    <div className="studio-actions"><button type="button" onClick={create}>New anatomy</button></div>
    <div className="studio-actions">
      {STARTERS.map((starter) => <button key={starter.id} type="button" onClick={() => {
        setSelected(""); setName(starter.name); setParts(starter.parts); setError(""); setNotice("");
      }}>{starter.name} starter</button>)}
    </div>
    <div className="studio-actions">
      {items.map((item) => <button type="button" key={item.id} onClick={() => open(item)} aria-pressed={selected === item.id}>{item.name} (v{item.version})</button>)}
    </div>
    <label className="setup-field"><span className="setup-field__label">Template name</span>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Eight-armed being" />
    </label>
    <label className="setup-field"><span className="setup-field__label">Body part IDs (comma-separated)</span>
      <textarea className="setup-field__story" value={parts} onChange={(event) => setParts(event.target.value)} placeholder="head, torso, arm_1, arm_2, tail" />
    </label>
    <p>Use stable IDs such as arm_1 or left_hand. Changes to a saved template create a new version.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="studio-actions"><button type="button" onClick={() => void save()}>Save anatomy</button>
      {selected && <button type="button" onClick={() => void remove()}>Delete anatomy</button>}
    </div>
  </section>;
}
