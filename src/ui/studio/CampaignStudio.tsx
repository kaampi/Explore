import { pinSessionAnatomy } from "@state/anatomy";
import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository, StudioResume } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { AttributeDef } from "@state/StateSchema";
import { applyTraitTokens, traitVoice } from "@state/traitBands";
import { sessionFromCampaignScene } from "@session/campaignStart";
import { DEFAULT_OLLAMA_MODEL } from "@llm/providers/OllamaProvider";
import { OllamaModelPicker } from "../components/OllamaModelPicker";
import { PickChips } from "./ChoiceChips";
import { HintSelect } from "./HintSelect";
import { ShuttleList } from "./ShuttleList";
import { LensBar } from "./LensBar";
import { AGE_BANDS, matchesAgeBand, type AgeBand } from "@library/ageBand";
import { filterFromLens, lensFromFilter, matchesTagFilter, uniqueTags, type TagFilter } from "@library/objectFilter";
import { SheetNameField } from "./SheetNameField";
import { LoreEditor } from "./LoreEditor";
import { FormSection } from "./FormSection";
import { confirmRemove } from "./studioShared";
import { WHAT_NOW_FLOOR, WHAT_NOW_STAY, isWhatNowStay, venueBuildingName } from "@state/playerDestination";
import type { StudioView } from "./types";
import quill from "../assets/icon_campaign_builder.png";
import {
  emptyCampaignPlayer,
  campaignPlayerIsFilled,
  emptyCampaignScene,
  emptyWhatNowSet,
  whatNowSetsFromScene,
  inferCampaignRealmId,
  campaignLandmarks,
  newCampaignTemplate,
  triggerWhenLabel,
  type CampaignPlayer,
  type CampaignMember,
  type CampaignScene,
  type WhatNowSet,
  type CampaignTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
  type SceneCast,
  type VoiceTemplate
} from "@library/LibrarySchema";
import { withOriginalTimestamps } from "@library/fromForm";
import { removeLinksForScene } from "@library/storyboardLinks";
import { StoryboardCanvas } from "./StoryboardCanvas";
import { dropOversizedPortrait } from "@library/slimPortrait";
import { BUILTIN_PRONOUNS, isBuiltinPronoun, normalizePronoun, pronounLabel } from "@state/pronouns";
import { portraitDataUrlFromFile, PortraitError, portraitSrc } from "./portrait";
import { formatPersonName } from "@library/personName";
import { parseKeywordList } from "@layers/keywords";
import {
  EXAMPLE_CHARACTER_ID,
  EXAMPLE_PLACE_ID,
  EXAMPLE_REALM_DUNBAAR_ID,
  EXAMPLE_RULESET_CLOSENESS_ID,
  exampleCharacterTemplate,
  exampleObjectTemplates,
  examplePlaceTemplate,
  exampleRealmTemplates,
  exampleRulesetTemplates,
  exampleVoiceTemplates,
  mergeWithExamples
} from "@library/exampleTemplates";

type Tab = "general" | "you" | "characters" | "objects" | "scenes" | "storyboard";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "you", label: "You" },
  { id: "characters", label: "Characters" },
  { id: "objects", label: "Objects" },
  { id: "scenes", label: "Scenes" },
  { id: "storyboard", label: "Storyboard" }
];

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

function BrandHeader() {
  return (
    <div className="campaign-brand">
      <img className="campaign-brand__quill" src={quill} alt="" />
      <h1 className="campaign-brand__title">Campaign Builder</h1>
    </div>
  );
}

function personLabel(template: CharacterTemplate | undefined, id: string): string {
  if (!template) return id;
  const name = formatPersonName(template.name, template.familyName, template.middleName);
  return typeof template.approximateAge === "number" ? `${name} · ${template.approximateAge}` : name;
}

// Spreads `draft` first, so every field — including ones this function
// never mentions (sceneLinks, chapters, placeIds, placeLens, storyFlags,
// anything added later) — survives a save by default. Only the fields
// below need trimming, clearing, or recomputation.
function sanitizeCampaign(draft: CampaignTemplate) {
  const model = draft.model?.trim();
  const rulesetId = draft.rulesetId;
  const voiceId = draft.voiceId;
  return {
    ...draft,
    name: draft.name.trim() || "New campaign",
    scenes: draft.scenes.map((scene) => ({
      ...scene,
      name: scene.name.trim() || "Opening",
      triggers: scene.triggers
        .filter((trigger) => trigger.content.trim())
        .map((trigger) => ({ ...trigger, content: trigger.content.trim() })),
      whatNowSets: whatNowSetsFromScene(scene).map((set) => ({
        ...set,
        choices: set.choices.slice(0, 3)
      })),
      startRoomId: scene.startRoomId?.trim() ?? ""
    })),
    ...(model ? { model } : { model: undefined }),
    ...(rulesetId ? { rulesetId } : { rulesetId: undefined }),
    ...(voiceId ? { voiceId } : { voiceId: undefined }),
    ...(draft.realmId?.trim() ? { realmId: draft.realmId.trim() } : { realmId: undefined }),
    ...(draft.lens ? { lens: draft.lens } : { lens: undefined }),
    ...(draft.objectLens ? { objectLens: draft.objectLens } : { objectLens: undefined }),
    player: sanitizeYou(draft.player)
  };
}

function sanitizeYou(player: CampaignPlayer | undefined): CampaignPlayer | undefined {
  if (!campaignPlayerIsFilled(player) || !player) return undefined;
  return dropOversizedPortrait({
    name: player.name.trim(),
    appearance: player.appearance.trim(),
    personality: player.personality.trim(),
    stats: player.stats,
    ...(player.pronoun ? { pronoun: player.pronoun } : {}),
    ...(player.portraitDataUrl?.trim() ? { portraitDataUrl: player.portraitDataUrl.trim() } : {})
  });
}

function withCampaignRealm(campaign: CampaignTemplate, places: PlaceTemplate[]): CampaignTemplate {
  const realmId = inferCampaignRealmId(campaign, places);
  if (!realmId || campaign.realmId === realmId) return campaign;
  return { ...campaign, realmId };
}

function emptyCast(characterId: string, mood: string): SceneCast {
  return {
    characterId,
    position: "",
    mood,
    clothing: "",
    holding: "",
    trust: "20",
    familiarity: "10",
    tension: "5"
  };
}

export function CampaignStudio({
  sessionId,
  repo,
  resume,
  onStart,
  onOpenShelf,
  onOneOff
}: {
  sessionId: string;
  repo: IndexedDBRepository;
  resume: StudioResume | null;
  onStart: (session: Session) => void;
  onOpenShelf: (view: StudioView) => void;
  onOneOff: () => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [voices, setVoices] = useState<VoiceTemplate[]>([]);
  const [rulesets, setRulesets] = useState<RulesetTemplate[]>([]);
  const [objects, setObjects] = useState<ObjectTemplate[]>([]);
  const [draft, setDraft] = useState<CampaignTemplate | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshNight, setFreshNight] = useState(false);
  const [handoffDraft, setHandoffDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const resumeApplied = useRef(false);
  const youPortraitRef = useRef<HTMLInputElement>(null);

  async function refresh(): Promise<CampaignTemplate[]> {
    const results = await Promise.allSettled([
      repo.listCampaigns(),
      repo.listCharacters(),
      repo.listPlaces(),
      repo.listRealms(),
      repo.listVoices(),
      repo.listRulesets(),
      repo.listObjects()
    ]);
    const [nextCampaigns, nextCharacters, nextPlaces, nextRealms, nextVoices, nextRulesets, nextObjects] = results;
    const listed = nextCampaigns.status === "fulfilled" ? nextCampaigns.value : [];
    if (nextCampaigns.status === "fulfilled") setCampaigns(nextCampaigns.value);
    if (nextCharacters.status === "fulfilled") setCharacters(nextCharacters.value);
    if (nextPlaces.status === "fulfilled") setPlaces(nextPlaces.value);
    if (nextRealms.status === "fulfilled") setRealms(nextRealms.value);
    if (nextVoices.status === "fulfilled") setVoices(nextVoices.value);
    if (nextRulesets.status === "fulfilled") setRulesets(nextRulesets.value);
    if (nextObjects.status === "fulfilled") setObjects(nextObjects.value);
    if (results.some((item) => item.status === "rejected")) {
      throw new Error("Could not load your library.");
    }
    return listed;
  }

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then(async (listed) => {
        if (cancelled) return;
        setError(null);
        if (resumeApplied.current || !resume?.campaignId) return;
        const found = listed.find((item) => item.id === resume.campaignId);
        if (!found) {
          await repo.clearStudioResume();
          return;
        }
        resumeApplied.current = true;
        setDraft(found);
        setTab("scenes");
        setFreshNight(true);
        setHandoffDraft(resume.handoff ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your library.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo, resume]);

  const visibleVoices = mergeWithExamples(voices, exampleVoiceTemplates());
  const visibleRulesets = mergeWithExamples(rulesets, exampleRulesetTemplates());
  const visibleObjects = mergeWithExamples(objects, exampleObjectTemplates());
  const visibleCharacters = mergeWithExamples(characters, [exampleCharacterTemplate()]);
  const visiblePlaces = mergeWithExamples(places, [examplePlaceTemplate()]);
  const visibleRealms = mergeWithExamples(realms, exampleRealmTemplates());
  const savedIds = new Set(campaigns.map((item) => item.id));

  function open(id: string) {
    const found = campaigns.find((item) => item.id === id);
    if (!found) return;
    setDraft(withCampaignRealm(found, visiblePlaces));
    setTab("general");
    setError(null);
    setNotice(null);
    setFreshNight(false);
    setHandoffDraft(resume?.campaignId === found.id ? resume.handoff ?? "" : "");
  }

  function createNew() {
    setDraft({
      ...newCampaignTemplate({
        name: "New campaign",
        scenes: [emptyCampaignScene()]
      }),
      name: ""
    });
    setTab("general");
    setError(null);
    setNotice("Name it, pick who belongs, then build a scene.");
    setFreshNight(false);
    setHandoffDraft("");
  }

  async function loadExampleCampaign() {
    const emma = visibleCharacters.find((item) => item.id === EXAMPLE_CHARACTER_ID) ?? exampleCharacterTemplate();
    const built = newCampaignTemplate({
      name: "The Aurora Room",
      playerIntro: "A quiet harbor archive, kept long after hours. Stay as long as you like.",
      rulesetId: EXAMPLE_RULESET_CLOSENESS_ID,
      realmId: EXAMPLE_REALM_DUNBAAR_ID,
      people: [{ characterId: emma.id, stats: {} }],
      scenes: [
        {
          ...emptyCampaignScene(),
          name: "Opening",
          placeId: EXAMPLE_PLACE_ID,
          people: [
            {
              ...emptyCast(emma.id, emma.mood || "reserved"),
              position: "behind the counter",
              clothing: "a keeper's coat over indoor clothes"
            }
          ]
        }
      ]
    });
    setDraft(built);
    setTab("scenes");
    setError(null);
    setNotice("Example loaded. Check Opening, then Start this scene — or add a Trigger first.");
    setFreshNight(false);
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name the campaign.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const realmId = inferCampaignRealmId(draft, visiblePlaces);
      const built = newCampaignTemplate(
        sanitizeCampaign({ ...draft, name, ...(realmId ? { realmId } : {}) })
      );
      const previous = campaigns.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(built, previous);
      await repo.saveCampaign(saved);
      await refresh();
      setDraft(saved);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft || !savedIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this campaign")) return;
    await repo.deleteCampaign(draft.id);
    const landed = await repo.loadStudioResume();
    if (landed?.campaignId === draft.id) await repo.clearStudioResume();
    await refresh();
    setDraft(null);
    setNotice(null);
    setFreshNight(false);
  }

  async function persistExamplesUsed(next: CampaignTemplate) {
    const realmId = inferCampaignRealmId(next, visiblePlaces);
    if (realmId) {
      const realm = visibleRealms.find((item) => item.id === realmId);
      if (realm && !realms.some((item) => item.id === realm.id)) await repo.saveRealm(realm);
      for (const landmark of campaignLandmarks({ realmId, placeIds: [] }, visiblePlaces)) {
        if (!places.some((item) => item.id === landmark.id)) await repo.savePlace(landmark);
      }
    }
    const place = visiblePlaces.find((item) => next.scenes.some((scene) => scene.placeId === item.id));
    if (place) {
      const realm = visibleRealms.find((item) => item.id === place.realmId);
      if (realm && !realms.some((item) => item.id === realm.id)) await repo.saveRealm(realm);
      if (!places.some((item) => item.id === place.id)) await repo.savePlace(place);
    }
    const ruleset = visibleRulesets.find((item) => item.id === next.rulesetId);
    if (ruleset && !rulesets.some((item) => item.id === ruleset.id)) await repo.saveRuleset(ruleset);
    const voice = visibleVoices.find((item) => item.id === next.voiceId);
    if (voice && !voices.some((item) => item.id === voice.id)) await repo.saveVoice(voice);
    for (const member of next.people) {
      const template = visibleCharacters.find((item) => item.id === member.characterId);
      if (template && !characters.some((item) => item.id === template.id)) await repo.saveCharacter(template);
    }
    for (const id of next.objectIds) {
      const template = visibleObjects.find((item) => item.id === id);
      if (template && !objects.some((item) => item.id === template.id)) await repo.saveObject(template);
    }
  }

  async function startScene(scene: CampaignScene) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await persistExamplesUsed(draft);
      const realmId = inferCampaignRealmId(draft, visiblePlaces);
      const named = sanitizeCampaign({
        ...draft,
        name: draft.name.trim() || "New campaign",
        ...(realmId ? { realmId } : {})
      });
      const saved = withOriginalTimestamps(
        newCampaignTemplate(named),
        campaigns.find((item) => item.id === draft.id)
      );
      await repo.saveCampaign(saved);
      const result = sessionFromCampaignScene(
        {
          campaign: saved,
          scene,
          places: visiblePlaces,
          realms: visibleRealms,
          characters: visibleCharacters,
          objects: visibleObjects,
          voices: visibleVoices,
          rulesets: visibleRulesets,
          ...(handoffDraft.trim() ? { handoff: handoffDraft.trim() } : {})
        },
        sessionId
      );
      if (!result.ok) {
        setError(result.reason);
        setBusy(false);
        return;
      }
      onStart(pinSessionAnatomy(result.session, await repo.listAnatomyTemplates()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this scene.");
      setBusy(false);
    }
  }

  function patchScene(sceneId: string, patch: Partial<CampaignScene> | ((scene: CampaignScene) => CampaignScene)) {
    if (!draft) return;
    setDraft({
      ...draft,
      scenes: draft.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        return typeof patch === "function" ? patch(scene) : { ...scene, ...patch };
      })
    });
  }

  function addPerson(id: string) {
    if (!draft || draft.people.some((item) => item.characterId === id)) return;
    const template = visibleCharacters.find((item) => item.id === id);
    setDraft({
      ...draft,
      people: [...draft.people, { characterId: id, stats: {}, lore: template?.lore ?? [] }]
    });
  }

  function removePerson(id: string) {
    if (!draft || !draft.people.some((item) => item.characterId === id)) return;
    setDraft({
      ...draft,
      people: draft.people.filter((item) => item.characterId !== id),
      scenes: draft.scenes.map((scene) => ({
        ...scene,
        people: scene.people.filter((item) => item.characterId !== id)
      }))
    });
  }

  function addObject(id: string) {
    if (!draft || draft.objectIds.includes(id)) return;
    setDraft({ ...draft, objectIds: [...draft.objectIds, id] });
  }

  function removeObject(id: string) {
    if (!draft || !draft.objectIds.includes(id)) return;
    setDraft({
      ...draft,
      objectIds: draft.objectIds.filter((item) => item !== id),
      scenes: draft.scenes.map((scene) => ({
        ...scene,
        objectIds: scene.objectIds.filter((item) => item !== id)
      }))
    });
  }

  function patchMember(characterId: string, patch: Partial<CampaignMember>) {
    if (!draft) return;
    setDraft({
      ...draft,
      people: draft.people.map((item) => (item.characterId === characterId ? { ...item, ...patch } : item))
    });
  }

  function patchStat(characterId: string, statId: string, value: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      people: draft.people.map((item) =>
        item.characterId === characterId ? { ...item, stats: { ...item.stats, [statId]: value } } : item
      )
    });
  }

  function patchYou(patch: Partial<CampaignPlayer>) {
    if (!draft) return;
    setDraft({ ...draft, player: { ...(draft.player ?? emptyCampaignPlayer()), ...patch } });
  }

  function patchYouStat(statId: string, value: string) {
    if (!draft) return;
    const you = draft.player ?? emptyCampaignPlayer();
    patchYou({ stats: { ...you.stats, [statId]: value } });
  }

  if (!draft) {
    return (
      <div className="setup-screen studio-adventure">
        <div className="setup-card campaign-builder">
          <BrandHeader />
          <p className="setup-lede">
            A campaign is who and where belong together. A scene is tonight — then you press Start.
          </p>
          {campaigns.length > 0 ? (
            <>
              <p className="panel-heading">Your campaigns</p>
              <div className="setup-chips" role="list" style={{ marginBottom: 22 }}>
                {campaigns.map((item) => (
                  <Chip key={item.id} active={false} label={item.name} onPick={() => open(item.id)} />
                ))}
              </div>
            </>
          ) : (
            <p className="inspector-empty" style={{ marginBottom: 18 }}>
              None yet. The library shelves still make the cards — this screen puts them together.
            </p>
          )}
          {error && <p className="setup-error">{error}</p>}
          <div className="setup-actions">
            <button type="button" className="setup-start" onClick={createNew}>
              New campaign
            </button>
            <button type="button" className="setup-text-btn" onClick={() => void loadExampleCampaign()}>
              Load the example campaign
            </button>
            <button type="button" className="setup-text-btn" onClick={onOneOff}>
              One-off scene
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ruleset = visibleRulesets.find((item) => item.id === draft.rulesetId) ?? null;
  const liveRealmId = inferCampaignRealmId(draft, visiblePlaces);
  const campaignPlaces = campaignLandmarks(
    { realmId: liveRealmId || undefined, placeIds: draft.placeIds },
    visiblePlaces
  );
  const campaignPeople = visibleCharacters.filter((item) => draft.people.some((member) => member.characterId === item.id));
  const campaignObjects = visibleObjects.filter((item) => draft.objectIds.includes(item.id));
  const pickFilter = tab === "objects" ? filterFromLens(draft.objectLens) : filterFromLens(draft.lens);
  const shelfTags = tab === "objects" ? uniqueTags(visibleObjects) : uniqueTags(visibleCharacters);

  function setPickFilter(next: TagFilter) {
    if (!draft) return;
    const lens = lensFromFilter(next);
    if (tab === "objects") {
      if (!lens) {
        const { objectLens: _drop, ...rest } = draft;
        setDraft(rest);
        return;
      }
      setDraft({ ...draft, objectLens: lens });
      return;
    }
    if (!lens) {
      const { lens: _drop, ...rest } = draft;
      setDraft(rest);
      return;
    }
    setDraft({ ...draft, lens });
  }

  function shelfEmpty(allGone: string): string {
    if (pickFilter === null) return allGone;
    return "Nothing on this lens. Try All, or tag cards on the shelf.";
  }

  return (
    <div className="studio-split campaign-workspace">
      <nav className="campaign-nav" aria-label="Campaign parts">
        <p className="campaign-nav__kicker">Campaign</p>
        <p className="campaign-nav__name">{draft.name.trim() || "New campaign"}</p>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "campaign-nav__btn is-on" : "campaign-nav__btn"}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="setup-text-btn campaign-nav__back"
          onClick={() => {
            setDraft(null);
            setFreshNight(false);
          }}
        >
          All campaigns
        </button>
      </nav>
      <section className="studio-sheet studio-sheet--form campaign-workspace__sheet">
        <SheetNameField
          ariaLabel="Campaign name"
          value={draft.name}
          placeholder="New campaign"
          onChange={(name) => setDraft({ ...draft, name })}
        />

        {tab === "characters" || tab === "objects" ? (
          <LensBar
            filter={pickFilter}
            tags={shelfTags}
            onPick={setPickFilter}
            lede={
              tab === "objects"
                ? "Object tags only. Hides the shelf — not what already belongs."
                : "Character tags only. Hides the shelf — not who already belongs."
            }
          />
        ) : null}

        {tab === "general" && (
          <section className="setup-section campaign-general">
            <section className="form-section campaign-general__model-row">
              <p className="panel-heading">Model</p>
              <label className="campaign-general__model">
                <span className="campaign-general__prefix">Ollama</span>
                <OllamaModelPicker
                  model={draft.model?.trim() || DEFAULT_OLLAMA_MODEL}
                  onChange={(model) => setDraft({ ...draft, model })}
                  variant="field"
                />
              </label>
            </section>
            <FormSection
              title="Realm"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("places")}>
                  Edit locations
                </button>
              }
              lede={
                campaignPlaces.length > 0
                  ? `All landmarks in this realm are in the campaign: ${campaignPlaces.map((item) => item.name).join(", ")}.`
                  : "The map. Every landmark under this realm is available to scenes."
              }
            >
              <select
                aria-label="Realm"
                value={liveRealmId}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    const { realmId: _drop, ...rest } = draft;
                    setDraft({
                      ...rest,
                      scenes: draft.scenes.map((scene) => ({ ...scene, placeId: "", startRoomId: "" }))
                    });
                    return;
                  }
                  const allowed = new Set(
                    visiblePlaces.filter((item) => item.realmId === value).map((item) => item.id)
                  );
                  setDraft({
                    ...draft,
                    realmId: value,
                    scenes: draft.scenes.map((scene) =>
                      allowed.has(scene.placeId) ? scene : { ...scene, placeId: "", startRoomId: "" }
                    )
                  });
                }}
              >
                <option value="">{visibleRealms.length === 0 ? "Create a realm on Locations first" : "Choose a realm"}</option>
                {visibleRealms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormSection>
            <div className="campaign-general__pair">
            <FormSection
              title="Rule-set"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("rulesets")}>
                  Edit rule-sets
                </button>
              }
            >
              <select
                aria-label="Rule-set"
                value={draft.rulesetId ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    const { rulesetId: _drop, ...rest } = draft;
                    setDraft(rest);
                    return;
                  }
                  setDraft({ ...draft, rulesetId: value });
                }}
              >
                <option value="">None</option>
                {visibleRulesets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormSection>
            <FormSection
              title="Narrator"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("voices")}>
                  Edit voices
                </button>
              }
            >
              <HintSelect
                ariaLabel="Narrator"
                value={draft.voiceId ?? ""}
                noneLabel="None"
                choices={visibleVoices.map((item) => ({
                  id: item.id,
                  label: item.name,
                  hint: item.instruction
                }))}
                onChange={(id) => {
                  if (!id) {
                    const { voiceId: _drop, ...rest } = draft;
                    setDraft(rest);
                    return;
                  }
                  setDraft({ ...draft, voiceId: id });
                }}
              />
            </FormSection>
            </div>
            <FormSection title="Intro for the player">
              <textarea
                className="setup-field__story"
                value={draft.playerIntro}
                onChange={(e) => setDraft({ ...draft, playerIntro: e.target.value })}
                placeholder="The long pitch — What you tell a person sitting down to play"
              />
            </FormSection>
            <FormSection title="Background for the story (What AI knows)">
              <textarea
                className="setup-field__story"
                value={draft.startPrompt}
                onChange={(e) => setDraft({ ...draft, startPrompt: e.target.value })}
                placeholder="The world in a few lines for the AI-model to have. Player will not get this information unless told by someone in the game"
              />
            </FormSection>
          </section>
        )}

        {tab === "you" && (
          <section className="setup-section">
            <input
              ref={youPortraitRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void portraitDataUrlFromFile(file)
                  .then((portraitDataUrl) => patchYou({ portraitDataUrl }))
                  .catch((err) =>
                    setError(err instanceof PortraitError ? err.message : "Could not read that image.")
                  );
              }}
            />
            <p className="form-section__lede">
              Who you play tonight. Not a person on the Characters shelf. Emma sees this; the portrait is UI only.
            </p>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Given name</span>
              <input
                value={(draft.player ?? emptyCampaignPlayer()).name}
                onChange={(e) => patchYou({ name: e.target.value })}
                placeholder="Your name in this story"
              />
            </label>
            <div className="studio-portrait studio-portrait--character">
              <div className="studio-portrait__frame">
                {portraitSrc((draft.player ?? emptyCampaignPlayer()).portraitDataUrl) ? (
                  <img
                    className="studio-portrait__img"
                    src={portraitSrc((draft.player ?? emptyCampaignPlayer()).portraitDataUrl)}
                    alt=""
                  />
                ) : (
                  <div className="studio-portrait__empty" aria-hidden="true" />
                )}
                {portraitSrc((draft.player ?? emptyCampaignPlayer()).portraitDataUrl) ? (
                  <button
                    type="button"
                    className="studio-portrait__trash"
                    aria-label="Remove portrait"
                    disabled={busy}
                    onClick={() => patchYou({ portraitDataUrl: "" })}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.2 4.2h9.6M6.2 4.2V3.1A.9.9 0 0 1 7.1 2.2h1.8a.9.9 0 0 1 .9.9v1.1M5.1 4.2l.5 8.2a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.5-8.2M6.8 6.4v5M9.2 6.4v5"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="studio-portrait__btn"
                disabled={busy}
                onClick={() => youPortraitRef.current?.click()}
              >
                {(draft.player ?? emptyCampaignPlayer()).portraitDataUrl ? "Change portrait" : "Add portrait"}
              </button>
            </div>
            <div className="setup-field">
              <span className="setup-field__label">Pronoun</span>
              <PickChips
                ariaLabel="Pronoun"
                choices={[
                  ...BUILTIN_PRONOUNS,
                  ...((draft.player?.pronoun && !isBuiltinPronoun(draft.player.pronoun)
                    ? [draft.player.pronoun]
                    : []) as string[])
                ]}
                {...(draft.player?.pronoun ? { value: draft.player.pronoun } : {})}
                labelFor={pronounLabel}
                addPlaceholder="they…"
                onPick={(choice) =>
                  patchYou({ pronoun: draft.player?.pronoun === choice ? undefined : choice })
                }
                onAdd={(label) => patchYou({ pronoun: normalizePronoun(label) })}
              />
            </div>
            <FormSection title="Looks" lede="Body and face. Not clothes.">
              <textarea
                className="setup-field__story"
                value={(draft.player ?? emptyCampaignPlayer()).appearance}
                onChange={(e) => patchYou({ appearance: e.target.value })}
                placeholder="Tall, dark hair, a scar at the jaw…"
              />
            </FormSection>
            <FormSection title="Who they are" lede="A few lines Pass 1 may use. Empty is fine.">
              <textarea
                className="setup-field__story"
                value={(draft.player ?? emptyCampaignPlayer()).personality}
                onChange={(e) => patchYou({ personality: e.target.value })}
                placeholder="Quiet. New in town. Here for the jazz, not a fight."
              />
            </FormSection>
            <FormSection
              title="Stats"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("rulesets")}>
                  Edit rule-sets
                </button>
              }
              lede={
                ruleset
                  ? "Same rule-set as the rest of the campaign."
                  : "Pick a rule-set on General if you want numbers."
              }
            >
              {ruleset && ruleset.attributes.length > 0 ? (
                <div className="setup-row" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                  {ruleset.attributes.map((def: AttributeDef) => {
                    const you = draft.player ?? emptyCampaignPlayer();
                    const current = you.stats[def.id] ?? "";
                    const listed = def.options ?? [];
                    const picks =
                      def.kind === "text" && listed.length > 0
                        ? [...listed, ...(current && !listed.includes(current) ? [current] : [])]
                        : [];
                    const voice = traitVoice({
                      char: you.name.trim() || "the player",
                      pronoun: you.pronoun
                    });
                    return (
                      <div className="setup-field" key={def.id}>
                        {def.name}
                        {picks.length > 0 || (def.kind === "text" && listed.length > 0) ? (
                          <PickChips
                            ariaLabel={def.name}
                            choices={picks}
                            {...(current ? { value: current } : {})}
                            onPick={(choice) => patchYouStat(def.id, current === choice ? "" : choice)}
                            onAdd={(label) => patchYouStat(def.id, label)}
                          />
                        ) : (
                          <input
                            value={current}
                            onChange={(e) => patchYouStat(def.id, e.target.value)}
                            placeholder={def.kind === "number" ? `${def.min ?? 0}–${def.max ?? 100}` : ""}
                          />
                        )}
                        {def.kind !== "text" && (def.highMeaning?.trim() || def.lowMeaning?.trim()) ? (
                          <span className="setup-optional" style={{ display: "block", marginTop: 4, fontWeight: 400 }}>
                            {[
                              def.highMeaning?.trim()
                                ? `High: ${applyTraitTokens(def.highMeaning.trim(), voice)}`
                                : null,
                              def.lowMeaning?.trim()
                                ? `Low: ${applyTraitTokens(def.lowMeaning.trim(), voice)}`
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
              ) : (
                <p className="inspector-empty">No rule-set fields yet.</p>
              )}
            </FormSection>
          </section>
        )}

        {tab === "characters" && (
          <section className="setup-section">
            <FormSection
              title="People in this campaign"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("characters")}>
                  Edit characters
                </button>
              }
              lede="The left list is the shelf. Move someone across to include them. Starting numbers live here; where they stand is on the scene."
            >
            <div className="setup-chips" role="list" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={ageBand === null ? "setup-chip setup-chip--active" : "setup-chip"}
                onClick={() => setAgeBand(null)}
              >
                <span className="setup-chip__pick">Any age</span>
              </button>
              {AGE_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  className={ageBand === band.id ? "setup-chip setup-chip--active" : "setup-chip"}
                  onClick={() => setAgeBand(ageBand === band.id ? null : band.id)}
                >
                  <span className="setup-chip__pick">{band.label}</span>
                </button>
              ))}
            </div>
            <p className="inspector-empty" style={{ marginTop: -4, marginBottom: 12 }}>
              Young is 25 and under. Elder is 55 and up. Combines with Look for.
            </p>
            <ShuttleList
              leftHeading="All characters"
              rightHeading="In this campaign"
              leftEmpty={shelfEmpty("Everyone is already in the campaign.")}
              rightEmpty="None yet. Pick someone on the left, then Add."
              left={visibleCharacters
                .filter(
                  (item) =>
                    !draft.people.some((member) => member.characterId === item.id) &&
                    matchesTagFilter(item, pickFilter) &&
                    matchesAgeBand(item, ageBand)
                )
                .map((item) => ({
                  id: item.id,
                  label: personLabel(item, item.id),
                  ...(item.portraitDataUrl ? { thumb: item.portraitDataUrl } : {})
                }))}
              right={draft.people.flatMap((member) => {
                const template = visibleCharacters.find((item) => item.id === member.characterId);
                if (!template) return [];
                return [
                  {
                    id: template.id,
                    label: personLabel(template, template.id),
                    ...(template.portraitDataUrl ? { thumb: template.portraitDataUrl } : {})
                  }
                ];
              })}
              onAdd={addPerson}
              onRemove={removePerson}
            />
            {draft.people.map((member) => {
              const template = visibleCharacters.find((item) => item.id === member.characterId);
              const voice = traitVoice({ char: template?.name, pronoun: template?.pronoun });
              return (
                <div key={member.characterId} className="layer-card" style={{ marginTop: 14 }}>
                  <p className="place-card__name">{personLabel(template, member.characterId)}</p>
                  {ruleset && ruleset.attributes.length > 0 ? (
                    <div className="setup-row" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                      {ruleset.attributes.map((def: AttributeDef) => {
                        const current = member.stats[def.id] ?? "";
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
                                {...(current ? { value: current } : {})}
                                onPick={(choice) =>
                                  patchStat(member.characterId, def.id, current === choice ? "" : choice)
                                }
                                onAdd={(label) => patchStat(member.characterId, def.id, label)}
                              />
                            ) : (
                              <input
                                value={current}
                                onChange={(e) => patchStat(member.characterId, def.id, e.target.value)}
                                placeholder={def.kind === "number" ? `${def.min ?? 0}–${def.max ?? 100}` : ""}
                              />
                            )}
                            {def.kind !== "text" && (def.highMeaning?.trim() || def.lowMeaning?.trim()) ? (
                              <span className="setup-optional" style={{ display: "block", marginTop: 4, fontWeight: 400 }}>
                                {[
                                  def.highMeaning?.trim()
                                    ? `High: ${applyTraitTokens(def.highMeaning.trim(), voice)}`
                                    : null,
                                  def.lowMeaning?.trim() ? `Low: ${applyTraitTokens(def.lowMeaning.trim(), voice)}` : null
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <LoreEditor
                    entries={member.lore ?? []}
                    onChange={(lore) => patchMember(member.characterId, { lore })}
                  />
                </div>
              );
            })}
            {draft.people.length > 0 && !ruleset ? (
              <p className="inspector-empty" style={{ marginTop: 12 }}>
                Pick a rule-set above if you want starting numbers.
              </p>
            ) : null}
            </FormSection>
          </section>
        )}

        {tab === "objects" && (
          <section className="setup-section">
            <FormSection
              title="Things in this campaign"
              action={
                <button type="button" className="setup-text-btn" onClick={() => onOpenShelf("objects")}>
                  Edit objects
                </button>
              }
              lede="The left list is the shelf. Move something across if it may turn up. A scene decides if it is in the room tonight."
            >
            <ShuttleList
              leftHeading="All objects"
              rightHeading="In this campaign"
              leftEmpty={shelfEmpty("Everything is already in the campaign.")}
              rightEmpty="None yet. Pick something on the left, then Add."
              left={visibleObjects
                .filter((item) => !draft.objectIds.includes(item.id) && matchesTagFilter(item, pickFilter))
                .map((item) => ({ id: item.id, label: item.name }))}
              right={campaignObjects.map((item) => ({ id: item.id, label: item.name }))}
              onAdd={addObject}
              onRemove={removeObject}
            />
            </FormSection>
          </section>
        )}

        {tab === "scenes" && (
          <section className="setup-section">
            <div className="setup-section__head">
              <p className="panel-heading">Scenes in this campaign</p>
              <button
                type="button"
                className="setup-text-btn"
                onClick={() => setDraft({ ...draft, scenes: [...draft.scenes, emptyCampaignScene()] })}
              >
                + Scene
              </button>
            </div>
            <p className="form-section__lede">
              A scene is a place the player can enter: the landmark, where they start, who is here, what is in the room. Optional Pre-defined Replies are ready-made buttons — a tap is the player's turn, not a line the cast has to speak. Several triggers, each with its own buttons. They stay hidden until that trigger's words show up in chat, or — if Triggered by is empty — someone invites them along or they try to leave the map. Optional: a one-time event if they come back.
            </p>
            {freshNight ? (
              <p className="form-section__lede">
                You left play. Chat is gone. The agreement below is what the next scene knows — edit it, then Start.
              </p>
            ) : null}
            <FormSection
              title="From last scene"
              lede="Why they arrived: the agreement, not the bar chat. Empty = a new meeting. Pass 1 honors this."
            >
              <textarea
                className="setup-field__story"
                value={handoffDraft}
                onChange={(e) => {
                  const text = e.target.value;
                  setHandoffDraft(text);
                  if (!draft) return;
                  void repo.saveStudioResume({
                    campaignId: draft.id,
                    ...(resume?.sceneId ? { sceneId: resume.sceneId } : {}),
                    ...(text.trim() ? { handoff: text.trim() } : {})
                  });
                }}
                placeholder="He asked to sleep. Nothing else happened."
              />
            </FormSection>
            {draft.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                lastPlayed={scene.id === resume?.sceneId}
                campaignPlaces={campaignPlaces}
                campaignRealms={visibleRealms}
                campaignPeople={campaignPeople}
                campaignObjects={campaignObjects}
                busy={busy}
                onPatch={(patch) => patchScene(scene.id, patch)}
                onRemove={() =>
                  setDraft({
                    ...draft,
                    scenes: draft.scenes.filter((item) => item.id !== scene.id),
                    sceneLinks: removeLinksForScene(draft.sceneLinks, scene.id)
                  })
                }
                onStart={() => void startScene(scene)}
                canRemove={draft.scenes.length > 1}
              />
            ))}
          </section>
        )}

        {tab === "storyboard" && (
          <section className="setup-section">
            <p className="panel-heading">How your scenes connect</p>
            <StoryboardCanvas
              scenes={draft.scenes}
              links={draft.sceneLinks}
              chapters={draft.chapters}
              campaignName={draft.name}
              onScenesChange={(scenes) => setDraft({ ...draft, scenes })}
              onLinksChange={(sceneLinks) => setDraft({ ...draft, sceneLinks })}
              onChaptersChange={(chapters) => setDraft({ ...draft, chapters })}
            />
          </section>
        )}

        {notice && !error && <p className="inspector-empty">{notice}</p>}
        {error && <p className="setup-error">{error}</p>}
        <div className="studio-sheet__actions">
          <button type="button" className="setup-start" disabled={busy} onClick={() => void save()}>
            Save campaign
          </button>
          {savedIds.has(draft.id) ? (
            <button type="button" className="setup-example" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SceneCard({
  scene,
  lastPlayed,
  campaignPlaces,
  campaignRealms,
  campaignPeople,
  campaignObjects,
  busy,
  onPatch,
  onRemove,
  onStart,
  canRemove
}: {
  scene: CampaignScene;
  lastPlayed: boolean;
  campaignPlaces: PlaceTemplate[];
  campaignRealms: RealmTemplate[];
  campaignPeople: CharacterTemplate[];
  campaignObjects: ObjectTemplate[];
  busy: boolean;
  onPatch: (patch: Partial<CampaignScene> | ((current: CampaignScene) => CampaignScene)) => void;
  onRemove: () => void;
  onStart: () => void;
  canRemove: boolean;
}) {
  const canStart = Boolean(scene.placeId) && scene.people.length > 0;

  function togglePerson(id: string) {
    onPatch((current) => {
      if (current.people.some((item) => item.characterId === id)) {
        return { ...current, people: current.people.filter((item) => item.characterId !== id) };
      }
      const template = campaignPeople.find((item) => item.id === id);
      return { ...current, people: [...current.people, emptyCast(id, template?.mood ?? "")] };
    });
  }

  function patchPerson(id: string, patch: Partial<SceneCast>) {
    onPatch((current) => ({
      ...current,
      people: current.people.map((item) => (item.characterId === id ? { ...item, ...patch } : item))
    }));
  }

  function addTrigger() {
    onPatch((current) => ({
      ...current,
      triggers: [
        ...current.triggers,
        {
          id: crypto.randomUUID(),
          content: "",
          keywords: [],
          when: "return_to_bar" as const,
          requiresFlags: [],
          requiresAbsentFlags: [],
          setsFlags: []
        }
      ]
    }));
  }

  function patchWhatNowSet(setId: string, patch: (set: WhatNowSet) => WhatNowSet) {
    onPatch((current) => ({
      ...current,
      whatNowSets: whatNowSetsFromScene(current).map((item) => (item.id === setId ? patch(item) : item))
    }));
  }

  function addWhatNowSet() {
    onPatch((current) => ({
      ...current,
      whatNowSets: [...whatNowSetsFromScene(current), emptyWhatNowSet()]
    }));
  }

  const whatNowPlace = campaignPlaces.find((item) => item.id === scene.placeId);
  const floorGoesTo = venueBuildingName(whatNowPlace?.name) || whatNowPlace?.name.trim() || "the landmark";
  const whatNowRooms = whatNowPlace?.rooms ?? [];
  const whatNowSets = whatNowSetsFromScene(scene);

  return (
    <div className={lastPlayed ? "layer-card campaign-scene campaign-scene--last" : "layer-card campaign-scene"}>
      {lastPlayed ? <p className="setup-optional" style={{ margin: "0 0 6px" }}>last played</p> : null}
      <SheetNameField
        ariaLabel="Scene name"
        value={scene.name}
        placeholder="Opening"
        onChange={(name) => onPatch({ name })}
      />

      <FormSection title="Where">
        <label className="setup-field setup-field--row">
          <span className="setup-field__label">Landmark</span>
          <select
            value={scene.placeId}
            onChange={(e) => onPatch({ placeId: e.target.value, startRoomId: "" })}
          >
            <option value="">
              {campaignPlaces.length === 0 ? "Pick a realm on General first" : "Choose a landmark"}
            </option>
            {campaignRealms.map((realm) => {
              const rows = campaignPlaces.filter((item) => item.realmId === realm.id);
              if (rows.length === 0) return null;
              return (
                <optgroup key={realm.id} label={realm.name}>
                  {rows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        {whatNowPlace ? (
          <label className="setup-field setup-field--row">
            <span className="setup-field__label">Starts at</span>
            <select
              value={scene.startRoomId ?? ""}
              onChange={(e) => onPatch({ startRoomId: e.target.value })}
            >
              <option value="">{whatNowPlace.name.trim() || "Landmark"}</option>
              {whatNowRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </FormSection>

      <FormSection
        title="Who is here"
        {...(campaignPeople.length === 0
          ? { lede: "Add people on the Characters tab first." }
          : {})}
      >
        {campaignPeople.length > 0 ? (
          <div className="setup-chips" role="list">
            {campaignPeople.map((item) => (
              <Chip
                key={item.id}
                active={scene.people.some((person) => person.characterId === item.id)}
                label={personLabel(item, item.id)}
                onPick={() => togglePerson(item.id)}
              />
            ))}
          </div>
        ) : null}
        {scene.people.map((pick) => {
          const template = campaignPeople.find((item) => item.id === pick.characterId);
          return (
            <div key={pick.characterId} className="campaign-scene__person">
              <p className="place-card__name">{personLabel(template, pick.characterId)}</p>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">Where in this place?</span>
                <input
                  value={pick.position}
                  onChange={(e) => patchPerson(pick.characterId, { position: e.target.value })}
                  placeholder="behind the bar"
                />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">Mood tonight</span>
                <input
                  value={pick.mood}
                  onChange={(e) => patchPerson(pick.characterId, { mood: e.target.value })}
                  placeholder={template?.mood || "neutral"}
                />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">Wearing</span>
                <input
                  value={pick.clothing}
                  onChange={(e) => patchPerson(pick.characterId, { clothing: e.target.value })}
                  placeholder="an apron…"
                />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">In their hands</span>
                <input
                  value={pick.holding}
                  onChange={(e) => patchPerson(pick.characterId, { holding: e.target.value })}
                  placeholder="empty…"
                />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">
                  Trust
                  <span className="setup-optional">with you</span>
                </span>
                <input value={pick.trust} onChange={(e) => patchPerson(pick.characterId, { trust: e.target.value })} />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">
                  Familiarity
                  <span className="setup-optional">with you</span>
                </span>
                <input
                  value={pick.familiarity}
                  onChange={(e) => patchPerson(pick.characterId, { familiarity: e.target.value })}
                />
              </label>
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">
                  Tension
                  <span className="setup-optional">tonight</span>
                </span>
                <input value={pick.tension} onChange={(e) => patchPerson(pick.characterId, { tension: e.target.value })} />
              </label>
            </div>
          );
        })}
      </FormSection>

      {campaignObjects.length > 0 ? (
        <FormSection title="In the room">
          <div className="setup-chips" role="list">
            {campaignObjects.map((item) => (
              <Chip
                key={item.id}
                active={scene.objectIds.includes(item.id)}
                label={item.name}
                onPick={() =>
                  onPatch({
                    objectIds: scene.objectIds.includes(item.id)
                      ? scene.objectIds.filter((id) => id !== item.id)
                      : [...scene.objectIds, item.id]
                  })
                }
              />
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Pre-defined Replies"
        action={
          <button type="button" className="setup-text-btn" onClick={addWhatNowSet}>
            + Add
          </button>
        }
        lede="Optional. Each trigger has its own buttons. A tap is the player's turn. They stay hidden until that trigger's words show up in chat, or — if Triggered by is empty — someone invites them along or they try to leave the map. Empty list means free chat."
      >
        {whatNowSets.map((set) => (
          <div key={set.id} className="campaign-trigger">
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Triggered by</span>
              <input
                value={set.keywords.join(", ")}
                onChange={(e) =>
                  patchWhatNowSet(set.id, (current) => ({
                    ...current,
                    keywords: parseKeywordList(e.target.value)
                  }))
                }
                placeholder="last call, follow me"
              />
            </label>
            <p className="form-section__lede">
              Words in chat that show these buttons. Empty = someone invites them along, or they try to leave the map.
            </p>
            {set.choices.map((choice) => (
              <div key={choice.id}>
                <label className="setup-field setup-field--row">
                  <span className="setup-field__label">Button</span>
                  <input
                    value={choice.label}
                    onChange={(e) =>
                      patchWhatNowSet(set.id, (current) => ({
                        ...current,
                        choices: current.choices.map((item) =>
                          item.id === choice.id ? { ...item, label: e.target.value } : item
                        )
                      }))
                    }
                    placeholder="I tell her the truth"
                  />
                </label>
                <label className="setup-field setup-field--row">
                  <span className="setup-field__label">Goes to</span>
                  <select
                    value={!choice.room.trim() || isWhatNowStay(choice.room) ? WHAT_NOW_STAY : choice.room}
                    onChange={(e) =>
                      patchWhatNowSet(set.id, (current) => ({
                        ...current,
                        choices: current.choices.map((item) =>
                          item.id === choice.id ? { ...item, room: e.target.value } : item
                        )
                      }))
                    }
                  >
                    <option value={WHAT_NOW_STAY}>This beat</option>
                    {whatNowPlace ? <option value={WHAT_NOW_FLOOR}>{floorGoesTo}</option> : null}
                    {whatNowRooms.map((room) => (
                      <option key={room.id} value={room.label}>
                        {room.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="setup-example"
                  onClick={() =>
                    patchWhatNowSet(set.id, (current) => ({
                      ...current,
                      choices: current.choices.filter((item) => item.id !== choice.id)
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {set.choices.length < 3 ? (
              <button
                type="button"
                className="setup-text-btn"
                onClick={() =>
                  patchWhatNowSet(set.id, (current) => ({
                    ...current,
                    choices: [
                      ...current.choices,
                      { id: crypto.randomUUID(), label: "", room: WHAT_NOW_STAY }
                    ]
                  }))
                }
              >
                + Button
              </button>
            ) : null}
            <button
              type="button"
              className="setup-example"
              onClick={() =>
                onPatch((current) => ({
                  ...current,
                  whatNowSets: whatNowSetsFromScene(current).filter((item) => item.id !== set.id)
                }))
              }
            >
              Remove trigger
            </button>
          </div>
        ))}
      </FormSection>

      <FormSection
        title="If they come back"
        action={
          <button type="button" className="setup-text-btn" onClick={addTrigger}>
            + Add
          </button>
        }
        lede={`Optional. Not a button. If these tokens are already in play, this happens once when they return to ${
          whatNowPlace?.name.trim() || "the landmark"
        }. A night away counts too.`}
      >
        {scene.triggers.map((trigger) => (
          <div key={trigger.id} className="campaign-trigger">
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">What happens</span>
              <textarea
                value={trigger.content}
                onChange={(e) =>
                  onPatch((current) => ({
                    ...current,
                    triggers: current.triggers.map((item) =>
                      item.id === trigger.id ? { ...item, content: e.target.value } : item
                    )
                  }))
                }
                placeholder="Two strangers come in and ask about a brooch…"
              />
            </label>
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">Already in play</span>
              <input
                value={trigger.keywords.join(", ")}
                onChange={(e) =>
                  onPatch((current) => ({
                    ...current,
                    triggers: current.triggers.map((item) =>
                      item.id === trigger.id ? { ...item, keywords: parseKeywordList(e.target.value) } : item
                    )
                  }))
                }
                placeholder="brooch, broschen"
              />
            </label>
            <p className="form-section__lede">
              A word said in chat, or something in someone's hands. {triggerWhenLabel("return_to_bar")} — a night away counts too.
            </p>
            <button
              type="button"
              className="setup-example"
              onClick={() =>
                onPatch((current) => ({
                  ...current,
                  triggers: current.triggers.filter((item) => item.id !== trigger.id)
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </FormSection>

      <div className="studio-sheet__actions">
        <button type="button" className="setup-start" disabled={!canStart || busy} onClick={onStart}>
          Start this scene
        </button>
        {canRemove ? (
          <button type="button" className="setup-example" onClick={onRemove}>
            Delete
          </button>
        ) : null}
      </div>
      {!canStart ? (
        <p className="inspector-empty" style={{ marginTop: 8 }}>
          {!scene.placeId && scene.people.length === 0
            ? "Pick a place and who is here."
            : !scene.placeId
              ? "Pick a place."
              : "Pick who is here."}
        </p>
      ) : null}
    </div>
  );
}
