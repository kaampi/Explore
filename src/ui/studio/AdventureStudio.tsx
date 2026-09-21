import { useEffect, useState } from "react";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import { copyPictureFields } from "@state/placePictures";
import { copyAudioFields } from "@state/placeAudio";
import type {
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
  StoryTemplate,
  VoiceTemplate
} from "@library/LibrarySchema";
import {
  EXAMPLE_CHARACTER_ID,
  EXAMPLE_PLACE_ID,
  EXAMPLE_RULESET_CLOSENESS_ID,
  EXAMPLE_AURORA_BRIEF,
  EXAMPLE_AURORA_LORE,
  EXAMPLE_AURORA_NOTE,
  exampleCharacterTemplate,
  exampleObjectTemplates,
  examplePlaceTemplate,
  exampleRealmTemplates,
  exampleRulesetTemplates,
  exampleVoiceTemplates,
  mergeWithExamples,
  withAuroraRoomIntros
} from "@library/exampleTemplates";
import {
  OBJECT_FILTER_ALL,
  OBJECT_FILTER_PLACE,
  OBJECT_FILTER_STORY,
  OBJECT_FILTER_UNSORTED,
  objectMatchesFilter,
  uniqueObjectTags,
  type ObjectFilter
} from "@library/objectFilter";
import { characterDraftFromTemplate } from "@library/fromForm";
import { callName, formatPersonName } from "@library/personName";
import { applyTraitTokens, traitVoice } from "@state/traitBands";
import { PickChips } from "./ChoiceChips";
import { createSessionFromSetup } from "@session/createSession";
import { realmPlayFields } from "@session/campaignStart";
import { DEFAULT_OLLAMA_MODEL } from "@llm/providers/OllamaProvider";
import { OllamaModelPicker } from "../components/OllamaModelPicker";
import type { StudioView } from "./types";

type CastPick = {
  libraryId: string;
  position: string;
  mood: string;
  clothing: string;
  holding: string;
  stats: Record<string, string>;
  trust: string;
  familiarity: string;
  tension: string;
};

function Chip({
  active,
  label,
  thumb,
  onPick
}: {
  active: boolean;
  label: string;
  thumb?: string;
  onPick: () => void;
}) {
  return (
    <div className={`setup-chip ${active ? "setup-chip--active" : ""}`}>
      <button type="button" className="setup-chip__pick" onClick={onPick}>
        {thumb ? <img className="setup-chip__thumb" src={thumb} alt="" /> : null}
        {label}
      </button>
    </div>
  );
}

export function AdventureStudio({
  sessionId,
  repo,
  onStart,
  onOpenShelf
}: {
  sessionId: string;
  repo: IndexedDBRepository;
  onStart: (session: Session) => void;
  onOpenShelf: (view: StudioView) => void;
}) {
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [stories, setStories] = useState<StoryTemplate[]>([]);
  const [voices, setVoices] = useState<VoiceTemplate[]>([]);
  const [rulesets, setRulesets] = useState<RulesetTemplate[]>([]);
  const [objects, setObjects] = useState<ObjectTemplate[]>([]);
  const [model, setModel] = useState(DEFAULT_OLLAMA_MODEL);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [rulesetId, setRulesetId] = useState<string | null>(null);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [objectFilter, setObjectFilter] = useState<ObjectFilter>(OBJECT_FILTER_ALL);
  const [cast, setCast] = useState<CastPick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      repo.listCharacters(),
      repo.listPlaces(),
      repo.listRealms(),
      repo.listStories(),
      repo.listVoices(),
      repo.listRulesets(),
      repo.listObjects()
    ])
      .then(([nextCharacters, nextPlaces, nextRealms, nextStories, nextVoices, nextRulesets, nextObjects]) => {
        if (cancelled) return;
        setCharacters(nextCharacters);
        setPlaces(nextPlaces);
        setRealms(nextRealms);
        setStories(nextStories);
        setVoices(nextVoices);
        setRulesets(nextRulesets);
        setObjects(nextObjects);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your library.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const visibleVoices = mergeWithExamples(voices, exampleVoiceTemplates());
  const visibleRulesets = mergeWithExamples(rulesets, exampleRulesetTemplates());
  const visibleObjects = mergeWithExamples(objects, exampleObjectTemplates());
  const visibleCharacters = mergeWithExamples(characters, [exampleCharacterTemplate()]);
  const visiblePlaces = mergeWithExamples(places, [examplePlaceTemplate()]);
  const visibleRealms = mergeWithExamples(realms, exampleRealmTemplates());
  const place = visiblePlaces.find((item) => item.id === placeId) ?? null;
  const story = stories.find((item) => item.id === storyId) ?? null;
  const voice = visibleVoices.find((item) => item.id === voiceId) ?? null;
  const ruleset = visibleRulesets.find((item) => item.id === rulesetId) ?? null;
  const objectTagNames = uniqueObjectTags(visibleObjects);
  const filteredObjects = visibleObjects.filter((item) =>
    objectMatchesFilter(item, objectFilter, { storyId, placeId })
  );
  const canStart = Boolean(place) && cast.length > 0;

  function toggleCharacter(template: CharacterTemplate) {
    setCast((current) => {
      if (current.some((item) => item.libraryId === template.id)) {
        return current.filter((item) => item.libraryId !== template.id);
      }
      return [
        ...current,
        {
          libraryId: template.id,
          position: "",
          mood: template.mood,
          clothing: "",
          holding: "",
          stats: {},
          trust: "20",
          familiarity: "10",
          tension: "5"
        }
      ];
    });
  }

  function toggleObject(id: string) {
    setObjectIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function patchCast(libraryId: string, patch: Partial<CastPick>) {
    setCast((current) => current.map((item) => (item.libraryId === libraryId ? { ...item, ...patch } : item)));
  }

  function patchStat(libraryId: string, statId: string, value: string) {
    setCast((current) =>
      current.map((item) =>
        item.libraryId === libraryId ? { ...item, stats: { ...item.stats, [statId]: value } } : item
      )
    );
  }

  async function start() {
    if (!place) {
      setError("Pick a place from the library.");
      return;
    }
    if (cast.length === 0) {
      setError("Cast at least one character.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (voice && !voices.some((item) => item.id === voice.id)) {
        await repo.saveVoice(voice);
      }
      if (ruleset && !rulesets.some((item) => item.id === ruleset.id)) {
        await repo.saveRuleset(ruleset);
      }
      if (place && !places.some((item) => item.id === place.id)) {
        const realm = visibleRealms.find((item) => item.id === place.realmId);
        if (realm && !realms.some((item) => item.id === realm.id)) await repo.saveRealm(realm);
        await repo.savePlace(place);
      }
      const pickedCharacters = cast
        .map((pick) => visibleCharacters.find((item) => item.id === pick.libraryId))
        .filter((item): item is CharacterTemplate => Boolean(item));
      for (const template of pickedCharacters) {
        if (!characters.some((item) => item.id === template.id)) {
          await repo.saveCharacter(template);
        }
      }
      const pickedObjects = objectIds
        .map((id) => visibleObjects.find((item) => item.id === id))
        .filter((item): item is ObjectTemplate => Boolean(item));
      for (const object of pickedObjects) {
        if (!objects.some((item) => item.id === object.id)) {
          await repo.saveObject(object);
        }
      }
      const sceneRooms =
        place.id === EXAMPLE_PLACE_ID ? withAuroraRoomIntros(place.rooms) : place.rooms ?? [];
      const parentRealm = visibleRealms.find((item) => item.id === place.realmId);
      onStart(
        createSessionFromSetup(
          {
            location: place.name,
            placeId: place.id,
            ...(parentRealm?.name ? { realm: parentRealm.name } : {}),
            ...realmPlayFields(parentRealm),
            lighting: place.lighting,
            noise: place.noise,
            music: place.music,
            placeNote: place.note.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_NOTE : ""),
            placeBrief: place.brief?.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_BRIEF : ""),
            ...(place.id === EXAMPLE_PLACE_ID ? { placeLore: EXAMPLE_AURORA_LORE } : {}),
            ...((place.thumbDataUrl ||
              place.imageDataUrl ||
              place.gallery?.length ||
              place.audioDataUrl ||
              place.audioGallery?.length ||
              sceneRooms.length > 0)
              ? {
                  placeVisual: {
                    ...copyPictureFields(place),
                    ...copyAudioFields(place),
                    ...(sceneRooms.length > 0
                      ? {
                          rooms: sceneRooms.map((room) => ({
                            id: room.id,
                            label: room.label,
                            keywords: room.keywords,
                            ...(room.description?.trim() ? { description: room.description.trim() } : {}),
                            ...(room.brief?.trim() ? { brief: room.brief.trim() } : {}),
                            ...copyPictureFields(room),
                            ...copyAudioFields(room)
                          }))
                        }
                      : {})
                  }
                }
              : {}),
            ...(story
              ? {
                  storyTitle: story.name,
                  storyPremise: story.premise
                }
              : {}),
            ...(voice
              ? {
                  voiceTitle: voice.name,
                  voiceInstruction: voice.instruction
                }
              : {}),
            model,
            ...(ruleset
              ? {
                  ruleset: { name: ruleset.name, attributes: ruleset.attributes }
                }
              : {}),
            characters: cast.flatMap((pick) => {
              const template = visibleCharacters.find((item) => item.id === pick.libraryId);
              if (!template) return [];
              const draft = characterDraftFromTemplate(template);
              return [
                {
                  ...draft,
                  mood: pick.mood,
                  position: pick.position,
                  clothing: pick.clothing,
                  holding: pick.holding,
                  stats: pick.stats,
                  trust: pick.trust,
                  familiarity: pick.familiarity,
                  tension: pick.tension
                }
              ];
            }),
            objects: pickedObjects.map((item) => ({
              id: item.id,
              name: item.name,
              note: item.note,
              tags: item.tags,
              ...(item.weight !== undefined ? { weight: item.weight } : {}),
              ...(item.difficulty !== undefined ? { difficulty: item.difficulty } : {}),
              ...(item.checkAttribute ? { checkAttribute: item.checkAttribute } : {})
            }))
          },
          sessionId
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this scene.");
      setBusy(false);
    }
  }

  function fillExample() {
    const emma = visibleCharacters.find((item) => item.id === EXAMPLE_CHARACTER_ID) ?? exampleCharacterTemplate();
    setPlaceId(EXAMPLE_PLACE_ID);
    setRulesetId(EXAMPLE_RULESET_CLOSENESS_ID);
    setCast([
      {
        libraryId: emma.id,
        position: "behind the counter",
        mood: emma.mood || "reserved",
        clothing: "a keeper's coat over indoor clothes",
        holding: "",
        stats: {},
        trust: "20",
        familiarity: "10",
        tension: "5"
      }
    ]);
    setError(null);
    setNotice("Example loaded. Set her stats, clothes, and where she stands, then Start scene.");
  }

  return (
    <div className="setup-screen studio-adventure">
      <div className="setup-card studio-sheet--form">
        <p className="setup-kicker">One-off scene</p>
        <h1 className="setup-title">Assemble a scene</h1>
        <p className="setup-lede">
          No campaign — just tonight. Pick a place and a character. Stats need a rule-set. Then Start scene.
        </p>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Model</p>
          </div>
          <label className="setup-field">
            Ollama
            <OllamaModelPicker model={model} onChange={setModel} variant="field" />
          </label>
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Narrator</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("voices")}>
              Edit voices
            </button>
          </div>
          <div className="setup-chips" role="list">
            <Chip active={voiceId === null} label="None" onPick={() => setVoiceId(null)} />
            {visibleVoices.map((item) => (
              <Chip key={item.id} active={voiceId === item.id} label={item.name} onPick={() => setVoiceId(item.id)} />
            ))}
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Ground story</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("stories")}>
              Edit stories
            </button>
          </div>
          {stories.length === 0 ? (
            <p className="inspector-empty">Optional. Write one on the Stories shelf if this world has a premise.</p>
          ) : (
            <div className="setup-chips" role="list">
              <Chip active={storyId === null} label="None" onPick={() => setStoryId(null)} />
              {stories.map((item) => (
                <Chip key={item.id} active={storyId === item.id} label={item.name} onPick={() => setStoryId(item.id)} />
              ))}
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Landmark</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("places")}>
              Edit locations
            </button>
          </div>
          {visiblePlaces.length === 0 ? (
            <p className="inspector-empty">Save a landmark first — it must live in a realm.</p>
          ) : (
            <div className="setup-chips" role="list">
              {visiblePlaces.map((item) => (
                <Chip
                  key={item.id}
                  active={placeId === item.id}
                  label={item.name}
                  {...(item.thumbDataUrl ? { thumb: item.thumbDataUrl } : {})}
                  onPick={() => setPlaceId(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Rule-set</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("rulesets")}>
              Edit rule-sets
            </button>
          </div>
          <div className="setup-chips" role="list">
            <Chip active={rulesetId === null} label="None" onPick={() => setRulesetId(null)} />
            {visibleRulesets.map((item) => (
              <Chip
                key={item.id}
                active={rulesetId === item.id}
                label={item.name}
                onPick={() => setRulesetId(item.id)}
              />
            ))}
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Objects</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("objects")}>
              Edit objects
            </button>
          </div>
          <p className="inspector-empty" style={{ marginBottom: 8 }}>
            Filter is a lens — you can still put a lightsaber in Midgård if you pick it.
          </p>
          <div className="setup-chips" role="list">
            <Chip active={objectFilter === OBJECT_FILTER_ALL} label="All" onPick={() => setObjectFilter(OBJECT_FILTER_ALL)} />
            <Chip
              active={objectFilter === OBJECT_FILTER_UNSORTED}
              label="Unsorted"
              onPick={() => setObjectFilter(OBJECT_FILTER_UNSORTED)}
            />
            {storyId ? (
              <Chip
                active={objectFilter === OBJECT_FILTER_STORY}
                label="This story"
                onPick={() => setObjectFilter(OBJECT_FILTER_STORY)}
              />
            ) : null}
            {placeId ? (
              <Chip
                active={objectFilter === OBJECT_FILTER_PLACE}
                label="This place"
                onPick={() => setObjectFilter(OBJECT_FILTER_PLACE)}
              />
            ) : null}
            {objectTagNames.map((tag) => (
              <Chip key={tag} active={objectFilter === tag} label={tag} onPick={() => setObjectFilter(tag)} />
            ))}
          </div>
          {filteredObjects.length === 0 ? (
            <p className="inspector-empty">Nothing on this filter. Save objects on the Objects shelf, or switch to All.</p>
          ) : (
            <div className="setup-chips" role="list" style={{ marginTop: 8 }}>
              {filteredObjects.map((item) => (
                <Chip
                  key={item.id}
                  active={objectIds.includes(item.id)}
                  label={item.name}
                  onPick={() => toggleObject(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-section__head">
            <p className="panel-heading">Cast</p>
            <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("characters")}>
              Edit characters
            </button>
          </div>
          {visibleCharacters.length === 0 ? (
            <p className="inspector-empty">The archive is empty. Add someone on the Characters shelf, then come back.</p>
          ) : (
            <div className="setup-chips" role="list">
              {visibleCharacters.map((item) => (
                <Chip
                  key={item.id}
                  active={cast.some((pick) => pick.libraryId === item.id)}
                  label={formatPersonName(item.name, item.familyName, item.middleName)}
                  onPick={() => toggleCharacter(item)}
                />
              ))}
            </div>
          )}
          {cast.map((pick) => {
            const template = visibleCharacters.find((item) => item.id === pick.libraryId);
            if (!template) return null;
            const voice = traitVoice({
              char: callName(template.name, template.familyName, template.middleName),
              pronoun: template.pronoun
            });
            return (
              <div className="setup-character" key={pick.libraryId}>
                <div className="setup-character__head">
                  <span className="setup-character__index">
                    {formatPersonName(template.name, template.familyName, template.middleName)}
                  </span>
                  <button
                    type="button"
                    className="layer-card__toggle"
                    onClick={() => setCast((current) => current.filter((item) => item.libraryId !== pick.libraryId))}
                  >
                    Remove
                  </button>
                </div>
                <div className="setup-row">
                  <label className="setup-field">
                    Mood in this scene
                    <input
                      value={pick.mood}
                      onChange={(e) => patchCast(pick.libraryId, { mood: e.target.value })}
                      placeholder={template.mood || "neutral"}
                    />
                  </label>
                  <label className="setup-field">
                    Where in this place?
                    <input
                      value={pick.position}
                      onChange={(e) => patchCast(pick.libraryId, { position: e.target.value })}
                      placeholder="behind the bar"
                    />
                  </label>
                </div>
                <div className="setup-row">
                  <label className="setup-field">
                    Wearing now <span className="setup-optional">this scene</span>
                    <input
                      value={pick.clothing}
                      onChange={(e) => patchCast(pick.libraryId, { clothing: e.target.value })}
                      placeholder="a winter coat, a lantern…"
                    />
                  </label>
                  <label className="setup-field">
                    In their hands <span className="setup-optional">this scene</span>
                    <input
                      value={pick.holding}
                      onChange={(e) => patchCast(pick.libraryId, { holding: e.target.value })}
                      placeholder="a lamp, empty…"
                    />
                  </label>
                </div>
                {ruleset && ruleset.attributes.length > 0 && (
                  <div className="setup-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    {ruleset.attributes.map((def) => {
                      const current = pick.stats[def.id] ?? "";
                      const listed = def.options ?? [];
                      const picks =
                        def.kind === "text" && listed.length > 0
                          ? [...listed, ...(current && !listed.includes(current) ? [current] : [])]
                          : [];
                      return (
                      <div className="setup-field" key={def.id}>
                        {def.name}
                        {picks.length > 0 || (def.kind === "text" && listed.length > 0) ? (
                          <PickChips
                            ariaLabel={def.name}
                            choices={picks}
                            value={current || undefined}
                            onPick={(choice) =>
                              patchStat(pick.libraryId, def.id, current === choice ? "" : choice)
                            }
                            onAdd={(label) => patchStat(pick.libraryId, def.id, label)}
                          />
                        ) : (
                          <input
                            value={current}
                            onChange={(e) => patchStat(pick.libraryId, def.id, e.target.value)}
                            placeholder={def.kind === "number" ? `${def.min ?? 0}–${def.max ?? 100}` : ""}
                          />
                        )}
                        {def.kind === "text" && def.description?.trim() ? (
                          <span className="setup-optional" style={{ display: "block", marginTop: 4, fontWeight: 400 }}>
                            {applyTraitTokens(def.description.trim(), voice)}
                          </span>
                        ) : def.kind !== "text" && (def.highMeaning?.trim() || def.lowMeaning?.trim() || def.description?.trim()) ? (
                          <span className="setup-optional" style={{ display: "block", marginTop: 4, fontWeight: 400 }}>
                            {[
                              def.highMeaning?.trim() ? `High: ${applyTraitTokens(def.highMeaning.trim(), voice)}` : null,
                              def.lowMeaning?.trim() ? `Low: ${applyTraitTokens(def.lowMeaning.trim(), voice)}` : null,
                              !def.highMeaning?.trim() && !def.lowMeaning?.trim()
                                ? applyTraitTokens(def.description.trim(), voice)
                                : null
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}
                <div className="setup-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <label className="setup-field">
                    Trust <span className="setup-optional">with you</span>
                    <input
                      value={pick.trust}
                      onChange={(e) => patchCast(pick.libraryId, { trust: e.target.value })}
                      placeholder="0–100"
                    />
                  </label>
                  <label className="setup-field">
                    Familiarity
                    <input
                      value={pick.familiarity}
                      onChange={(e) => patchCast(pick.libraryId, { familiarity: e.target.value })}
                      placeholder="0–100"
                    />
                  </label>
                  <label className="setup-field">
                    Tension
                    <input
                      value={pick.tension}
                      onChange={(e) => patchCast(pick.libraryId, { tension: e.target.value })}
                      placeholder="0–100"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>

        {notice && !error && <p className="inspector-empty">{notice}</p>}
        {error && <p className="setup-error">{error}</p>}

        <div className="setup-actions">
          <button type="button" className="setup-start" disabled={!canStart || busy} onClick={() => void start()}>
            Start scene
          </button>
          {!canStart && !busy ? (
            <p className="inspector-empty">
              {!place && cast.length === 0
                ? "Pick a place and a character."
                : !place
                  ? "Pick a place."
                  : "Cast at least one character."}
            </p>
          ) : null}
          <button type="button" className="setup-example" disabled={busy} onClick={fillExample}>
            Load example: Emma at the Aurora Room
          </button>
        </div>
      </div>
    </div>
  );
}
