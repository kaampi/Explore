import { objectImageFileAllowed, objectImageFromFile } from "./objectImage";
import { useTranslate } from "../i18n/LanguageProvider";
import { CHECK_LEVELS, suggestLevel, type CheckLevel } from "../../game/rules";
import { validateObjectNesting, objectContents } from "@library/objectLocation";
import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  formatTagList,
  newObjectTemplate,
  parseTagList,
  type CharacterTemplate,
  type LibrarySource,
  type ObjectTemplate,
  type PlaceTemplate,
  type StoryTemplate,
} from "@library/LibrarySchema";
import { exampleObjectTemplates, mergeWithExamples } from "@library/exampleTemplates";
import { withOriginalTimestamps } from "@library/fromForm";
import { FormSection } from "./FormSection";
import { FactionField } from "./FactionField";
import { StudioList } from "./StudioList";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, shelfCaption, sourceCaption } from "./studioShared";

type Draft = {
  id: string | null;
  name: string;
  note: string;
  tags: string;
  factionIds?: string[] | undefined;
  storyId: string;
  placeId: string;
  weight: string;
  difficulty: string;
  checkLevel: CheckLevel | "";
  checkAttribute: string;
  isWeapon: boolean;
  weaponSkill: string;
  weaponKind: "melee" | "ranged";
  weaponDamage: string;
  weaponRange: string;
  weaponAmmunition: boolean;
  source: LibrarySource;
  createdAt?: string;
  imageDataUrl: string;
  storyRole: "background" | "useful" | "critical";
  storyImportance: string;
  locationKind: "none" | "place" | "character" | "player" | "object";
  characterId: string;
  containerId: string;
  readableContent: string;
  portable: boolean;
  openable: boolean;
  lockable: boolean;
};

function emptyDraft(): Draft {
  return {
    containerId: "",
    readableContent: "",
    imageDataUrl: "",
    storyRole: "background",
    storyImportance: "",
    locationKind: "none",
    characterId: "",
    portable: false,
    openable: false,
    lockable: false,
    id: null,
    name: "",
    note: "",
    tags: "",
    storyId: "",
    placeId: "",
    weight: "",
    difficulty: "",
    checkLevel: "",
    checkAttribute: "",
    isWeapon: false,
    weaponSkill: "Melee",
    weaponKind: "melee",
    weaponDamage: "3",
    weaponRange: "",
    weaponAmmunition: false,
    source: "player",
  };
}

function draftFrom(template: ObjectTemplate): Draft {
  return {
    containerId:
      template.startingLocation?.kind === "object" ? template.startingLocation.objectId : "",
    readableContent: template.readableContent ?? "",
    imageDataUrl: template.imageDataUrl ?? "",
    storyRole: template.storyRole ?? "background",
    storyImportance: template.storyImportance ?? "",
    locationKind: template.startingLocation?.kind ?? (template.placeId ? "place" : "none"),
    characterId:
      template.startingLocation?.kind === "character" ? template.startingLocation.characterId : "",
    portable: template.portable ?? false,
    openable: template.openable ?? false,
    lockable: template.lockable ?? false,
    id: template.id,
    name: template.name,
    note: template.note,
    tags: formatTagList(template.tags),
    factionIds: template.factionIds,
    storyId: template.storyId ?? "",
    placeId:
      template.startingLocation?.kind === "place"
        ? template.startingLocation.placeId
        : (template.placeId ?? ""),
    weight: template.weight !== undefined ? String(template.weight) : "",
    difficulty: template.difficulty !== undefined ? String(template.difficulty) : "",
    checkLevel:
      template.checkLevel ??
      (template.difficulty !== undefined ? suggestLevel(template.difficulty) : ""),
    checkAttribute: template.checkAttribute ?? "",
    isWeapon: Boolean(template.weapon),
    weaponSkill: template.weapon?.skill ?? "Melee",
    weaponKind: template.weapon?.kind ?? "melee",
    weaponDamage: template.weapon ? String(template.weapon.damage) : "3",
    weaponRange: template.weapon?.range !== undefined ? String(template.weapon.range) : "",
    weaponAmmunition: template.weapon?.usesAmmunition ?? false,
    source: template.source,
    createdAt: template.createdAt,
  };
}

function parseOptionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

export function ObjectStudio({ repo }: { repo: IndexedDBRepository }) {
  const t = useTranslate();
  const [library, setLibrary] = useState<ObjectTemplate[]>([]);
  const [stories, setStories] = useState<StoryTemplate[]>([]);
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLibrary(await repo.listObjects());
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([repo.listObjects(), repo.listStories(), repo.listPlaces(), repo.listCharacters()])
      .then(([nextObjects, nextStories, nextPlaces, nextCharacters]) => {
        if (cancelled) return;
        setLibrary(nextObjects);
        setStories(nextStories);
        setPlaces(nextPlaces);
        setCharacters(nextCharacters);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load objects.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedIds = new Set(library.map((item) => item.id));
  const items = mergeWithExamples(library, exampleObjectTemplates());

  function open(id: string) {
    const fromLibrary = library.find((item) => item.id === id);
    const fromExample = exampleObjectTemplates().find((item) => item.id === id);
    const template = fromLibrary ?? fromExample;
    if (!template) return;
    setSelectedId(id);
    setDraft(draftFrom(template));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name the object.");
      return;
    }
    const weight = parseOptionalNumber(draft.weight);
    const difficulty = parseOptionalNumber(draft.difficulty);
    if (Number.isNaN(weight) || Number.isNaN(difficulty)) {
      setError("Weight and difficulty must be empty or a number 0 or more.");
      return;
    }
    const damage = Number(draft.weaponDamage);
    const range = parseOptionalNumber(draft.weaponRange);
    if (draft.isWeapon) {
      if (!draft.weaponSkill.trim()) {
        setError("Name the skill the weapon uses, for example Melee.");
        return;
      }
      if (!Number.isInteger(damage) || damage < 0 || damage > 50) {
        setError("Weapon damage is a whole number from 0 to 50.");
        return;
      }
      if (Number.isNaN(range) || range === 0) {
        setError("Weapon range is empty or a number above 0, in metres.");
        return;
      }
    }
    if (
      (draft.locationKind === "place" && !draft.placeId) ||
      (draft.locationKind === "character" && !draft.characterId)
    ) {
      setError("Choose a starting place or character.");
      return;
    }
    if (draft.locationKind === "object" && !draft.containerId) {
      setError("Choose a containing object.");
      return;
    }
    if (draft.storyRole === "critical" && !draft.storyImportance.trim()) {
      setError("Explain why this object is essential to the story.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newObjectTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        name,
        note: draft.note.trim(),
        tags: parseTagList(draft.tags),
        factionIds: draft.factionIds,
        ...(draft.storyId ? { storyId: draft.storyId } : {}),
        ...(draft.locationKind === "place"
          ? {
              placeId: draft.placeId,
              startingLocation: { kind: "place" as const, placeId: draft.placeId },
            }
          : draft.locationKind === "character"
            ? { startingLocation: { kind: "character" as const, characterId: draft.characterId } }
            : draft.locationKind === "object"
              ? { startingLocation: { kind: "object" as const, objectId: draft.containerId } }
              : draft.locationKind === "player"
                ? { startingLocation: { kind: "player" as const } }
                : {}),
        ...(draft.imageDataUrl ? { imageDataUrl: draft.imageDataUrl } : {}),
        readableContent: draft.readableContent.trim(),
        storyRole: draft.storyRole,
        storyImportance: draft.storyImportance.trim(),
        portable: draft.portable,
        openable: draft.openable,
        lockable: draft.lockable,
        ...(weight !== undefined ? { weight } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
        ...(draft.checkLevel ? { checkLevel: draft.checkLevel } : {}),
        ...(draft.checkAttribute.trim() ? { checkAttribute: draft.checkAttribute.trim() } : {}),
        ...(draft.isWeapon
          ? {
              weapon: {
                skill: draft.weaponSkill.trim(),
                kind: draft.weaponKind,
                damage,
                ...(range !== undefined ? { range } : {}),
                usesAmmunition: draft.weaponAmmunition,
              },
            }
          : {}),
        source: draft.source,
      });
      const previous = library.find((item) => item.id === built.id);
      const savedItem = withOriginalTimestamps(
        built,
        previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined),
      );
      const nestingError = validateObjectNesting(savedItem, library);
      if (nestingError) throw new Error(nestingError);
      await repo.saveObject(savedItem);
      await refresh();
      setSelectedId(savedItem.id);
      setDraft(draftFrom(savedItem));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !savedIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this object")) return;
    await repo.deleteObject(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
  }

  const saved = Boolean(draft?.id && savedIds.has(draft.id));

  return (
    <div className="studio-split studio-split--shelf">
      <StudioList
        heading="Objects"
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          ...(item.imageDataUrl ? { thumb: item.imageDataUrl } : {}),
          caption: shelfCaption(item.source, savedIds.has(item.id), item.tags),
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
        empty="No objects yet."
      />
      <section className="studio-sheet studio-sheet--form">
        {!draft && <p className="inspector-empty">{t("osCreateTheObjectsThat")}</p>}
        {draft && (
          <>
            <p className="setup-kicker">{sourceCaption(draft.source, saved)}</p>
            <SheetNameField
              ariaLabel="Object name"
              value={draft.name}
              placeholder={t("osNewObject")}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                {t("osDescription")}
                <span className="setup-optional">{t("osWhatItIsIn")}</span>
              </span>
              <textarea
                rows={5}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="A plain gold band. It must not leave this company unwatched."
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                {t("osTags")}
                <span className="setup-optional">{t("osThisObjectOnly")}</span>
              </span>
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="relic, key, weapon"
              />
            </label>
            <FactionField
              repo={repo}
              value={draft.factionIds}
              onChange={(factionIds) => setDraft({ ...draft, factionIds })}
            />
            <FormSection title={t("osPicture")} lede="Optional visual reference.">
              {draft.imageDataUrl && (
                <div>
                  <img
                    src={draft.imageDataUrl}
                    alt={draft.name || "Object"}
                    style={{
                      maxWidth: 240,
                      maxHeight: 200,
                      objectFit: "contain",
                      borderRadius: 12,
                    }}
                  />
                  <button type="button" onClick={() => setDraft({ ...draft, imageDataUrl: "" })}>
                    {t("osRemovePicture")}
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Object picture"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (!objectImageFileAllowed(file)) {
                    setError("Choose a PNG, JPEG or WebP image under 4 MB.");
                    return;
                  }
                  const id = draft.id;
                  void objectImageFromFile(file).then(
                    (imageDataUrl) =>
                      setDraft((current) =>
                        current && current.id === id ? { ...current, imageDataUrl } : current,
                      ),
                    () => setError("Could not read the picture."),
                  );
                }}
              />
            </FormSection>
            <FormSection
              title={t("osRoleInTheStory")}
              lede="Importance is separate from monetary value. This is author information, not a reveal to the player."
            >
              <label className="setup-field">
                <span className="setup-field__label">{t("osRole")}</span>
                <select
                  value={draft.storyRole}
                  onChange={(e) =>
                    setDraft({ ...draft, storyRole: e.target.value as Draft["storyRole"] })
                  }
                >
                  <option value="background">{t("osBackgroundPartOfThe")}</option>
                  <option value="useful">{t("osUsefulCanHelpDuring")}</option>
                  <option value="critical">{t("osStoryCriticalEssentialTo")}</option>
                </select>
              </label>
              <label className="setup-field">
                <span className="setup-field__label">
                  {draft.storyRole === "critical"
                    ? "Why is it essential?"
                    : "Story notes (optional)"}
                </span>
                <textarea
                  value={draft.storyImportance}
                  onChange={(e) => setDraft({ ...draft, storyImportance: e.target.value })}
                  placeholder="The only key that opens the cellar door."
                />
              </label>
            </FormSection>
            <FormSection title={t("osProperties")} lede="Describe how this object can be used.">
              <label>
                <input
                  type="checkbox"
                  checked={draft.portable}
                  onChange={(e) => setDraft({ ...draft, portable: e.target.checked })}
                />{" "}
                Can be picked up
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.openable}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      openable: e.target.checked,
                      lockable: e.target.checked && draft.lockable,
                    })
                  }
                />{" "}
                Can be opened
              </label>
              {draft.openable && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.lockable}
                    onChange={(e) => setDraft({ ...draft, lockable: e.target.checked })}
                  />{" "}
                  Can be locked
                </label>
              )}
            </FormSection>
            <FormSection
              title={t("osStartingLocation")}
              lede="Where the object begins. Its position during play can change."
            >
              <label className="setup-field">
                <span className="setup-field__label">{t("osStarts")}</span>
                <select
                  value={draft.locationKind}
                  onChange={(e) =>
                    setDraft({ ...draft, locationKind: e.target.value as Draft["locationKind"] })
                  }
                >
                  <option value="none">{t("osNotPlacedYet")}</option>
                  <option value="place">{t("osAtAPlace")}</option>
                  <option value="character">{t("osWithACharacter")}</option>
                  <option value="player">{t("osWithThePlayer")}</option>
                  <option value="object">{t("osInsideAnotherObject")}</option>
                </select>
              </label>
              {draft.locationKind === "character" && (
                <label className="setup-field">
                  <span className="setup-field__label">{t("osCharacter")}</span>
                  <select
                    value={draft.characterId}
                    onChange={(e) => setDraft({ ...draft, characterId: e.target.value })}
                  >
                    <option value="">{t("hsChooseACharacter")}</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {draft.locationKind === "object" && (
                <label className="setup-field">
                  <span className="setup-field__label">{t("osContainingObject")}</span>
                  <select
                    value={draft.containerId}
                    onChange={(e) => setDraft({ ...draft, containerId: e.target.value })}
                  >
                    <option value="">{t("osChooseAnObject")}</option>
                    {library
                      .filter(
                        (o) =>
                          o.id !== draft.id &&
                          !validateObjectNesting(
                            {
                              ...o,
                              id: draft.id ?? "new-object",
                              startingLocation: { kind: "object", objectId: o.id },
                            },
                            library,
                          ),
                      )
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="setup-row">
                <label className="setup-field">
                  <span className="setup-field__label">
                    {t("osRelatedStory")}
                    <span className="setup-optional">{t("optional")}</span>
                  </span>
                  <select
                    value={draft.storyId}
                    onChange={(e) => setDraft({ ...draft, storyId: e.target.value })}
                  >
                    <option value="">{t("cstNone")}</option>
                    {stories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setup-field">
                  <span className="setup-field__label">{t("osStartingPlace")}</span>
                  <select
                    disabled={draft.locationKind !== "place"}
                    value={draft.placeId}
                    onChange={(e) => setDraft({ ...draft, placeId: e.target.value })}
                  >
                    <option value="">{t("cstNone")}</option>
                    {places.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </FormSection>
            <FormSection
              title={t("osContents")}
              lede="Objects inside this object. Their location follows this container."
            >
              {draft.id && objectContents(library, draft.id).length ? (
                <ul>
                  {objectContents(library, draft.id).map((o) => (
                    <li key={o.id}>
                      <button type="button" className="sb-link" onClick={() => open(o.id)}>
                        {o.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("osNoObjectsInsideYet")}</p>
              )}
            </FormSection>
            <FormSection
              title={t("osReadableContent")}
              lede="Text or information revealed by reading or examining, not merely seeing the object. A book can also contain physical objects."
            >
              <textarea
                className="setup-field"
                rows={6}
                aria-label="Readable content"
                value={draft.readableContent}
                onChange={(e) => setDraft({ ...draft, readableContent: e.target.value })}
                placeholder="The text of a letter, a recipe, inscriptions or information in a book…"
              />
            </FormSection>
            <FormSection
              title={t("osWeapon")}
              lede="Lets a person carry this as a weapon in a fight. The skill is the name of a value, like Melee. A person without that value is treated as 40."
            >
              <label className="setup-field setup-field--row">
                <input
                  type="checkbox"
                  checked={draft.isWeapon}
                  onChange={(e) => setDraft({ ...draft, isWeapon: e.target.checked })}
                />{" "}
                Can be used as a weapon
              </label>
              {draft.isWeapon && (
                <div className="setup-row">
                  <label className="setup-field">
                    {t("psSkill")}
                    <input
                      aria-label="Weapon skill"
                      value={draft.weaponSkill}
                      onChange={(e) => setDraft({ ...draft, weaponSkill: e.target.value })}
                      placeholder="Melee"
                    />
                  </label>
                  <label className="setup-field">
                    {t("osKind")}
                    <select
                      aria-label="Weapon kind"
                      value={draft.weaponKind}
                      onChange={(e) =>
                        setDraft({ ...draft, weaponKind: e.target.value as "melee" | "ranged" })
                      }
                    >
                      <option value="melee">{t("osCloseCombat")}</option>
                      <option value="ranged">{t("osFromADistance")}</option>
                    </select>
                  </label>
                  <label className="setup-field">
                    {t("osDamage")}
                    <input
                      aria-label="Weapon damage"
                      value={draft.weaponDamage}
                      onChange={(e) => setDraft({ ...draft, weaponDamage: e.target.value })}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="setup-field">
                    {t("osRange")}
                    <span className="setup-optional">{t("osMetresOptional")}</span>
                    <input
                      aria-label="Weapon range"
                      value={draft.weaponRange}
                      onChange={(e) => setDraft({ ...draft, weaponRange: e.target.value })}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="setup-field setup-field--row">
                    <input
                      type="checkbox"
                      checked={draft.weaponAmmunition}
                      onChange={(e) => setDraft({ ...draft, weaponAmmunition: e.target.checked })}
                    />{" "}
                    Uses ammunition
                  </label>
                </div>
              )}
            </FormSection>
            <details>
              <summary>{t("osAdvancedChecks")}</summary>
              <FormSection
                title={t("osForLaterChecks")}
                lede="Stored for rolls that are not wired yet."
              >
                <div className="setup-row">
                  <label className="setup-field">
                    {t("osWeight")}
                    <span className="setup-optional">{t("optional")}</span>
                    <input
                      value={draft.weight}
                      onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                      placeholder="40"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="setup-field">
                    {t("psDifficulty")}
                    <span className="setup-optional">{t("optional")}</span>
                    <select
                      aria-label="Difficulty"
                      value={draft.checkLevel}
                      onChange={(e) =>
                        setDraft({ ...draft, checkLevel: e.target.value as CheckLevel | "" })
                      }
                    >
                      <option value="">{t("osNotSet")}</option>
                      {CHECK_LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="setup-field setup-field--row">
                  <span className="setup-field__label">
                    {t("osCheckAttribute")}
                    <span className="setup-optional">{t("osEGStrengthUnused")}</span>
                  </span>
                  <input
                    value={draft.checkAttribute}
                    onChange={(e) => setDraft({ ...draft, checkAttribute: e.target.value })}
                    placeholder="strength"
                  />
                </label>
              </FormSection>
            </details>
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
