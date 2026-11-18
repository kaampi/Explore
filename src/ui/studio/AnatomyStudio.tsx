import { useTranslate } from "../i18n/LanguageProvider";
import { openGuide } from "../guide/GuidePanel";
import { useEffect, useState } from "react";
import "./anatomy.css";
import { anatomyImageFromFile } from "./anatomyUpload";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { AnatomyTemplateSchema, type AnatomyTemplate } from "@state/StateSchema";
import { BUILTIN_ANATOMY_TEMPLATES, isBuiltInAnatomy } from "@state/builtinAnatomy";

type Part = AnatomyTemplate["parts"][number];
const CAPABILITY_LABELS = {
  grasp: "Grip and hold",
  support: "Bear weight",
  locomote: "Move the body",
  sense: "Sense surroundings",
  manipulate: "Handle objects",
};
const CAPABILITIES = ["grasp", "support", "locomote", "sense", "manipulate"] as const;
const emptyPart = (id: string, group: string): Part => ({
  id,
  label: id.replaceAll("_", " "),
  group,
  capabilities: [],
});
const groupsOf = (parts: Part[]) => [...new Set(parts.map((part) => part.group || "Other"))];

export function AnatomyStudio({ repo }: { repo: IndexedDBRepository }) {
  const t = useTranslate();
  const [custom, setCustom] = useState<AnatomyTemplate[]>([]);
  const [draft, setDraft] = useState<AnatomyTemplate | null>(null);
  const [expanded, setExpanded] = useState("");
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const refresh = async () => setCustom(await repo.listAnatomyTemplates());
  useEffect(() => {
    void refresh().catch((e: unknown) => setError(String(e)));
  }, [repo]);

  const templates = [
    ...BUILTIN_ANATOMY_TEMPLATES,
    ...custom.filter((item) => !isBuiltInAnatomy(item.id)),
  ];
  const current = draft?.parts.find((part) => part.id === partId);
  function open(item: AnatomyTemplate) {
    setDraft(structuredClone(item));
    setExpanded(groupsOf(item.parts)[0] || "");
    setPartId(item.parts[0]?.id || "");
    setError("");
    setNotice("");
  }
  function patch(update: Partial<AnatomyTemplate>) {
    setDraft((value) => (value ? { ...value, ...update } : value));
  }
  async function upload(file: File) {
    if (!draft || uploading) return;
    const id = draft.id;
    setUploading(true);
    setError("");
    try {
      const imageDataUrl = await anatomyImageFromFile(file);
      setDraft((value) => (value?.id === id ? { ...value, imageDataUrl } : value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read this image.");
    } finally {
      setUploading(false);
    }
  }
  function patchPart(update: Partial<Part>) {
    if (!draft || !current) return;
    patch({
      parts: draft.parts.map((part) => (part.id === partId ? { ...part, ...update } : part)),
    });
  }
  function duplicate() {
    if (!draft) return;
    const copy = {
      ...structuredClone(draft),
      id: crypto.randomUUID(),
      name: `${draft.name} (Custom)`,
      version: 1,
    };
    setDraft(copy);
    setNotice("Custom copy ready to edit.");
  }
  async function save() {
    if (!draft || isBuiltInAnatomy(draft.id)) return;
    try {
      const previous = custom.find((item) => item.id === draft.id);
      const parsed = AnatomyTemplateSchema.parse({
        ...draft,
        version: previous ? previous.version + 1 : 1,
      });
      await repo.saveAnatomyTemplate(parsed);
      await refresh();
      open(parsed);
      setNotice("Anatomy template saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove() {
    if (!draft || isBuiltInAnatomy(draft.id) || !window.confirm("Delete this anatomy template?"))
      return;
    try {
      await repo.deleteAnatomyTemplate(draft.id);
      await refresh();
      setDraft(null);
    } catch (e) {
      setError(String(e));
    }
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
  return (
    <section className="anatomy" aria-label="Anatomy library">
      <nav
        aria-label="Anatomy help"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}
      >
        {[
          ["anatomy-intro", "What is Anatomy?"],
          ["anatomy-choose", "Choose a body plan"],
          ["anatomy-custom", "Customize a body plan"],
          ["anatomy-use", "Use Anatomy on a character"],
        ].map(([id, label]) => (
          <button className="anatomy-button" key={id} type="button" onClick={() => openGuide(id)}>
            Help: {label}
          </button>
        ))}
      </nav>
      <header className="anatomy-header">
        <div>
          <span className="anatomy-eyebrow">{t("ansCharacterFoundations")}</span>
          <h2>{draft ? draft.name : "Anatomy Library"}</h2>
          <p>
            {draft
              ? "Explore the body, one part at a time."
              : "A shared structure for different kinds of bodies."}
          </p>
          {!draft && <p>{t("ansExploreUsesBodyPlans")}</p>}
        </div>
        {draft ? (
          <button
            className="anatomy-button"
            onClick={() => {
              setDraft(null);
              setError("");
              setNotice("");
            }}
          >
            {t("ansAllBodyPlans")}
          </button>
        ) : (
          <button
            className="anatomy-button anatomy-primary"
            onClick={() =>
              open({
                id: crypto.randomUUID(),
                name: "New anatomy",
                version: 1,
                parts: [emptyPart("head", "Head")],
              })
            }
          >
            + New body plan
          </button>
        )}
      </header>
      {draft ? (
        <>
          <div className="anatomy-summary">
            <div>
              <span className="anatomy-badge">
                {builtIn ? "Built-in body plan" : "Custom body plan"}
              </span>
              <span>
                {draft.parts.length} parts · {groupsOf(draft.parts).length} groups
              </span>
            </div>
            <button className="anatomy-button" onClick={duplicate}>
              {t("ansCustomizeACopy")}
            </button>
          </div>
          {draft.id === "builtin-humanoid" && (
            <aside className="anatomy-tip">
              <strong>{t("ansOneStructureManyCharacters")}</strong>
              <p>
                Humans, elves and dwarves share this body plan. Describe appearance and size on the
                character; customize anatomy when the body structure changes.
              </p>
            </aside>
          )}
          {!builtIn && (
            <label className="anatomy-field">
              {t("ansBodyPlanName")}
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>
          )}
          {!builtIn && (
            <section className="anatomy-upload" aria-label="Body plan illustration">
              <div>
                <h3>{t("ansIllustration")}</h3>
                <p>{t("ansPngJpegOrWebp")}</p>
                <label className="anatomy-field">
                  {draft.imageDataUrl ? "Replace image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
                {uploading && <p role="status">{t("ansPreparingImage")}</p>}
                {draft.imageDataUrl && (
                  <button
                    className="anatomy-button"
                    disabled={uploading}
                    onClick={() => {
                      const { imageDataUrl: omitted, ...rest } = draft;
                      setDraft(rest);
                    }}
                  >
                    {t("ansRemoveImage")}
                  </button>
                )}
              </div>
              {draft.imageDataUrl && (
                <span className="anatomy-card-illustration">
                  <img src={draft.imageDataUrl} alt={`${draft.name} illustration`} />
                </span>
              )}
            </section>
          )}
          <div className="anatomy-workspace">
            <nav className="anatomy-navigation" aria-label="Body parts">
              <div className="anatomy-nav-title">
                {t("ansBodyRegions")}
                <span>{t("ansSelectAPartTo")}</span>
              </div>
              {groupsOf(draft.parts).map((group) => (
                <div className="anatomy-region" key={group}>
                  <button
                    className="anatomy-region-button"
                    aria-expanded={expanded === group}
                    onClick={() => {
                      setExpanded(expanded === group ? "" : group);
                      const first = draft.parts.find((part) => (part.group || "Other") === group);
                      if (first) setPartId(first.id);
                    }}
                  >
                    <span>{group}</span>
                    <span>
                      {draft.parts.filter((part) => (part.group || "Other") === group).length}{" "}
                      {expanded === group ? "−" : "+"}
                    </span>
                  </button>
                  {expanded === group && (
                    <div className="anatomy-part-list">
                      {draft.parts
                        .filter((part) => (part.group || "Other") === group)
                        .map((part) => (
                          <button
                            key={part.id}
                            className="anatomy-part"
                            aria-pressed={partId === part.id}
                            onClick={() => setPartId(part.id)}
                          >
                            <span>{part.label}</span>
                            <span aria-hidden="true">→</span>
                          </button>
                        ))}
                      {!builtIn && (
                        <button className="anatomy-add" onClick={() => addPart(group)}>
                          + Add part
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </nav>
            <section className="anatomy-detail" aria-label="Selected body part">
              {current ? (
                <>
                  <span className="anatomy-eyebrow">{current.group || "Other"}</span>
                  <h3>{current.label}</h3>
                  {builtIn ? (
                    <>
                      <p>
                        Attached to:{" "}
                        {draft.parts.find((part) => part.id === current.parentId)?.label ||
                          "Independent part"}
                      </p>
                      {current.description && (
                        <p className="anatomy-description">{current.description}</p>
                      )}
                      <h4>{t("ansFunctionsInAScene")}</h4>
                      {current.capabilities.length ? (
                        <div className="anatomy-functions">
                          {current.capabilities.map((capability) => (
                            <span className="anatomy-function" key={capability}>
                              <span aria-hidden="true">✓</span> {CAPABILITY_LABELS[capability]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="anatomy-muted">{t("ansNoAdditionalActionFunctions")}</p>
                      )}
                    </>
                  ) : (
                    <div className="anatomy-editor">
                      <label className="anatomy-field">
                        {t("ansPartName")}
                        <input
                          value={current.label}
                          onChange={(e) => patchPart({ label: e.target.value })}
                        />
                      </label>
                      <label className="anatomy-field">
                        {t("ansBodyRegion")}
                        <input
                          value={current.group || ""}
                          onChange={(e) => patchPart({ group: e.target.value })}
                        />
                      </label>
                      <label className="anatomy-field">
                        {t("ansAttachedTo")}
                        <select
                          value={current.parentId || ""}
                          onChange={(e) => patchPart({ parentId: e.target.value || undefined })}
                        >
                          <option value="">{t("ansIndependentPart")}</option>
                          {draft.parts
                            .filter((part) => part.id !== current.id)
                            .map((part) => (
                              <option key={part.id} value={part.id}>
                                {part.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p>{t("ansIfTheAttachedPart")}</p>
                      <label className="anatomy-field">
                        {t("osDescription")}
                        <textarea
                          rows={3}
                          value={current.description || ""}
                          onChange={(e) => patchPart({ description: e.target.value })}
                        />
                      </label>
                      <fieldset className="anatomy-capabilities">
                        <legend>{t("ansFunctionsInAScene")}</legend>
                        {CAPABILITIES.map((capability) => (
                          <label key={capability}>
                            <input
                              type="checkbox"
                              checked={current.capabilities.includes(capability)}
                              onChange={(e) =>
                                patchPart({
                                  capabilities: e.target.checked
                                    ? [...current.capabilities, capability]
                                    : current.capabilities.filter((value) => value !== capability),
                                })
                              }
                            />
                            {CAPABILITY_LABELS[capability]}
                          </label>
                        ))}
                      </fieldset>
                      <button
                        className="anatomy-button anatomy-danger"
                        onClick={() => {
                          patch({
                            parts: draft.parts
                              .filter((part) => part.id !== partId)
                              .map((part) =>
                                part.parentId === partId ? { ...part, parentId: undefined } : part,
                              ),
                          });
                          setPartId("");
                        }}
                      >
                        {t("ansRemovePart")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="anatomy-empty">
                  <h3>{t("ansSelectABodyPart")}</h3>
                  <p>{t("ansChooseARegionOn")}</p>
                </div>
              )}
            </section>
          </div>
          {!builtIn && (
            <footer className="anatomy-footer">
              <button
                className="anatomy-button anatomy-danger"
                disabled={uploading}
                onClick={() => void remove()}
              >
                {t("ansDeleteBodyPlan")}
              </button>
              <button
                className="anatomy-button anatomy-primary"
                disabled={uploading}
                onClick={() => void save()}
              >
                {t("ansSaveBodyPlan")}
              </button>
            </footer>
          )}
        </>
      ) : (
        <>
          <aside className="anatomy-tip">
            <strong>{t("ansChooseAStructureNot")}</strong>
            <p>{t("ansABodyPlanDefines")}</p>
          </aside>
          <p className="anatomy-muted">{t("ansBuiltInBodyPlans")}</p>
          <div className="anatomy-library">
            {templates.map((item) => (
              <button className="anatomy-card" key={item.id} onClick={() => open(item)}>
                {(item.imageDataUrl ||
                  BUILTIN_ANATOMY_TEMPLATES.some((template) => template.id === item.id)) && (
                  <span className="anatomy-card-illustration">
                    <img
                      src={item.imageDataUrl || `/anatomy/${item.id.replace("builtin-", "")}.png`}
                      alt=""
                      loading="lazy"
                    />
                  </span>
                )}
                <span className="anatomy-badge">
                  {isBuiltInAnatomy(item.id) ? "Built-in" : "Custom"}
                </span>
                <strong>{item.name}</strong>
                <span>
                  {item.parts.length} parts · {groupsOf(item.parts).length} regions
                </span>
                <span className="anatomy-card-link">{t("ansExploreBodyPlan")}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && (
        <p className="anatomy-feedback anatomy-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="anatomy-feedback" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
