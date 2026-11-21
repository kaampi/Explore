import { useLanguageControls, useTranslate } from "../i18n/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  newRulesetTemplate,
  type LibrarySource,
  type RulesetTemplate,
} from "@library/LibrarySchema";
import { exampleRulesetTemplates, mergeWithExamples } from "@library/exampleTemplates";
import { bundledRulesetCover } from "@library/genreRulesets";
import { withOriginalTimestamps } from "@library/fromForm";
import { slugifyCharacterId } from "@session/createSession";
import type { AttributeDef } from "@state/StateSchema";
import { EditChips, TRAIT_PRESET_EXAMPLE } from "./ChoiceChips";
import { FormSection } from "./FormSection";
import { IconButton } from "../components/Button";
import { portraitDataUrlFromFile } from "./portrait";
import { StudioList } from "./StudioList";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, sourceCaption } from "./studioShared";

const crossIcon = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

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
  /** How the play view shows it: "" (by whether it moves), a meter, a skill, or not at all. */
  display: "" | "meter" | "skill" | "hidden";
};

type Draft = {
  id: string | null;
  name: string;
  attributes: AttrDraft[];
  playerHealth: string;
  imageDataUrl: string;
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
    desire: false,
    display: "",
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
    desire: def.role === "desire",
    display: def.display ?? "",
  };
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    attributes: [emptyAttr()],
    playerHealth: "",
    imageDataUrl: "",
    source: "player",
  };
}

function draftFrom(template: RulesetTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    attributes:
      template.attributes.length > 0 ? template.attributes.map(attrFromDef) : [emptyAttr()],
    playerHealth: template.playerHealth !== undefined ? String(template.playerHealth) : "",
    imageDataUrl: template.imageDataUrl ?? "",
    source: template.source,
    createdAt: template.createdAt,
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
        maxShift: 0,
        ...(row.display ? { display: row.display } : {}),
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
      ...(row.desire && !desireTaken ? { role: "desire" as const } : {}),
      ...(row.display ? { display: row.display } : {}),
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
      `No high/low meaning on ${missing.map((attr) => attr.name).join(", ")} — the model will guess from the name.`,
    );
  }
  if (dupes.length > 0) {
    bits.push(`Two fields share a name (${dupes.join(", ")}).`);
  }
  return bits.length > 0 ? bits.join(" ") : undefined;
}

export function RulesetStudio({ repo }: { repo: IndexedDBRepository }) {
  const t = useTranslate();
  const [library, setLibrary] = useState<RulesetTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const picker = useRef<HTMLInputElement>(null);
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
  const language = useLanguageControls()?.language;
  const items = mergeWithExamples(library, exampleRulesetTemplates(language));
  const pictureFor = (item: RulesetTemplate) => item.imageDataUrl ?? bundledRulesetCover(item.id);

  function open(id: string) {
    const item = items.find((row) => row.id === id);
    if (!item) return;
    setSelectedId(id);
    setDraft(draftFrom({ ...item, imageDataUrl: pictureFor(item) }));
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
    const healthText = draft.playerHealth.trim();
    const playerHealth = healthText === "" ? undefined : Number(healthText);
    if (
      playerHealth !== undefined &&
      (!Number.isInteger(playerHealth) || playerHealth < 1 || playerHealth > 200)
    ) {
      setError("Player health is empty, or a whole number from 1 to 200.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newRulesetTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name,
        attributes,
        ...(playerHealth !== undefined ? { playerHealth } : {}),
        // An explicit blank lets a saved copy hide its bundled cover.
        ...(draft.imageDataUrl || (draft.id && bundledRulesetCover(draft.id))
          ? { imageDataUrl: draft.imageDataUrl }
          : {}),
        source: draft.source,
      });
      const previous = library.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(
        built,
        previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined),
      );
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
    <div className="studio-split studio-split--shelf studio-split--rulesets">
      <StudioList
        heading="Rule-sets"
        items={items.map((item) => {
          const picture = pictureFor(item);
          return {
            id: item.id,
            name: item.name,
            caption: sourceCaption(item.source, savedIds.has(item.id)),
            ...(picture ? { thumb: picture } : {}),
          };
        })}
        selectedId={selectedId}
        onSelect={open}
        onNew={() => {
          setSelectedId(null);
          setDraft(emptyDraft());
          setError(null);
          setNotice(null);
        }}
        newLabel="Create new"
        empty="No rule-sets yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && (
          <p className="inspector-empty">
            A named bundle of attributes. Characters do not own the fields — a campaign picks a set,
            then fills in values. Write what high and low actually do; that is what the scene
            follows.
          </p>
        )}
        {draft && (
          <>
            <div className="rs-head">
              <div className="rs-head__picture">
                <button
                  type="button"
                  className="rs-head__pick"
                  aria-label={draft.imageDataUrl ? t("rssChangePicture") : t("rssAddPicture")}
                  title={draft.imageDataUrl ? t("rssChangePicture") : t("rssAddPicture")}
                  onClick={() => picker.current?.click()}
                >
                  {draft.imageDataUrl ? (
                    <img src={draft.imageDataUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">+</span>
                  )}
                </button>
                {draft.imageDataUrl ? (
                  <IconButton
                    variant="quiet"
                    size="compact"
                    className="rs-head__clear"
                    label={t("osRemovePicture")}
                    icon={crossIcon}
                    onClick={() => setDraft({ ...draft, imageDataUrl: "" })}
                  />
                ) : null}
                <input
                  ref={picker}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={t("rssAddPicture")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const id = draft.id;
                    portraitDataUrlFromFile(file)
                      .then((imageDataUrl) =>
                        setDraft((current) =>
                          current && current.id === id ? { ...current, imageDataUrl } : current,
                        ),
                      )
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : "Could not read the picture.",
                        ),
                      );
                  }}
                />
              </div>
              <div className="rs-head__text">
                <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
                <SheetNameField
                  ariaLabel="Rule-set name"
                  value={draft.name}
                  placeholder={t("rssNewRuleSet")}
                  onChange={(name) => setDraft({ ...draft, name })}
                />
              </div>
            </div>
            <FormSection
              title={t("rssAttributes")}
              action={
                <button
                  type="button"
                  className="setup-text-btn"
                  onClick={() =>
                    setDraft({ ...draft, attributes: [...draft.attributes, emptyAttr()] })
                  }
                >
                  {t("rssAdd")}
                </button>
              }
            >
              {draft.attributes.map((row, index) => {
                const set = (change: Partial<AttrDraft>) =>
                  setDraft({
                    ...draft,
                    attributes: draft.attributes.map((item) =>
                      item.key === row.key ? { ...item, ...change } : item,
                    ),
                  });
                const label = row.name.trim() || `field ${index + 1}`;
                return (
                  <div className="rs-attr" key={row.key} aria-label={label} role="group">
                    {draft.attributes.length > 1 ? (
                      <IconButton
                        variant="quiet"
                        size="compact"
                        className="rs-attr__remove"
                        label={`${t("spRemove")}: ${label}`}
                        icon={crossIcon}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            attributes: draft.attributes.filter((item) => item.key !== row.key),
                          })
                        }
                      />
                    ) : null}
                    <div className="rs-attr__top">
                      <label className="setup-field rs-attr__name">
                        {t("hsName")}
                        <input
                          value={row.name}
                          onChange={(e) => set({ name: e.target.value })}
                          placeholder="Styrka"
                        />
                      </label>
                      <label className="setup-field">
                        {t("osKind")}
                        <select
                          value={row.kind}
                          onChange={(e) =>
                            set({ kind: e.target.value as "number" | "text", desire: false })
                          }
                        >
                          <option value="number">{t("rssNumber")}</option>
                          <option value="text">{t("rssText")}</option>
                        </select>
                      </label>
                      {row.kind === "number" ? (
                        <>
                          <label className="setup-field">
                            {t("rssMin")}
                            <input
                              value={row.min}
                              inputMode="numeric"
                              onChange={(e) => set({ min: e.target.value })}
                            />
                          </label>
                          <label className="setup-field">
                            {t("rssMax")}
                            <input
                              value={row.max}
                              inputMode="numeric"
                              onChange={(e) => set({ max: e.target.value })}
                            />
                          </label>
                          <label className="setup-field" title={t("rssMoveHint")}>
                            {t("rssMovePerBeat")}
                            <input
                              value={row.maxShift}
                              inputMode="numeric"
                              onChange={(e) => set({ maxShift: e.target.value })}
                              placeholder="0"
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                    {row.kind === "text" ? (
                      <div className="rs-attr__meanings rs-attr__meanings--text">
                        <label className="setup-field">
                          {t("rssMeaning")}
                          <textarea
                            value={row.description}
                            onChange={(e) => set({ description: e.target.value })}
                            placeholder="Honor the live value only. Loyal: …"
                          />
                        </label>
                        <div className="setup-field">
                          {t("rssChoices")}
                          <span className="setup-optional">{t("rssAdventurePicks")}</span>
                          <EditChips
                            items={row.options}
                            preset={TRAIT_PRESET_EXAMPLE}
                            onChange={(options) => set({ options })}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rs-attr__meanings">
                          <label className="setup-field">
                            {t("rssLowMeaning")}
                            <textarea
                              value={row.lowMeaning}
                              onChange={(e) => set({ lowMeaning: e.target.value })}
                              placeholder="{{char}} hangs back, waits for the player to lead…"
                            />
                          </label>
                          <label className="setup-field">
                            <span>
                              {t("rssMidMeaning")}{" "}
                              <span className="setup-optional">{t("optional")}</span>
                            </span>
                            <textarea
                              value={row.midMeaning}
                              onChange={(e) => set({ midMeaning: e.target.value })}
                              placeholder="{{char}} manages, with some effort."
                            />
                          </label>
                          <label className="setup-field">
                            {t("rssHighMeaning")}
                            <textarea
                              value={row.highMeaning}
                              onChange={(e) => set({ highMeaning: e.target.value })}
                              placeholder="{{char}} does it with ease."
                            />
                          </label>
                        </div>
                        {row.description.trim() &&
                        !row.highMeaning.trim() &&
                        !row.lowMeaning.trim() ? (
                          <label className="setup-field">
                            {t("rssFallbackMeaning")}
                            <textarea
                              value={row.description}
                              onChange={(e) => set({ description: e.target.value })}
                            />
                          </label>
                        ) : null}
                        <div className="rs-attr__bottom">
                          <label className="setup-field rs-attr__inline">
                            {t("rssShownInPlay")}
                            <select
                              value={row.display}
                              onChange={(e) =>
                                set({ display: e.target.value as AttrDraft["display"] })
                              }
                            >
                              <option value="">{t("rssShownAuto")}</option>
                              <option value="meter">{t("rssShownMeter")}</option>
                              <option value="skill">{t("rssShownSkill")}</option>
                              <option value="hidden">{t("rssShownHidden")}</option>
                            </select>
                          </label>
                          <label
                            className="setup-check rs-attr__inline"
                            title={t("rssClosenessHint")}
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
                                    desire: on && item.key === row.key && item.kind === "number",
                                  })),
                                });
                              }}
                            />
                            {t("rssClosenessSignal")}
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </FormSection>
            <FormSection
              title={t("rssHealthInAdventures")}
              lede="How much health the player starts with. Weapon damage uses the same unit, so a high number makes long fights. Other people's toughness is a share of it. Empty means 20."
            >
              <label className="setup-field">
                {t("rssPlayerHealthInAdventures")}
                <span className="setup-optional">{t("optional")}</span>
                <input
                  aria-label="Player health in adventures"
                  value={draft.playerHealth}
                  onChange={(e) => setDraft({ ...draft, playerHealth: e.target.value })}
                  placeholder="20"
                  inputMode="numeric"
                />
              </label>
            </FormSection>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button
                type="button"
                className="setup-start"
                disabled={busy}
                onClick={() => void save()}
              >
                {t("cpSave")}
              </button>
              {saved && (
                <button type="button" className="setup-example" onClick={() => void remove()}>
                  {t("cstDelete")}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
