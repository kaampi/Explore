import type { ActionDefinition } from "../../checks/ActionDefinitions";
import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { newRulesetTemplate, type LibrarySource, type RulesetTemplate } from "@library/LibrarySchema";
import { exampleRulesetTemplates, mergeWithExamples } from "@library/exampleTemplates";
import { withOriginalTimestamps } from "@library/fromForm";
import { slugifyCharacterId } from "@session/createSession";
import type { AttributeDef } from "@state/StateSchema";
import { EditChips, ORIENTATION_PRESET } from "./ChoiceChips";
import { FormSection } from "./FormSection";
import { StudioList } from "./StudioList";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, sourceCaption } from "./studioShared";

type AttrDraft = {
  key: string;
  id: string;
  name: string;
  kind: "number" | "text";
  min: string;
  max: string;
  description: string;
  highMeaning: string;
  lowMeaning: string;
  midMeaning: string;
  options: string[];
  maxShift: string;
  desire: boolean;
};

type Draft = {
  id: string | null;
  name: string;
  attributes: AttrDraft[];
  actions: (Omit<ActionDefinition, "attributeId"> & { attributeKey: string })[];
  source: LibrarySource;
  createdAt?: string;
};

function emptyAttr(): AttrDraft {
  return {
    key: crypto.randomUUID(),
    id: "",
    name: "",
    kind: "number",
    min: "0",
    max: "100",
    description: "",
    highMeaning: "",
    lowMeaning: "",
    midMeaning: "",
    options: [],
    maxShift: "0",
    desire: false
  };
}

function attrFromDef(def: AttributeDef): AttrDraft {
  return {
    key: def.id,
    id: def.id,
    name: def.name,
    kind: def.kind,
    min: def.min === undefined ? "0" : String(def.min),
    max: def.max === undefined ? "100" : String(def.max),
    description: def.description ?? "",
    highMeaning: def.highMeaning ?? "",
    lowMeaning: def.lowMeaning ?? "",
    midMeaning: def.midMeaning ?? "",
    options: [...(def.options ?? [])],
    maxShift: String(def.maxShift ?? 0),
    desire: def.role === "desire"
  };
}

function emptyDraft(): Draft {
  return { id: null, name: "", attributes: [emptyAttr()], actions: [], source: "player" };
}

function draftFrom(template: RulesetTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    attributes: template.attributes.length > 0 ? template.attributes.map(attrFromDef) : [emptyAttr()],
    actions: (template.actions ?? []).map(({ attributeId, ...action }) => ({ ...action, attributeKey: attributeId })),
    source: template.source,
    createdAt: template.createdAt
  };
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function attributesFromDraft(rows: AttrDraft[]): AttributeDef[] {
  const used = new Set<string>();
  const parsed: AttributeDef[] = [];
  let desireTaken = false;
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const id = uniqueSlug(row.id.trim() || slugifyCharacterId(name), used);
    used.add(id);
    if (row.kind === "text") {
      parsed.push({
        id,
        name,
        kind: "text",
        description: row.description.trim(),
        highMeaning: "",
        lowMeaning: "",
        midMeaning: "",
        options: row.options,
        maxShift: 0
      });
      continue;
    }
    const min = Number(row.min);
    const max = Number(row.max);
    const maxShift = Number(row.maxShift);
    parsed.push({
      id,
      name,
      kind: "number",
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 100,
      description: row.description.trim(),
      highMeaning: row.highMeaning.trim(),
      lowMeaning: row.lowMeaning.trim(),
      midMeaning: row.midMeaning.trim(),
      options: [],
      maxShift: Number.isFinite(maxShift) ? Math.max(0, Math.min(100, Math.round(maxShift))) : 0,
      ...(row.desire && !desireTaken ? { role: "desire" as const } : {})
    });
    if (row.desire) desireTaken = true;
  }
  return parsed;
}

function meaningSaveHint(attributes: AttributeDef[]): string | undefined {
  const unnamed = new Map<string, number>();
  for (const attr of attributes) {
    const key = attr.name.trim().toLowerCase();
    unnamed.set(key, (unnamed.get(key) ?? 0) + 1);
  }
  const dupes = [...unnamed.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  const missing = attributes.filter((attr) => {
    if (attr.kind === "text") return false;
    return !attr.highMeaning.trim() && !attr.lowMeaning.trim() && !attr.description.trim();
  });
  const bits: string[] = [];
  if (missing.length > 0) {
    bits.push(
      `No high/low meaning on ${missing.map((attr) => attr.name).join(", ")} — the model will guess from the name.`
    );
  }
  if (dupes.length > 0) {
    bits.push(`Two fields share a name (${dupes.join(", ")}).`);
  }
  return bits.length > 0 ? bits.join(" ") : undefined;
}

export function RulesetStudio({ repo }: { repo: IndexedDBRepository }) {
  const [library, setLibrary] = useState<RulesetTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLibrary(await repo.listRulesets());
  }

  useEffect(() => {
    let cancelled = false;
    repo
      .listRulesets()
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load rule-sets.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));
  const items = mergeWithExamples(library, exampleRulesetTemplates());

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
    const name = draft.name.trim();
    if (!name) {
      setError("Name this rule-set.");
      return;
    }
    const attributes = attributesFromDraft(draft.attributes);
    if (attributes.length === 0) {
      setError("Add at least one attribute.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newRulesetTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name,
        attributes,
        actions: draft.actions.map(({ attributeKey, ...action }) => {
          const row = draft.attributes.find((item) => item.key === attributeKey);
          const namedRows = draft.attributes.filter((item) => item.name.trim());
          const attribute = row ? attributes[namedRows.indexOf(row)] : undefined;
          if (!attribute || attribute.kind !== "number") throw new Error(`Choose an existing numeric stat for ${action.name || "each action"}.`);
          return { ...action, attributeId: attribute.id };
        }),
        source: draft.source
      });
      const previous = library.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(built, previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined));
      await repo.saveRuleset(saved);
      await refresh();
      setSelectedId(saved.id);
      setDraft(draftFrom(saved));
      const hint = meaningSaveHint(saved.attributes);
      setNotice(hint ? `Saved. ${hint}` : "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !savedIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this rule-set")) return;
    await repo.deleteRuleset(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Rule-sets"
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
        empty="No rule-sets yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && (
          <p className="inspector-empty">
            A named bundle of attributes. Characters do not own the fields — a campaign picks a set, then fills in values. Write what high and low actually do; that is what the scene follows.
          </p>
        )}
        {draft && (
          <>
            <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
            <SheetNameField
              ariaLabel="Rule-set name"
              value={draft.name}
              placeholder="New rule-set"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <FormSection
              title="Attributes"
              action={
                <button
                  type="button"
                  className="setup-text-btn"
                  onClick={() => setDraft({ ...draft, attributes: [...draft.attributes, emptyAttr()] })}
                >
                  + Add
                </button>
              }
              lede={
                "Name the field, then write high and low. Those sentences are what the model sees — Boldness is not a built-in rule. Mid is optional. Min/max stay on this field (fantasy 1–18, meters 0–100). Move / beat is how far Pass 2 may shift the number (0 = Styrka stays; 15 ≈ a kiss raising Arousal; 3 = a nudge). Closeness signal (at most one) is the field whose live band feeds a kiss/hug when asked. Write for any NPC: {{char}} is their given name, {{they}} / {{them}} / {{their}} / {{themselves}} follow that card's pronoun. Prefer {{char}} as the subject ({{char}} starts…). Do not write She — it will be wrong for a he."
              }
            >
            {draft.attributes.map((row, index) => (
              <div className="setup-character" key={row.key}>
                <div className="setup-character__head">
                  <span className="setup-character__index">field {index + 1}</span>
                  {draft.attributes.length > 1 && (
                    <button
                      type="button"
                      className="layer-card__toggle"
                      onClick={() =>
                        setDraft({ ...draft, attributes: draft.attributes.filter((item) => item.key !== row.key) })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="setup-field">
                  Name
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: draft.attributes.map((item) =>
                          item.key === row.key ? { ...item, name: e.target.value } : item
                        )
                      })
                    }
                    placeholder="Styrka"
                  />
                </label>
                {row.kind === "text" ? (
                  <label className="setup-field">
                    Meaning
                    <textarea
                      value={row.description}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          attributes: draft.attributes.map((item) =>
                            item.key === row.key ? { ...item, description: e.target.value } : item
                          )
                        })
                      }
                      placeholder="Honor the live value only. Hetero: …"
                    />
                  </label>
                ) : (
                  <>
                    <label className="setup-field">
                      High meaning
                      <textarea
                        value={row.highMeaning}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.map((item) =>
                              item.key === row.key ? { ...item, highMeaning: e.target.value } : item
                            )
                          })
                        }
                        placeholder="{{char}} starts and stays in contact this beat…"
                      />
                    </label>
                    <label className="setup-field">
                      Low meaning
                      <textarea
                        value={row.lowMeaning}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.map((item) =>
                              item.key === row.key ? { ...item, lowMeaning: e.target.value } : item
                            )
                          })
                        }
                        placeholder="{{char}} does not start intimacy…"
                      />
                    </label>
                    <label className="setup-field">
                      Mid meaning <span className="setup-optional">optional</span>
                      <textarea
                        value={row.midMeaning}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.map((item) =>
                              item.key === row.key ? { ...item, midMeaning: e.target.value } : item
                            )
                          })
                        }
                        placeholder="{{char}} can answer a kiss, but does not take the next step."
                      />
                    </label>
                    <label className="setup-field">
                        Description / when used for checks
                        <textarea
                          value={row.description}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              attributes: draft.attributes.map((item) =>
                                item.key === row.key ? { ...item, description: e.target.value } : item
                              )
                            })
                          }
                        />
                      </label>
                  </>
                )}
                <div className="setup-row">
                  <label className="setup-field">
                    Kind
                    <select
                      value={row.kind}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          attributes: draft.attributes.map((item) =>
                            item.key === row.key ? { ...item, kind: e.target.value as "number" | "text", desire: false } : item
                          )
                        })
                      }
                    >
                      <option value="number">number</option>
                      <option value="text">text</option>
                    </select>
                  </label>
                  {row.kind === "number" ? (
                    <div>
                    <div className="setup-row" style={{ margin: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <label className="setup-field">
                        Min
                        <input
                          value={row.min}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              attributes: draft.attributes.map((item) =>
                                item.key === row.key ? { ...item, min: e.target.value } : item
                              )
                            })
                          }
                        />
                      </label>
                      <label className="setup-field">
                        Max
                        <input
                          value={row.max}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              attributes: draft.attributes.map((item) =>
                                item.key === row.key ? { ...item, max: e.target.value } : item
                              )
                            })
                          }
                        />
                      </label>
                      <label className="setup-field">
                        Move / beat <span className="setup-optional">0 = stays</span>
                        <input
                          value={row.maxShift}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              attributes: draft.attributes.map((item) =>
                                item.key === row.key ? { ...item, maxShift: e.target.value } : item
                              )
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                    </div>
                    <label
                      className="setup-check"
                      title="Warm beat: if they ask for a kiss or hug, narration does it. At most one field per rule-set. Unchecked on every field = trust alone."
                    >
                      <input
                        type="checkbox"
                        checked={row.desire}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.map((item) => ({
                              ...item,
                              desire: on && item.key === row.key && item.kind === "number"
                            }))
                          });
                        }}
                      />
                      Closeness signal
                    </label>
                    </div>
                  ) : (
                    <div className="setup-field">
                      Choices <span className="setup-optional">Adventure picks</span>
                      <EditChips
                        items={row.options}
                        preset={ORIENTATION_PRESET}
                        addPlaceholder="Asexual…"
                        onChange={(options) =>
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.map((item) =>
                              item.key === row.key ? { ...item, options } : item
                            )
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            </FormSection>
            <FormSection title="Actions" lede="Define when to roll, which player stat applies, and exactly what success means. AI suggests a matching action; you review it before rolling. Existing scenes keep the rule-set copied at their start."
              action={<button type="button" className="setup-text-btn" onClick={() => setDraft({ ...draft, actions: [...draft.actions,
                { id: crypto.randomUUID(), name: "", attributeKey: "", when: "", successMeaning: "" }] })}>+ Add action</button>}>
              {draft.actions.length === 0 && <p className="inspector-empty">No defined actions. Checks use a manually selected stat.</p>}
              {draft.actions.map((action, index) => {
                const update = (fields: Partial<typeof action>) => setDraft({ ...draft, actions: draft.actions.map((item) => item.id === action.id ? { ...item, ...fields } : item) });
                return <div className="setup-character" key={action.id}>
                  <div className="setup-character__head"><span className="setup-character__index">action {index + 1}</span>
                    <button type="button" className="layer-card__toggle" onClick={() => setDraft({ ...draft, actions: draft.actions.filter((item) => item.id !== action.id) })}>Remove</button></div>
                  <label className="setup-field">Name<input maxLength={100} value={action.name} placeholder="Flirt" onChange={(e) => update({ name: e.target.value })} /></label>
                  <label className="setup-field">Player stat<select value={action.attributeKey} onChange={(e) => update({ attributeKey: e.target.value })}>
                    <option value="">Choose a numeric stat</option>
                    {draft.attributes.filter((item) => item.kind === "number" && item.name.trim()).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                  </select></label>
                  <label className="setup-field">When to use it<textarea maxLength={1000} value={action.when} placeholder="Trying to spark romantic interest through conversation." onChange={(e) => update({ when: e.target.value })} /></label>
                  <label className="setup-field">Success means<textarea maxLength={1000} value={action.successMeaning} placeholder="The counterpart responds with warmth and interest in this exchange." onChange={(e) => update({ successMeaning: e.target.value })} /></label>
                </div>;
              })}
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

