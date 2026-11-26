import {
  CutscenePlacementSchema,
  type CutsceneFilm,
  type CutscenePlacement,
} from "../../cutscenes/schema";
import { placementWarnings } from "../../cutscenes/placementWarnings";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { CutsceneDirtyHost, CutsceneStudio } from "../cutscenes/CutsceneStudio";
import { useCutsceneLibrary } from "../cutscenes/CutsceneLibrary";
import { PlacementPanel } from "../cutscenes/PlacementPanel";
import { loadAudioLibrary } from "../audio/audioStorage";
import { PRESET_THEMES } from "../themes/theme";
import { CHECK_LEVELS } from "../../game/rules";
import { useEffect, useRef, useState } from "react";
import type {
  CampaignTemplate,
  CampaignScene,
  PlaceTemplate,
  CharacterTemplate,
  ObjectTemplate,
  RulesetTemplate,
  StoryboardLink,
  StoryboardPosition,
  StoryboardSection,
} from "../../library/LibrarySchema";
import { emptyCampaignScene } from "../../library/LibrarySchema";
import { makePlayableScene, newOpportunity, adventureFacts } from "../../library/playableCampaign";
import { removeLinksForScene } from "../../library/storyboardLinks";
import { StoryboardCanvas, type StoryboardContextTarget } from "./StoryboardCanvas";
import { StoryboardOutline } from "./StoryboardOutline";
import {
  moveStoryboardSection,
  removeStoryboardSection,
  storyboardHierarchy,
  storyboardSectionTitle,
} from "../../library/storyboardHierarchy";
import { dialogueTopics } from "../../game/dialogue";
import { SceneMapPlaceField } from "./SceneMapPlaceField";
import {
  bindSceneMapPlace,
  mapPlaceForScene,
  type AdventureMapPlace,
} from "../../library/adventureMap";
import { Menu, type MenuItem } from "../components/Menu";
import type { RenderAssist } from "./assistContract";
import { StoryboardAssistBar } from "./StoryboardAssistBar";
import { useStoryboardAssist } from "./useStoryboardAssist";
import type { Interaction } from "../../game/EncounterSchema";
import {
  storyboardIssues,
  storyboardWarnings,
  reachableFromStart,
  type ActionField,
  type SceneField,
  type StoryboardIssue,
} from "./storyboardReadiness";
import { isOpenDraft, savedAdventureStart, sceneFormat } from "../../library/sceneFormat";
import { checkPreview, statName } from "../../game/narration";
import { SceneParts } from "./SceneParts";
import { ScenePositions } from "./ScenePositions";
import {
  doorEffects,
  doorsHere,
  fightBreaksOut,
  isHostile,
  setDoorEffect,
  setFightBreaksOut,
  setLearned,
  learnedFrom,
} from "../../library/sceneParts";
import {
  INSPECTOR_MAX,
  INSPECTOR_MIN,
  clampInspectorWidth,
  loadInspectorWidth,
  saveInspectorWidth,
  widthForKey,
  INSPECTOR_DEFAULT,
} from "./inspectorWidth";
import { ManuscriptDraftBox, type DraftLibrary } from "./ManuscriptDraftBox";
import { useTranslate } from "../i18n/LanguageProvider";
import "./playable-storyboard.css";
export function PlayableStoryboard({
  campaign,
  places,
  characters,
  objects,
  busy,
  onChange,
  onPlay,
  onSave,
  expanded = false,
  mapPlaces,
  onCreatePlace,
  onOpenLibrary,
  rulesets,
  openWorldNote,
  library,
  initialStep = "scenes",
  initialSceneId,
  renderAssist,
  reloadCampaign,
  saveFirst,
}: {
  /** Draws the AI help panel. Without it Storyboard shows no way in to the help (docs/storyboard-ai.sv.md). */
  renderAssist?: RenderAssist | undefined;
  /** Reads the adventure again from where it is saved, for when the help panel has saved something. */
  reloadCampaign?: (() => Promise<CampaignTemplate>) | undefined;
  /** Saves the adventure the usual way before the help opens. Returns what was saved, or null. */
  saveFirst?: ((next?: CampaignTemplate) => Promise<CampaignTemplate | null>) | undefined;
  campaign: CampaignTemplate;
  places: PlaceTemplate[];
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  busy: boolean;
  onChange: (c: CampaignTemplate) => void;
  onPlay: (s: CampaignScene) => void;
  onSave?: () => void;
  expanded?: boolean;
  mapPlaces?: AdventureMapPlace[] | undefined;
  /** The saved rule-sets, for the values a new scene is made with. */
  rulesets?: RulesetTemplate[];
  /** What "Beyond the story" adds when a game starts, shown with the test. */
  openWorldNote?: string | undefined;
  /** Every card in the library, for suggestions made from a manuscript. */
  library?: DraftLibrary | undefined;
  /** Opens the Cast or Things step, for when there is nothing to choose from. */
  onOpenLibrary?: ((what: "people" | "things") => void) | undefined;
  /** Which step to show first. */
  initialStep?: "scenes" | "connections" | "test";
  initialSceneId?: string | undefined;
  /** Makes a place (and a world if there is none). Returns the place and the adventure to continue with. */
  onCreatePlace?: (
    name: string,
  ) => Promise<{ place: PlaceTemplate; campaign: CampaignTemplate } | undefined>;
}) {
  const t = useTranslate();
  const filmRepo = useCutsceneLibrary();
  const [libraryFilms, setLibraryFilms] = useState<CutsceneFilm[]>();
  const [trackIds, setTrackIds] = useState<ReadonlySet<string>>();
  const [cutsceneId, setCutsceneId] = useState("");
  const [editingFilm, setEditingFilm] = useState<{ film: CutsceneFilm | null }>();
  const [filmDirty, setFilmDirty] = useState(false);
  const [filmError, setFilmError] = useState(false);
  const [savingFilm, setSavingFilm] = useState(false);
  const latestCampaign = useRef(campaign);
  latestCampaign.current = campaign;
  const placement = campaign.cutscenes.find(({ id }) => id === cutsceneId);
  const films = libraryFilms ?? campaign.cutsceneFilms ?? [];
  useEffect(() => {
    let active = true;
    void filmRepo
      ?.listCutsceneFilms()
      .then((value) => {
        if (active) setLibraryFilms(value);
      })
      .catch(() => {
        if (active) setFilmError(true);
      });
    void loadAudioLibrary("cutscene-studio")
      .then(({ tracks }) => {
        if (active) setTrackIds(new Set(tracks.map(({ id }) => id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [filmRepo]);
  const [sceneId, setSceneId] = useState(
      campaign.scenes.find(({ id }) => id === initialSceneId)?.id ?? campaign.scenes[0]?.id ?? "",
    ),
    [linkId, setLinkId] = useState("");
  const [newActionId, setNewActionId] = useState("");
  const [newPlaceName, setNewPlaceName] = useState("");
  const [creatingPlace, setCreatingPlace] = useState(false);
  const [actionFocus, setActionFocus] = useState<ActionField>("label");
  const [connectionFromId, setConnectionFromId] = useState<string | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [markedScenes, setMarkedScenes] = useState<ReadonlySet<string>>(new Set());
  const [step, setStep] = useState<"scenes" | "connections" | "test">(initialStep);
  const savedStart = savedAdventureStart(campaign);
  const [testSceneId, setTestSceneId] = useState(savedStart?.id ?? campaign.scenes[0]?.id ?? "");
  const [focus, setFocus] = useState<SceneField | "objective" | null>(null);
  const inspector = useRef<HTMLElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(loadInspectorWidth);
  const root = useRef<HTMLElement>(null),
    [context, setContext] = useState<StoryboardContextTarget | null>(null);
  const sections = campaign.storyboardSections ?? [];
  const hierarchy = storyboardHierarchy(campaign.scenes, sections);
  const section = hierarchy.byId.get(sectionId);
  const acts = sections.filter((item) => item.kind === "act");
  const scene = campaign.scenes.find((s) => s.id === sceneId),
    link = campaign.sceneLinks.find((l) => l.id === linkId),
    facts = adventureFacts(campaign);
  const assist = useStoryboardAssist({
    campaign,
    objects: library?.objects ?? objects,
    renderAssist,
    reloadCampaign,
    saveFirst,
    onChange,
    onFocusScene: (id) => selectScene(id),
    onFocusLink: (id) => selectLink(id),
  });
  const placementFacts = [
    ...new Map(
      [
        ...facts,
        ...campaign.cutscenes
          .flatMap((item) =>
            item.setsFlags.map((id) => ({
              id,
              label: films.find((film) => film.id === item.filmId)?.title ?? t("csUnknownFact"),
            })),
          )
          .filter(({ id }) => !facts.some((fact) => fact.id === id)),
      ].map((fact) => [fact.id, fact]),
    ).values(),
  ];
  const cutsceneWarnings = campaign.cutscenes.length
    ? placementWarnings(
        campaign,
        reachableFromStart({ ...campaign, cutsceneFilms: films }).flags,
        films,
        trackIds,
      )
    : [];
  const sceneMapPlace = scene && mapPlaces ? mapPlaceForScene(scene, mapPlaces) : undefined;
  const goalFacts = [
    ...facts,
    ...(campaign.goal?.requiresFlags ?? [])
      .filter((id) => !facts.some((f) => f.id === id))
      .map((id) => ({ id, label: `Unavailable discovery: ${id}` })),
  ];
  const issues = storyboardIssues(
    campaign,
    places,
    new Set(facts.map((fact) => fact.id)),
    mapPlaces,
    { objects, rulesets },
  );
  const warnings = storyboardWarnings(campaign, new Set(facts.map((fact) => fact.id)), {
    characters,
    objects,
  });
  const unfinishedScenes = new Set(
    issues.flatMap((issue) => (issue.kind === "scene" ? [issue.id] : [])),
  );
  /** Scenes built here. Scenes in the earlier format are built and started in Scenes. */
  // A draft nothing has been built in yet is not a scene to start from or to count as unfinished.
  const buildable = campaign.scenes.filter(
    (item) => sceneFormat(item) !== "earlier" && !isOpenDraft(item),
  );
  const testScene = buildable.find((item) => item.id === testSceneId) ?? savedStart ?? buildable[0];
  const connectionSource =
    campaign.scenes.find((item) => item.id === connectionSourceId) ?? scene ?? testScene;
  const linkedScenes = new Set(
    campaign.sceneLinks.flatMap((item) => [item.fromSceneId, item.toSceneId]),
  );
  const unconnected = campaign.scenes.filter((item) => !linkedScenes.has(item.id));
  const sceneIssue = issues.find((issue) => issue.kind === "scene" && issue.id === sceneId);

  useEffect(() => {
    if (inspector.current) inspector.current.scrollTop = 0;
  }, [step, sceneId, linkId, sectionId]);

  useEffect(() => {
    if (!focus) return;
    const target = inspector.current?.querySelector<HTMLElement>(
      `[data-storyboard-field="${focus}"]`,
    );
    const control = target?.matches("input, textarea, select, button, summary")
      ? target
      : target?.querySelector<HTMLElement>("input, textarea, select, button, summary");
    control?.closest("details")?.setAttribute("open", "");
    control?.focus();
    setFocus(null);
  }, [focus]);
  function patchScene(next: CampaignScene) {
    onChange({ ...campaign, scenes: campaign.scenes.map((s) => (s.id === next.id ? next : s)) });
  }
  /** Point a scene at a place. A one-place scene takes the place's name. */
  function scenePointedAt(current: CampaignScene, placeId: string, placeName: string | undefined) {
    const encounter = current.encounter;
    return {
      ...current,
      placeId,
      ...(encounter && placeName && encounter.definition.places.length === 1
        ? {
            encounter: {
              ...encounter,
              definition: {
                ...encounter.definition,
                places: [{ ...encounter.definition.places[0]!, name: placeName }],
              },
            },
          }
        : {}),
    };
  }
  async function createPlaceForScene(current: CampaignScene) {
    if (!onCreatePlace || creatingPlace || !newPlaceName.trim()) return;
    setCreatingPlace(true);
    try {
      const made = await onCreatePlace(newPlaceName);
      if (!made) return;
      const next = scenePointedAt(current, made.place.id, made.place.name);
      onChange({
        ...made.campaign,
        scenes: made.campaign.scenes.map((item) => (item.id === next.id ? next : item)),
      });
      setNewPlaceName("");
    } finally {
      setCreatingPlace(false);
    }
  }
  function resizeInspector(next: number) {
    const width = clampInspectorWidth(next, layout.current?.clientWidth);
    setInspectorWidth(width);
    saveInspectorWidth(width);
  }
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const move = (moved: PointerEvent) => resizeInspector(startWidth + (startX - moved.clientX));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  function selectPlacement(id: string) {
    setCutsceneId(id);
    setSceneId("");
    setLinkId("");
    setSectionId("");
    setMarkedScenes(new Set());
    setConnectionFromId(null);
    setStep("scenes");
  }
  function addPlacement(target?: StoryboardContextTarget) {
    const trigger = target?.linkId
      ? { kind: "link", linkId: target.linkId }
      : target?.sceneId || scene || campaign.scenes[0]
        ? { kind: "scene", sceneId: target?.sceneId ?? scene?.id ?? campaign.scenes[0]!.id }
        : undefined;
    if (!trigger) return;
    const next = CutscenePlacementSchema.parse({
      id: crypto.randomUUID(),
      filmId: films[0]?.id ?? crypto.randomUUID(),
      trigger,
    });
    onChange({ ...campaign, cutscenes: [...campaign.cutscenes, next], cutsceneFilms: films });
    selectPlacement(next.id);
  }
  function changePlacement(next: CutscenePlacement) {
    onChange({
      ...campaign,
      cutscenes: campaign.cutscenes.map((row) => (row.id === next.id ? next : row)),
      cutsceneFilms: films,
    });
  }
  function showFilmEditor(film: CutsceneFilm | null) {
    setFilmDirty(false);
    setFilmError(false);
    setEditingFilm({ film });
  }
  function closeFilmEditor() {
    if (!filmDirty || window.confirm(t("csDiscardQuestion"))) setEditingFilm(undefined);
  }
  async function saveFilm(film: CutsceneFilm) {
    if (!filmRepo || !placement || savingFilm) return;
    setSavingFilm(true);
    setFilmError(false);
    try {
      await filmRepo.saveCutsceneFilm(film);
      const saved = [...films.filter(({ id }) => id !== film.id), film];
      setLibraryFilms(saved);
      const current = latestCampaign.current;
      onChange({
        ...current,
        cutscenes: current.cutscenes.map((item) =>
          item.id === placement.id ? { ...item, filmId: film.id } : item,
        ),
        cutsceneFilms: saved,
      });
      setFilmDirty(false);
      setEditingFilm(undefined);
    } catch {
      setFilmError(true);
    } finally {
      setSavingFilm(false);
    }
  }

  function selectScene(id: string, additive = false) {
    setCutsceneId("");
    setConnectionFromId(null);
    if (additive) {
      const marked = new Set(markedScenes.size ? markedScenes : sceneId ? [sceneId] : []);
      if (marked.has(id)) marked.delete(id);
      else marked.add(id);
      setMarkedScenes(marked);
      setSceneId(marked.has(id) ? id : (Array.from(marked).at(-1) ?? ""));
    } else {
      setMarkedScenes(new Set());
      setSceneId(id);
    }
    setSectionId("");
    setLinkId("");
    setNewActionId("");
    setTestSceneId(id);
    setStep("scenes");
  }

  function selectSection(id: string) {
    setCutsceneId("");
    setConnectionFromId(null);
    setSectionId(id);
    setSceneId("");
    setLinkId("");
    setMarkedScenes(new Set());
    setStep("scenes");
  }

  function selectLink(id: string | null) {
    setLinkId(id ?? "");
    if (id) {
      setCutsceneId("");
      setConnectionFromId(null);
      setStep("connections");
      setSceneId("");
      setSectionId("");
      setMarkedScenes(new Set());
    }
  }

  function openIssue(issue: StoryboardIssue) {
    if (issue.kind === "scene") {
      selectScene(issue.id);
      setTestSceneId(testScene?.id ?? "");
      if (issue.field === "reach") {
        setConnectionSourceId(issue.id);
        setStep("connections");
      } else if (issue.action) {
        setNewActionId(issue.action.id);
        setActionFocus(issue.action.field);
      } else setFocus(issue.field);
    } else if (issue.kind === "link") selectLink(issue.id);
    else if (issue.kind === "rules") showTest();
    else {
      showTest();
      setFocus("objective");
    }
  }

  function patchSection(next: StoryboardSection) {
    onChange({
      ...campaign,
      storyboardSections: sections.map((item) => (item.id === next.id ? next : item)),
    });
  }

  function toggleSection(id: string) {
    const target = hierarchy.byId.get(id);
    if (target) patchSection({ ...target, collapsed: !target.collapsed });
  }

  function addSection(
    kind: StoryboardSection["kind"],
    position?: StoryboardPosition,
    members: ReadonlySet<string> = new Set(),
  ) {
    const chosenScenes = campaign.scenes.filter((item) => members.has(item.id));
    const memberActs = new Set(chosenScenes.map(hierarchy.sceneAct));
    const selectedAct =
      section?.kind === "act"
        ? section.id
        : section
          ? hierarchy.parentAct(section)
          : scene && hierarchy.sceneAct(scene);
    const actId = chosenScenes.length
      ? memberActs.size === 1
        ? hierarchy.sceneAct(chosenScenes[0]!)
        : undefined
      : selectedAct;
    const common = {
      id: crypto.randomUUID(),
      title: kind === "act" ? "New act" : "New scene group",
      ...(position ? { position } : {}),
    };
    const next: StoryboardSection =
      kind === "act" ? { ...common, kind } : { ...common, kind, actId };
    onChange({
      ...campaign,
      storyboardSections: [
        ...sections.map((item) =>
          item.id === actId && kind === "group" ? { ...item, collapsed: false } : item,
        ),
        next,
      ],
      scenes: campaign.scenes.map((item) =>
        members.has(item.id) ? { ...item, storyboardSectionId: next.id } : item,
      ),
    });
    selectSection(next.id);
  }

  function addScene(
    position?: StoryboardPosition,
    parentId = section?.id ?? scene?.storyboardSectionId,
  ) {
    const parent = hierarchy.byId.get(parentId ?? "");
    let next = {
      ...emptyCampaignScene(),
      name: "New scene",
      placeId: scene?.placeId || places[0]?.id || "",
      ...(position ? { position } : {}),
      ...(parent ? { storyboardSectionId: parent.id } : {}),
    };
    if (campaign.scenes.some((item) => item.encounter) && next.placeId)
      next = makePlayableScene(campaign, next, places, characters, objects, rulesets);
    const mapped = mapPlaces?.find((entry) => entry.place.id === next.placeId);
    if (mapped) next = bindSceneMapPlace(next, mapped);
    const actId = parent && hierarchy.parentAct(parent);
    onChange({
      ...campaign,
      scenes: [...campaign.scenes, next],
      ...(parent
        ? {
            storyboardSections: sections.map((item) =>
              item.id === parent.id || item.id === actId ? { ...item, collapsed: false } : item,
            ),
          }
        : {}),
    });
    selectScene(next.id);
    setFocus("name");
  }
  function removeScene(id: string) {
    if (campaign.scenes.length < 2) return;
    const scenes = campaign.scenes.filter((item) => item.id !== id);
    onChange({
      ...campaign,
      scenes,
      sceneLinks: removeLinksForScene(campaign.sceneLinks, id),
      ...(campaign.startSceneId === id ? { startSceneId: null } : {}),
    });
    selectScene(scenes[0]!.id);
    if (connectionFromId === id) setConnectionFromId(null);
  }
  function addAction() {
    if (!scene?.encounter) return;
    const action = newOpportunity();
    patchScene({
      ...scene,
      encounter: {
        ...scene.encounter,
        definition: {
          ...scene.encounter.definition,
          interactions: [...scene.encounter.definition.interactions, action],
        },
      },
    });
    setActionFocus("label");
    setNewActionId(action.id);
  }
  function patchLink(patch: Partial<StoryboardLink>) {
    if (link) {
      const oldTarget = campaign.scenes.find((s) => s.id === link.toSceneId),
        newTarget = campaign.scenes.find((s) => s.id === patch.toSceneId);
      const label =
        newTarget && link.label === `Continue to ${oldTarget?.name}`
          ? `Continue to ${newTarget.name}`
          : link.label;
      onChange({
        ...campaign,
        sceneLinks: campaign.sceneLinks.map((l) =>
          l.id === link.id ? { ...l, label, ...patch } : l,
        ),
      });
    }
  }
  function flags(field: "requiresFlags" | "requiresAbsentFlags" | "setsFlags", title: string) {
    if (!link) return null;
    const options = [
      ...facts,
      ...link[field]
        .filter((id) => !facts.some((f) => f.id === id))
        .map((id) => ({ id, label: `Saved story fact: ${id}` })),
    ];
    return (
      <fieldset>
        <legend>{title}</legend>
        {options.length ? (
          options.map((f) => (
            <label className="playable-check" key={f.id}>
              <input
                type="checkbox"
                checked={link[field].includes(f.id)}
                onChange={(e) =>
                  patchLink({
                    [field]: e.target.checked
                      ? [...link[field], f.id]
                      : link[field].filter((id) => id !== f.id),
                  })
                }
              />
              <span>{f.label}</span>
            </label>
          ))
        ) : (
          <p>{t("psAddAnActionIn")}</p>
        )}
      </fieldset>
    );
  }
  function addLink(from = scene ?? testScene) {
    if (campaign.scenes.length < 2 || !from) return;
    selectScene(from.id);
    setConnectionFromId(from.id);
    setStep("connections");
  }

  function moveSceneToSection(item: CampaignScene, id: string) {
    const target = hierarchy.byId.get(id);
    const parent = target && hierarchy.parentAct(target);
    onChange({
      ...campaign,
      scenes: campaign.scenes.map((other) =>
        other.id === item.id ? { ...other, storyboardSectionId: target?.id } : other,
      ),
      storyboardSections: sections.map((other) =>
        other.id === id || other.id === parent ? { ...other, collapsed: false } : other,
      ),
    });
  }

  function onCanvasContext(target: StoryboardContextTarget) {
    if (busy) return;
    if (target.cutsceneId) selectPlacement(target.cutsceneId);
    else if (target.sceneId) {
      setConnectionFromId(null);
      if (markedScenes.has(target.sceneId)) setSceneId(target.sceneId);
      else selectScene(target.sceneId);
      setStep("scenes");
    } else if (target.linkId) selectLink(target.linkId);
    else if (target.sectionId) selectSection(target.sectionId);
    setNewActionId("");
    setContext(target);
  }

  function removeSection(id: string) {
    onChange(removeStoryboardSection(campaign, id));
    selectSection("");
  }
  const goalEditor = (
    <details className="playable-adventure-goal" data-storyboard-field="objective">
      <summary>{t("psAdventureObjective")}</summary>
      <p>{t("psChooseTheDiscoveriesThat")}</p>
      <label>
        {t("psObjectiveTitle")}
        <input
          value={campaign.goal?.title ?? ""}
          placeholder={t("psWhatThePlayerIs")}
          onChange={(e) => {
            if (campaign.goal)
              onChange({ ...campaign, goal: { ...campaign.goal, title: e.target.value } });
          }}
          disabled={!campaign.goal}
        />
      </label>
      <fieldset>
        <legend>{t("psCompleteAfterAllOf")}</legend>
        {goalFacts.map((f) => (
          <label className="playable-check" key={f.id}>
            <input
              type="checkbox"
              checked={campaign.goal?.requiresFlags.includes(f.id) ?? false}
              onChange={(e) => {
                const required = e.target.checked
                  ? [...(campaign.goal?.requiresFlags ?? []), f.id]
                  : (campaign.goal?.requiresFlags ?? []).filter((id) => id !== f.id);
                onChange({
                  ...campaign,
                  goal: required.length
                    ? {
                        title: campaign.goal?.title || "Complete the adventure",
                        requiresFlags: required,
                      }
                    : undefined,
                });
              }}
            />
            {f.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
  const menuItems: MenuItem[] = context?.cutsceneId
    ? [
        { label: t("csEditPlacement"), onSelect: () => selectPlacement(context.cutsceneId!) },
        { kind: "separator" },
        {
          label: t("csRemovePlacement"),
          danger: true,
          onSelect: () => {
            onChange({
              ...campaign,
              cutscenes: campaign.cutscenes.filter(({ id }) => id !== context.cutsceneId),
            });
            setCutsceneId("");
          },
        },
      ]
    : context?.linkId
      ? [
          ...(assist.enabled
            ? [
                {
                  label: `✦ ${t("saContinue")}`,
                  disabled: assist.isOpen,
                  onSelect: () => void assist.openAssist("continue", { linkId: context.linkId! }),
                },
                { kind: "separator" as const },
              ]
            : []),
          { label: t("psEditConnection"), onSelect: () => selectLink(context.linkId!) },
          { label: t("csMenuPlacement"), onSelect: () => addPlacement(context) },
          { kind: "separator" as const },
          {
            label: t("psRemoveConnection"),
            danger: true,
            onSelect: () => {
              onChange({
                ...campaign,
                sceneLinks: campaign.sceneLinks.filter((item) => item.id !== context.linkId),
              });
              selectLink(null);
            },
          },
        ]
      : context?.sceneId
        ? [
            ...(assist.enabled
              ? [
                  {
                    label: `✦ ${t("saDeepen")}`,
                    disabled: assist.isOpen,
                    onSelect: () => void assist.openAssist("deepen", { sceneId: context.sceneId! }),
                  },
                  {
                    label: `✦ ${t("saContinue")}`,
                    disabled: assist.isOpen,
                    onSelect: () =>
                      void assist.openAssist("continue", { sceneId: context.sceneId! }),
                  },
                  { kind: "separator" as const },
                ]
              : []),
            { label: t("psEditScene"), onSelect: () => selectScene(context.sceneId!) },
            { label: t("csMenuPlacement"), onSelect: () => addPlacement(context) },
            ...(scene?.encounter ? [{ label: t("psAddAction"), onSelect: addAction }] : []),
            {
              label: markedScenes.size > 1 ? t("psGroupSelectedScenes") : t("psGroupThisScene"),
              onSelect: () =>
                addSection(
                  "group",
                  undefined,
                  markedScenes.size > 1 ? markedScenes : new Set([context.sceneId!]),
                ),
            },
            ...(campaign.scenes.length > 1
              ? [{ label: t("psConnectToAnotherScene"), onSelect: addLink }]
              : []),
            ...(scene && issues.length === 0
              ? [{ label: t("psTestThisScene2"), onSelect: () => onPlay(scene) }]
              : []),
            ...(campaign.scenes.length > 1
              ? [
                  { kind: "separator" as const },
                  {
                    label: t("psRemoveScene"),
                    danger: true,
                    onSelect: () => removeScene(context.sceneId!),
                  },
                ]
              : []),
          ]
        : context?.sectionId && section
          ? [
              {
                label: section.collapsed ? "Expand" : "Collapse",
                onSelect: () => toggleSection(section.id),
              },
              { label: t("psAddSceneToThis"), onSelect: () => addScene(undefined, section.id) },
              ...(section.kind === "act"
                ? [{ label: t("psAddSceneGroup"), onSelect: () => addSection("group") }]
                : []),
              { kind: "separator" as const },
              {
                label: t("psRemoveThisPart"),
                danger: true,
                onSelect: () => removeSection(section.id),
              },
            ]
          : [
              { label: t("psAddSceneHere"), onSelect: () => addScene(context?.position) },
              { label: t("psAddActHere"), onSelect: () => addSection("act", context?.position) },
              {
                label: t("psAddSceneGroupHere"),
                onSelect: () => addSection("group", context?.position),
              },
              ...(onSave ? [{ label: t("psSaveAdventure"), onSelect: onSave }] : []),
            ];

  const sectionInspector = section && (
    <>
      <small>{section.kind === "act" ? "ACT" : "SCENE GROUP"}</small>
      <h3>{storyboardSectionTitle(section)}</h3>
      <label>
        {section.kind === "act" ? "Act name" : "Group name"}
        <input
          value={section.title}
          onChange={(event) => patchSection({ ...section, title: event.target.value })}
        />
      </label>
      {section.kind === "group" && (
        <label>
          {t("psParentAct")}
          <select
            value={hierarchy.parentAct(section) ?? ""}
            onChange={(event) => {
              const actId = event.target.value || undefined;
              onChange({
                ...campaign,
                storyboardSections: sections.map((item) => {
                  if (item.id === section.id) return { ...section, actId };
                  return item.id === actId ? { ...item, collapsed: false } : item;
                }),
              });
            }}
          >
            <option value="">{t("psAdventure")}</option>
            {acts.map((act) => (
              <option key={act.id} value={act.id}>
                {storyboardSectionTitle(act)}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="playable-hint">
        {hierarchy.sectionSceneIds(section.id).size} scenes in this part. Use the scene’s “Belongs
        to” field to move it here.
      </p>
      <button type="button" onClick={() => addScene(undefined, section.id)}>
        {t("psAddSceneToThis")}
      </button>
      {section.kind === "act" && (
        <button type="button" onClick={() => addSection("group")}>
          {t("psAddSceneGroupTo")}
        </button>
      )}
      <button type="button" onClick={() => toggleSection(section.id)}>
        {section.collapsed ? t("psExpandOnBoard") : t("psCollapseOnBoard")}
      </button>
      {section.kind === "group" && section.size && (
        <button type="button" onClick={() => patchSection({ ...section, size: undefined })}>
          {t("psFitFrameToScenes")}
        </button>
      )}
      <button
        type="button"
        className="playable-remove"
        title={t("psKeepTheScenesAnd")}
        onClick={() => removeSection(section.id)}
      >
        {section.kind === "act" ? t("psRemoveAct") : t("psUngroupScenes")}
      </button>
    </>
  );

  const sceneSectionField = scene && sections.length > 0 && (
    <label>
      {t("psBelongsTo")}
      <select
        value={hierarchy.byId.has(scene.storyboardSectionId ?? "") ? scene.storyboardSectionId : ""}
        onChange={(event) => moveSceneToSection(scene, event.target.value)}
      >
        <option value="">{t("psAdventure")}</option>
        {sections.map((item) => {
          const parentId = hierarchy.parentAct(item);
          const parent = parentId ? hierarchy.byId.get(parentId) : undefined;
          return (
            <option value={item.id} key={item.id}>
              {parent ? `${storyboardSectionTitle(parent)} / ` : ""}
              {storyboardSectionTitle(item)}
            </option>
          );
        })}
      </select>
    </label>
  );

  const sceneInspector = scene && (
    <>
      <div className="storyboard-panel-heading">
        <small>{t("psScene")}</small>
        <h3>{scene.name || t("psUntitledScene")}</h3>
      </div>
      {sceneIssue && (
        <p className="storyboard-next" role="status">
          {sceneIssue.message}
        </p>
      )}
      {scene.draft && (
        <ManuscriptDraftBox
          scene={scene}
          campaign={campaign}
          library={library ?? { characters, places, objects }}
          mapped={!!mapPlaces}
          mapPlaces={mapPlaces}
          busy={busy}
          onScene={patchScene}
          onCampaign={onChange}
          onUsePlace={(place) => {
            // On a map the place is the map point of that place, bound as Storyboard does.
            const entry = mapPlaces?.find((item) => item.place.id === place.id);
            patchScene(
              entry ? bindSceneMapPlace(scene, entry) : scenePointedAt(scene, place.id, place.name),
            );
          }}
        />
      )}
      {scene.guideDraftNote && <p className="storyboard-next">{scene.guideDraftNote}</p>}
      <div className="storyboard-form-block">
        <label>
          {t("psSceneName")}
          <input
            data-storyboard-field="name"
            value={scene.name}
            onChange={(event) => {
              const name = event.target.value;
              const encounter = scene.encounter;
              patchScene({
                ...scene,
                name,
                ...(encounter
                  ? {
                      encounter: {
                        ...encounter,
                        definition: { ...encounter.definition, title: name },
                      },
                    }
                  : {}),
              });
            }}
          />
        </label>
        {sceneSectionField}
        <div data-storyboard-field="place">
          {mapPlaces ? (
            <SceneMapPlaceField scene={scene} entries={mapPlaces} onChange={patchScene} />
          ) : (
            <label>
              {t("psPlace")}
              <select
                aria-label="Place"
                value={scene.placeId}
                onChange={(event) => {
                  const placeId = event.target.value;
                  patchScene(
                    scenePointedAt(scene, placeId, places.find((p) => p.id === placeId)?.name),
                  );
                }}
              >
                <option value="">{t("psChooseAPlace")}</option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!mapPlaces && onCreatePlace && (
            <div className="storyboard-create-place">
              <label>
                {places.length === 0 ? "Name your first place" : "Name a new place"}
                <input
                  aria-label="New place name"
                  value={newPlaceName}
                  maxLength={120}
                  disabled={busy || creatingPlace}
                  placeholder={t("psForExampleTheVillage")}
                  onChange={(event) => setNewPlaceName(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || creatingPlace || !newPlaceName.trim()}
                onClick={() => void createPlaceForScene(scene)}
              >
                {t("psCreateAPlace")}
              </button>
            </div>
          )}
        </div>
        {scene.encounter && (
          <label>
            {t("psWhatThePlayerSees")}
            <textarea
              data-storyboard-field="arrival"
              rows={4}
              value={
                scene.usePlaceIntro && sceneMapPlace
                  ? sceneMapPlace.place.note
                  : scene.encounter.definition.description
              }
              onChange={(event) => {
                const encounter = scene.encounter!;
                patchScene({
                  ...scene,
                  ...(scene.mapNodeId ? { usePlaceIntro: false } : {}),
                  encounter: {
                    ...encounter,
                    definition: { ...encounter.definition, description: event.target.value },
                  },
                });
              }}
            />
          </label>
        )}
      </div>
      {scene.encounter ? (
        <>
          <ScenePositions
            key={`positions-${scene.id}`}
            scene={scene}
            busy={busy}
            onChange={patchScene}
          />
          <SceneParts
            key={`parts-${scene.id}`}
            campaign={campaign}
            onChangeCampaign={onChange}
            scene={scene}
            people={characters}
            things={objects}
            facts={facts}
            busy={busy}
            onChange={patchScene}
            onOpenLibrary={onOpenLibrary}
          />
          <SceneActions
            key={scene.id}
            scene={scene}
            facts={facts}
            focusActionId={newActionId}
            focusField={actionFocus}
            onChange={patchScene}
            onAdd={addAction}
            busy={busy}
          />
        </>
      ) : (
        <button
          type="button"
          data-storyboard-field="playable"
          disabled={
            busy ||
            (mapPlaces ? !sceneMapPlace : !places.some((place) => place.id === scene.placeId))
          }
          onClick={() => {
            patchScene(makePlayableScene(campaign, scene, places, characters, objects, rulesets));
            setFocus("arrival");
          }}
        >
          {t("psMakeScenePlayable")}
        </button>
      )}
      <div className="storyboard-panel-actions">
        {campaign.scenes.length > 1 && (
          <button type="button" disabled={busy} onClick={() => setStep("connections")}>
            {t("psConnections")}
          </button>
        )}
        <button type="button" onClick={showTest}>
          {t("psReviewTest")}
        </button>
      </div>
      {campaign.scenes.length > 1 && (
        <button type="button" className="playable-remove" onClick={() => removeScene(scene.id)}>
          {t("psRemoveScene")}
        </button>
      )}
    </>
  );

  const connectionsPanel = (
    <>
      <div className="storyboard-panel-heading">
        <small>{t("psStep2")}</small>
        <h3>{link ? link.label.trim() || t("psEditConnection") : t("psConnectScenes")}</h3>
      </div>
      {connectionFromId ? (
        <div className="storyboard-next">
          <strong>{t("psChooseADestinationOn")}</strong>
          <p>
            Connect from{" "}
            {campaign.scenes.find((item) => item.id === connectionFromId)?.name || "this scene"}.
          </p>
          <button type="button" onClick={() => setConnectionFromId(null)}>
            {t("psCancel")}
          </button>
        </div>
      ) : link ? (
        <>
          <button type="button" className="storyboard-back" onClick={() => selectLink(null)}>
            {t("psAllConnections")}
          </button>
          <div className="storyboard-form-block">
            <label>
              {t("psFrom")}
              <select
                aria-label="From"
                value={link.fromSceneId}
                onChange={(event) => patchLink({ fromSceneId: event.target.value })}
              >
                {!campaign.scenes.some((item) => item.id === link.fromSceneId) && (
                  <option value={link.fromSceneId}>{t("psMissingScene")}</option>
                )}
                {campaign.scenes
                  .filter((item) => item.id !== link.toSceneId || item.id === link.fromSceneId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("psTo")}
              <select
                aria-label="To"
                value={link.toSceneId}
                onChange={(event) => patchLink({ toSceneId: event.target.value })}
              >
                {!campaign.scenes.some((item) => item.id === link.toSceneId) && (
                  <option value={link.toSceneId}>{t("psMissingScene")}</option>
                )}
                {campaign.scenes
                  .filter((item) => item.id !== link.fromSceneId || item.id === link.toSceneId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("psWhatThePlayerChooses")}
              <input
                value={link.label}
                onChange={(event) => patchLink({ label: event.target.value })}
              />
            </label>
          </div>
          {flags("requiresFlags", t("psOpenAfterAllOf"))}
          <p className="playable-hint">{t("psWithNoConditionsThis")}</p>
          <details>
            <summary>{t("psMoreConditionsConsequences")}</summary>
            {flags("requiresAbsentFlags", t("psKeepClosedAfterThese"))}
            {flags("setsFlags", t("psRecordTheseFactsOn"))}
          </details>
          <button
            type="button"
            className="playable-remove"
            onClick={() => {
              onChange({
                ...campaign,
                sceneLinks: campaign.sceneLinks.filter((item) => item.id !== link.id),
              });
              selectLink(null);
            }}
          >
            {t("psRemoveConnection")}
          </button>
        </>
      ) : (
        <>
          <p>{t("psChooseWhereThePlayer")}</p>
          {campaign.scenes.length < 2 ? (
            <button type="button" disabled={busy} onClick={() => addScene()}>
              {t("psAddAScene")}
            </button>
          ) : (
            <>
              <label>
                {t("psConnectFrom")}
                <select
                  value={connectionSource?.id ?? ""}
                  onChange={(event) => setConnectionSourceId(event.target.value)}
                >
                  {campaign.scenes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || t("psUntitledScene")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="storyboard-primary"
                disabled={busy}
                onClick={() => addLink(connectionSource)}
              >
                + Connection
              </button>
            </>
          )}
          {campaign.scenes.length > 1 && unconnected.length > 0 && (
            <p className="playable-hint">
              {unconnected.length} {unconnected.length === 1 ? "scene has" : "scenes have"} no
              connection yet.
            </p>
          )}
          <div className="storyboard-connection-list">
            {campaign.sceneLinks.map((item) => (
              <button type="button" key={item.id} onClick={() => selectLink(item.id)}>
                <strong>{item.label || "Continue"}</strong>
                <span>
                  {campaign.scenes.find((scene) => scene.id === item.fromSceneId)?.name ||
                    t("psMissingScene")}{" "}
                  →{" "}
                  {campaign.scenes.find((scene) => scene.id === item.toSceneId)?.name ||
                    t("psMissingScene")}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {!connectionFromId && (
        <button type="button" onClick={showTest}>
          {t("psReviewTest")}
        </button>
      )}
    </>
  );

  const testPanel = (
    <>
      <div className="storyboard-panel-heading">
        <small>{t("psStep3")}</small>
        <h3>{t("psReviewTest2")}</h3>
      </div>
      {openWorldNote && (
        <p className="playable-hint" role="note">
          {openWorldNote}
        </p>
      )}
      {issues.length > 0 ? (
        <div className="storyboard-review">
          <strong>
            {issues.length} {issues.length === 1 ? "item" : "items"} to finish before testing
          </strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                <button type="button" onClick={() => openIssue(issue)}>
                  {issue.message} <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : testScene ? (
        <p className="storyboard-next" role="status">
          {t("psReadyToTestChoose")}
        </p>
      ) : (
        <p>{t("psAddASceneTo")}</p>
      )}
      {(warnings.length > 0 || cutsceneWarnings.length > 0) && (
        <div className="storyboard-review storyboard-review--warnings">
          <strong>
            {warnings.length + cutsceneWarnings.length}{" "}
            {warnings.length + cutsceneWarnings.length === 1 ? "thing" : "things"} worth checking
          </strong>
          <p className="playable-hint">{t("psTheseDoNotStop")}</p>
          <ul>
            {cutsceneWarnings.map(({ id, title, reason }) => (
              <li key={`${id}:${reason}`}>
                <Button variant="quiet" onClick={() => selectPlacement(id)}>
                  {t(`csPlacementWarn${reason}`, { title: title ?? t("csPlacement") })}
                </Button>
              </li>
            ))}
            {warnings.map((issue, index) => (
              <li key={index}>
                <button type="button" onClick={() => openIssue(issue)}>
                  {issue.message} <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {campaign.startSceneId !== undefined && (
        <label>
          {t("psAdventureStart")}
          <select
            value={savedStart?.id ?? ""}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...campaign, startSceneId: event.target.value || null })
            }
          >
            <option value="" disabled>
              {t("psChooseAdventureStart")}
            </option>
            {buildable
              .filter((item) => item.encounter)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || t("psUntitledScene")}
                </option>
              ))}
          </select>
        </label>
      )}
      {testScene && (
        <label>
          {t("psStartFrom")}
          <select
            aria-label="Start from"
            value={testScene.id}
            onChange={(event) => setTestSceneId(event.target.value)}
          >
            {buildable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || t("psUntitledScene")}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="storyboard-primary"
        disabled={busy || !testScene || issues.length > 0}
        onClick={() => testScene && onPlay(testScene)}
      >
        {t("psTestThisScene")}
      </button>
      {goalEditor}
    </>
  );

  function showScenes() {
    setCutsceneId("");
    setConnectionFromId(null);
    if (!scene && !section && testScene) selectScene(testScene.id);
    setStep("scenes");
  }

  function showTest() {
    setCutsceneId("");
    setConnectionFromId(null);
    setStep("test");
  }
  return (
    <section
      ref={root}
      className={`playable-storyboard${expanded ? " playable-storyboard--expanded" : ""}`}
      aria-label="Playable adventure editor"
    >
      {filmError && !editingFilm && <p role="alert">{t("csCouldNotLoad")}</p>}
      {editingFilm && (
        <Modal title={t("cutsceneStudio")} wide onClose={closeFilmEditor}>
          {filmError && <p role="alert">{t("csCouldNotSave")}</p>}
          <CutsceneDirtyHost onDirty={setFilmDirty}>
            <CutsceneStudio
              film={editingFilm.film}
              previewTheme={campaign.theme ?? PRESET_THEMES[0]!}
              onSave={(film) => void saveFilm(film)}
              onClose={() => setEditingFilm(undefined)}
            />
          </CutsceneDirtyHost>
        </Modal>
      )}
      {context && !busy && (
        <Menu
          at={{ x: context.x, y: context.y }}
          label="Storyboard actions"
          scope={root.current}
          items={menuItems}
          onClose={() => setContext(null)}
        />
      )}
      <header className="playable-storyboard__intro">
        <small>{t("psBuildConnectPlay")}</small>
        <h2>{t("psYourAdventureOnePossibility")}</h2>
        <p>{t("psChooseASceneDescribe")}</p>
      </header>
      <div className="playable-storyboard__toolbar">
        <nav className="storyboard-workflow" aria-label="Adventure workflow">
          <button
            type="button"
            aria-label="Scenes"
            aria-current={step === "scenes" ? "step" : undefined}
            onClick={showScenes}
          >
            <span className="storyboard-workflow__number">1</span>
            <span>
              <strong>{t("psScenes")}</strong>
              <small>
                {buildable.length - unfinishedScenes.size} of {buildable.length} ready
              </small>
            </span>
          </button>
          <button
            type="button"
            aria-label="Connections"
            aria-current={step === "connections" ? "step" : undefined}
            onClick={() => setStep("connections")}
          >
            <span className="storyboard-workflow__number">2</span>
            <span>
              <strong>{t("psConnections2")}</strong>
              <small>{campaign.sceneLinks.length} routes</small>
            </span>
          </button>
          <button
            type="button"
            aria-label="Test"
            aria-current={step === "test" ? "step" : undefined}
            onClick={showTest}
          >
            <span className="storyboard-workflow__number">3</span>
            <span>
              <strong>{t("psTest")}</strong>
              <small>
                {issues.length
                  ? issues.length + " to finish"
                  : testScene
                    ? warnings.length
                      ? `Ready to play · ${warnings.length} to check`
                      : "Ready to play"
                    : "Add a scene"}
              </small>
            </span>
          </button>
        </nav>
        {onSave && (
          <button type="button" disabled={busy || assist.unread !== null} onClick={onSave}>
            {t("psSaveAdventure")}
          </button>
        )}
        {assist.enabled && scene && (
          <StoryboardAssistBar
            sceneName={scene.name}
            disabled={busy || assist.unread !== null}
            opening={assist.opening}
            activeIntent={assist.openIntent}
            onDeepen={() => void assist.openAssist("deepen", { sceneId: scene.id })}
            onContinue={() => void assist.openAssist("continue", { sceneId: scene.id })}
            moreItems={[
              ...(scene.encounter ? [{ label: t("psAddAction"), onSelect: addAction }] : []),
              ...(campaign.scenes.length > 1
                ? [{ label: t("psConnectToAnotherScene"), onSelect: () => addLink(scene) }]
                : []),
              ...(issues.length === 0
                ? [{ label: t("psTestThisScene2"), onSelect: () => onPlay(scene) }]
                : []),
              ...(campaign.scenes.length > 1
                ? [
                    { kind: "separator" as const },
                    {
                      label: t("psRemoveScene"),
                      danger: true,
                      onSelect: () => removeScene(scene.id),
                    },
                  ]
                : []),
            ]}
            model={assist.model}
          />
        )}
      </div>
      {assist.openBlocked && (
        <p role="alert" className="storyboard-assist-notice">
          {t("saOpenBlocked")}
        </p>
      )}
      {assist.unread && (
        <p role="alert" className="storyboard-assist-notice">
          <span>{t("saReloadFailed")}</span>{" "}
          <Button variant="quiet" size="compact" onClick={() => void assist.unread!.readAgain()}>
            {t("saReadAgain")}
          </Button>
        </p>
      )}
      {assist.conflicts.length > 0 && (
        <p role="status" className="storyboard-assist-notice">
          {t("saConflict", { names: assist.conflicts.join(", ") })}
        </p>
      )}
      {assist.panel && (
        <section className="storyboard-assist-panel" key={assist.panelKey} data-assist-panel>
          {assist.panel}
        </section>
      )}
      <div
        ref={layout}
        className="playable-storyboard__layout"
        style={
          expanded
            ? ({ "--storyboard-inspector-width": `${inspectorWidth}px` } as React.CSSProperties)
            : undefined
        }
      >
        <aside className="playable-storyboard__list">
          <h3>{t("psStoryOutline")}</h3>
          <div className="storyboard-outline__tools">
            <button type="button" disabled={busy} onClick={() => addSection("act")}>
              + Act
            </button>
            <button type="button" disabled={busy} onClick={() => addSection("group")}>
              + Group
            </button>
          </div>
          {campaign.scenes.length > 1 && (
            <p className="playable-hint storyboard-outline__hint">{t("psShiftClickToSelect")}</p>
          )}
          {markedScenes.size > 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => addSection("group", undefined, markedScenes)}
            >
              Group selected scenes ({markedScenes.size})
            </button>
          )}
          <StoryboardOutline
            scenes={campaign.scenes}
            sections={sections}
            selectedScene={sceneId}
            selectedSection={sectionId}
            markedScenes={markedScenes}
            onSelectScene={selectScene}
            onSelectSection={selectSection}
            onToggleSection={toggleSection}
          />
          <button type="button" onClick={() => addScene()}>
            + Scene
          </button>
          <Button disabled={busy || !campaign.scenes.length} onClick={() => addPlacement()}>
            {t("csAddPlacement")}
          </Button>
        </aside>
        <div className="playable-storyboard__canvas">
          <StoryboardCanvas
            scenes={campaign.scenes}
            links={campaign.sceneLinks}
            sections={sections}
            chapters={campaign.chapters}
            campaignName={campaign.name}
            onScenesChange={(scenes) => onChange({ ...campaign, scenes })}
            onLayoutChange={(scenes, storyboardSections, cutscenes) =>
              onChange({
                ...campaign,
                scenes,
                cutscenes,
                ...(campaign.storyboardSections || storyboardSections.length
                  ? { storyboardSections }
                  : {}),
              })
            }
            onLinksChange={(sceneLinks) => onChange({ ...campaign, sceneLinks })}
            onChaptersChange={(chapters) => onChange({ ...campaign, chapters })}
            placements={campaign.cutscenes}
            films={films}
            goalFlags={campaign.goal?.requiresFlags}
            factLabels={new Map(placementFacts.map(({ id, label }) => [id, label]))}
            selectedCutsceneId={cutsceneId}
            onSelectCutscene={selectPlacement}
            onMoveCutscene={(id, position) => {
              const item = campaign.cutscenes.find((cutscene) => cutscene.id === id);
              if (item) changePlacement({ ...item, position });
            }}
            externalInspector
            assistPreview={assist.model}
            assistLocked={assist.isOpen}
            highlightSceneIds={assist.justAdded}
            connectionFromSceneId={connectionFromId}
            onConnectionEnd={() => setConnectionFromId(null)}
            selectedSceneId={sceneId}
            activeLinkId={linkId}
            selectedSectionId={sectionId}
            markedSceneIds={markedScenes}
            onCanvasContext={onCanvasContext}
            onSelectScene={selectScene}
            onSelectLink={selectLink}
            onSelectSection={selectSection}
            onToggleSection={toggleSection}
            onMoveSection={(id, delta) => onChange(moveStoryboardSection(campaign, id, delta))}
            onResizeSection={(id, size) => {
              const group = hierarchy.byId.get(id);
              if (group?.kind === "group") patchSection({ ...group, size });
            }}
          />
        </div>
        {expanded && (
          <div
            className="storyboard-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize details panel"
            aria-valuemin={INSPECTOR_MIN}
            aria-valuemax={INSPECTOR_MAX}
            aria-valuenow={inspectorWidth}
            tabIndex={0}
            title={t("psDragOrUseThe")}
            onPointerDown={startResize}
            onDoubleClick={() => resizeInspector(INSPECTOR_DEFAULT)}
            onKeyDown={(event) => {
              const next = widthForKey(event.key, inspectorWidth, layout.current?.clientWidth);
              if (next === undefined) return;
              event.preventDefault();
              resizeInspector(next);
            }}
          />
        )}
        <aside
          ref={inspector}
          className="playable-storyboard__inspector"
          aria-label="Adventure details"
        >
          {step === "test" ? (
            testPanel
          ) : placement ? (
            <PlacementPanel
              campaign={campaign}
              placement={placement}
              films={films}
              facts={placementFacts}
              change={changePlacement}
              create={() => showFilmEditor(null)}
              edit={showFilmEditor}
            />
          ) : step === "connections" ? (
            connectionsPanel
          ) : section ? (
            sectionInspector
          ) : scene ? (
            sceneInspector
          ) : (
            <>
              <div className="storyboard-panel-heading">
                <small>{t("psStep1")}</small>
                <h3>{campaign.scenes.length ? "Choose a scene" : "Create the opening scene"}</h3>
              </div>
              <p>
                {campaign.scenes.length
                  ? "Select a scene from the outline or board to edit it."
                  : "Start with where the player arrives and what they can do there."}
              </p>
              <button
                type="button"
                className="storyboard-primary"
                disabled={busy}
                onClick={() => addScene()}
              >
                {t("psAddAScene")}
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
function SceneActions({
  scene,
  facts,
  focusActionId,
  focusField,
  onChange,
  onAdd,
  busy,
}: {
  scene: CampaignScene;
  facts: { id: string; label: string }[];
  focusActionId: string;
  focusField: ActionField;
  onChange: (scene: CampaignScene) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const t = useTranslate();
  const actionFields = useRef<HTMLDivElement>(null);
  const [fightMessage, setFightMessage] = useState("");
  const someoneHostile = Object.values(scene.encounter?.state.actors ?? {}).some(
    (actor) =>
      scene.encounter !== undefined &&
      actor.id !== scene.encounter.definition.playerId &&
      isHostile(scene.encounter, actor),
  );
  function changeDoor(actionId: string, what: "unlock" | "open", doorId: string) {
    try {
      onChange(setDoorEffect(scene, actionId, what, doorId));
      setFightMessage("");
    } catch (reason) {
      setFightMessage(reason instanceof Error ? reason.message : "Could not change the action.");
    }
  }
  function toggleFight(actionId: string, outcome: "success" | "failure", on: boolean) {
    try {
      onChange(setFightBreaksOut(scene, actionId, outcome, on));
      setFightMessage("");
    } catch (reason) {
      setFightMessage(reason instanceof Error ? reason.message : "Could not change the action.");
    }
  }
  useEffect(() => {
    if (!focusActionId) return;
    const card = Array.from(
      actionFields.current?.querySelectorAll<HTMLDetailsElement>("[data-action-id]") ?? [],
    ).find((item) => item.dataset.actionId === focusActionId);
    if (!card) return;
    card.open = true;
    const input = card.querySelector<HTMLElement>(`[data-action-field="${focusField}"]`);
    input?.scrollIntoView?.({ block: "nearest" });
    input?.focus({ preventScroll: true });
  }, [focusActionId, focusField]);
  const game = scene.encounter!;
  const stats = Object.keys(game.state.actors[game.definition.playerId]!.stats);
  function patch(id: string, value: Partial<Interaction>) {
    onChange({
      ...scene,
      encounter: {
        ...game,
        definition: {
          ...game.definition,
          interactions: game.definition.interactions.map((action) =>
            action.id === id ? { ...action, ...value } : action,
          ),
        },
      },
    });
  }
  return (
    <div ref={actionFields} className="playable-actions storyboard-form-block">
      <div className="storyboard-actions-heading">
        <h4>{t("psPlayerActions")}</h4>
        <button type="button" disabled={busy} onClick={onAdd}>
          + Action
        </button>
      </div>
      {!game.definition.interactions.length && (
        <p className="playable-hint">{t("psAddAnActionWhen")}</p>
      )}
      {game.definition.interactions.map((action) => (
        <details key={action.id} data-action-id={action.id} className="playable-action">
          <summary>{action.label || t("psUntitledAction")}</summary>
          <label>
            {t("psActionLabel")}
            <input
              data-action-field="label"
              value={action.label}
              onChange={(event) => patch(action.id, { label: event.target.value })}
            />
          </label>
          <label>
            {t("psWhatHappensOnSuccess")}
            <textarea
              data-action-field="success"
              rows={3}
              value={action.success.text}
              onChange={(event) =>
                patch(action.id, { success: { ...action.success, text: event.target.value } })
              }
            />
          </label>
          <label>
            {t("psWhatPlayerLearns")}
            <input
              data-action-field="learned"
              maxLength={200}
              value={learnedFrom(scene, action.id)}
              placeholder={t("psWhatPlayerLearnsHint")}
              onChange={(event) => onChange(setLearned(scene, action.id, event.target.value))}
            />
          </label>
          {action.success.effects.map(
            (effect, index) =>
              effect.kind === "transfer-item" && (
                <p key={index} className="playable-hint">
                  Transfers{" "}
                  {game.definition.items.find((item) => item.id === effect.itemId)?.name ??
                    effect.itemId}{" "}
                  from {game.state.actors[effect.from]?.name ?? effect.from} to{" "}
                  {game.state.actors[effect.to]?.name ?? effect.to}.
                </p>
              ),
          )}
          <label className="playable-check">
            <input
              type="checkbox"
              aria-label="A fight breaks out on success"
              disabled={!someoneHostile && !fightBreaksOut(scene, action.id, "success")}
              checked={fightBreaksOut(scene, action.id, "success")}
              onChange={(event) => toggleFight(action.id, "success", event.target.checked)}
            />
            {t("psAFightBreaksOut")}
          </label>
          {!someoneHostile && <p className="playable-hint">{t("psAFightNeedsSomeone")}</p>}
          {fightMessage && (
            <p role="alert" className="storyboard-scene-parts__error">
              {fightMessage}
            </p>
          )}
          {doorsHere(scene).length > 0 && (
            <>
              {(["unlock", "open"] as const).map((what) => (
                <label key={what}>
                  {what === "unlock" ? "This unlocks…" : "This opens…"}
                  <select
                    aria-label={what === "unlock" ? "This unlocks" : "This opens"}
                    value={
                      doorEffects(scene, action.id)[what === "unlock" ? "unlocks" : "opens"] ?? ""
                    }
                    onChange={(event) => changeDoor(action.id, what, event.target.value)}
                  >
                    <option value="">{t("psNothing")}</option>
                    {doorsHere(scene).map((door) => (
                      <option key={door.id} value={door.id}>
                        {door.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </>
          )}
          <label className="playable-check">
            <input
              type="checkbox"
              checked={!!action.check}
              onChange={(event) =>
                patch(action.id, {
                  check: event.target.checked
                    ? { stat: stats[0] ?? "Observation", modifier: 0 }
                    : undefined,
                })
              }
            />
            {t("psRequiresASkillRoll")}
          </label>
          {action.check && (
            <>
              <label>
                {t("psSkill")}
                <select
                  aria-label="Skill"
                  value={action.check.stat}
                  onChange={(event) =>
                    patch(action.id, { check: { ...action.check!, stat: event.target.value } })
                  }
                >
                  {stats.map((stat) => (
                    <option key={stat} value={stat}>
                      {statName(game.definition, stat)}
                    </option>
                  ))}
                  {!stats.includes(action.check.stat) && (
                    <option value={action.check.stat}>
                      {action.check.stat} (not in the rule-set)
                    </option>
                  )}
                </select>
              </label>
              <label>
                {t("psDifficulty")}
                <select
                  aria-label="Difficulty"
                  value={action.check.modifier}
                  onChange={(event) =>
                    patch(action.id, {
                      check: { ...action.check!, modifier: Number(event.target.value) },
                    })
                  }
                >
                  {CHECK_LEVELS.map((level) => (
                    <option key={level.id} value={level.modifier}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="playable-hint" role="status" aria-label="Your chance">
                {checkPreview(
                  game.definition,
                  game.state.actors[game.definition.playerId]!,
                  action.check.stat,
                  action.check.modifier,
                )}
              </p>
              <label>
                {t("psWhatHappensOnFailure")}
                <textarea
                  data-action-field="failure"
                  rows={2}
                  value={action.failure.text}
                  onChange={(event) =>
                    patch(action.id, { failure: { ...action.failure, text: event.target.value } })
                  }
                />
              </label>
              <label className="playable-check">
                <input
                  type="checkbox"
                  aria-label="A fight breaks out on failure"
                  disabled={!someoneHostile && !fightBreaksOut(scene, action.id, "failure")}
                  checked={fightBreaksOut(scene, action.id, "failure")}
                  onChange={(event) => toggleFight(action.id, "failure", event.target.checked)}
                />
                {t("psAFightBreaksOut")}
              </label>
            </>
          )}
          <details className="storyboard-action-options">
            <summary>{t("psPeopleConversationConditions")}</summary>
            <label>
              {t("psWhoThisActionConcerns")}
              <select
                aria-label="Who this action concerns"
                value={action.counterpartyId ?? ""}
                onChange={(event) =>
                  patch(action.id, { counterpartyId: event.target.value || undefined })
                }
              >
                <option value="">{t("psTheSceneAnObject")}</option>
                {Object.values(game.state.actors)
                  .filter((actor) => actor.id !== game.definition.playerId)
                  .map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("psConversationType")}
              <select
                aria-label="Conversation type"
                value={action.dialogueMode ?? "question"}
                onChange={(event) =>
                  patch(action.id, { dialogueMode: event.target.value as "question" | "report" })
                }
              >
                <option value="question">{t("psQuestion")}</option>
                <option value="report">{t("psShareADiscovery")}</option>
              </select>
            </label>
            <label>
              {t("psConversationTopics")}
              <input
                key={dialogueTopics(action).join(";")}
                defaultValue={dialogueTopics(action).join("; ")}
                onBlur={(event) =>
                  patch(action.id, {
                    dialogueTopics: event.target.value
                      .split(";")
                      .map((topic) => topic.trim())
                      .filter(Boolean)
                      .slice(0, 12),
                  })
                }
                placeholder={t("psMessengerCourier")}
                maxLength={960}
              />
            </label>
            <p className="playable-hint">{t("psSeparateTopicsWithSemicolons")}</p>
            <fieldset>
              <legend>{t("psAvailableAfterTheseDiscoveries")}</legend>
              {facts
                .filter(
                  (fact) =>
                    ![...action.success.effects, ...action.failure.effects].some(
                      (effect) => effect.kind === "flag" && effect.flag === fact.id,
                    ),
                )
                .map((fact) => (
                  <label className="playable-check" key={fact.id}>
                    <input
                      type="checkbox"
                      checked={action.requiresFlags.includes(fact.id)}
                      onChange={(event) =>
                        patch(action.id, {
                          requiresFlags: event.target.checked
                            ? [...action.requiresFlags, fact.id]
                            : action.requiresFlags.filter((id) => id !== fact.id),
                        })
                      }
                    />
                    {fact.label}
                  </label>
                ))}
            </fieldset>
          </details>
          <button
            type="button"
            className="playable-remove"
            onClick={() =>
              onChange({
                ...scene,
                encounter: {
                  ...game,
                  definition: {
                    ...game.definition,
                    interactions: game.definition.interactions.filter(
                      (item) => item.id !== action.id,
                    ),
                  },
                },
              })
            }
          >
            {t("psRemoveAction")}
          </button>
        </details>
      ))}
    </div>
  );
}
