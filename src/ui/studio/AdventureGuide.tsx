import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguageControls, useTranslate } from "../i18n/LanguageProvider";
import { guideImages, savedGuideImages } from "../../library/guideImages";
import { buildGuideAdventure } from "../../library/buildGuideAdventure";
import { publicCommands } from "../../game/catalog";
import {
  guideApprovalDraft,
  guideIdeas,
  newGuideChoice,
  newGuideInterview,
  newGuideScene,
  nextGuideQuestion,
  outcomeSuggestions,
  outstandingQuestions,
  questionNames,
  subjectNames,
  type GuideDestinationRepair,
  type GuideInterview,
  type GuideQuestion,
  type GuideSubject,
} from "../../library/guideInterview";
import {
  GuideInterviewConflictError,
  type IndexedDBRepository,
} from "../../persistence/IndexedDBRepository";
import { sessionFromAdventureStart } from "../../session/campaignStart";
import { startSavedGuideAdventure } from "./guidePlaytest";
import type { Session } from "../../state/StateSchema";
import {
  GuideExisting,
  GuidePlanEditor,
  GuideText,
  PlaceFields,
  RoleFields,
  WorldFields,
  type InterviewLibrary,
  type WorldPart,
} from "./GuidePlanEditor";
import { GuideAssistant } from "./GuideAssistant";
import { GuideImagePlan } from "./GuideImagePlan";
import "./adventure-guide.css";

type Props = {
  repo: IndexedDBRepository;
  sessionId: string;
  close: () => void;
  onStart: (session: Session) => Promise<void>;
  openStoryboard?: ((campaignId: string) => void) | undefined;
  onCreated: (campaignId: string) => Promise<void>;
};

async function readLibrary(repo: IndexedDBRepository): Promise<InterviewLibrary> {
  const [campaigns, characters, factions, objects, places, realms] = await Promise.all([
    repo.listCampaigns(),
    repo.listCharacters(),
    repo.listFactions(),
    repo.listObjects(),
    repo.listPlaces(),
    repo.listRealms(),
  ]);
  return { campaigns, characters, factions, objects, places, realms };
}

const questionSubjects: Partial<Record<GuideQuestion, GuideSubject>> = {
  direction: "direction",
  role: "opening",
  place: "opening",
  arrival: "opening",
  action: "opening",
  outcome: "opening",
  world: "world",
  future: "future",
};
const directions = ["cgDiscover", "cgCollaborate", "cgSolve"] as const;

export function AdventureGuide({
  repo,
  sessionId,
  close,
  onStart,
  openStoryboard,
  onCreated,
}: Props) {
  const t = useTranslate();
  const language = useLanguageControls()?.language ?? "en";
  const [loaded, setLoaded] = useState<{
    draft: GuideInterview;
    persisted: boolean;
    library: InterviewLibrary;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([repo.loadGuideInterview(), readLibrary(repo)]).then(
      ([draft, library]) => {
        if (active)
          setLoaded({ draft: draft ?? newGuideInterview(language), persisted: !!draft, library });
      },
      (reason: unknown) => {
        if (active) setError(String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [repo, language]);
  return (
    <section className="adventure-guide" aria-label={t("cgTitle")}>
      <header className="guide-heading">
        <h1>{t("cgTitle")}</h1>
        {!loaded && (
          <button type="button" onClick={close}>
            {t("cgClose")}
          </button>
        )}
      </header>
      {loaded ? (
        <GuideWorkspace
          {...loaded}
          repo={repo}
          sessionId={sessionId}
          close={close}
          onStart={onStart}
          onCreated={onCreated}
          openStoryboard={openStoryboard}
        />
      ) : (
        <p role={error ? "alert" : "status"}>{error || t("cgLoading")}</p>
      )}
    </section>
  );
}

function GuideWorkspace({
  draft: initial,
  persisted,
  library: initialLibrary,
  repo,
  sessionId,
  close,
  onStart,
  openStoryboard,
  onCreated,
}: Props & { draft: GuideInterview; persisted: boolean; library: InterviewLibrary }) {
  const t = useTranslate();
  const language = useLanguageControls()?.language ?? "en";
  const [draft, setDraft] = useState(initial);
  const latest = useRef(initial);
  const savedVersion = useRef<GuideInterview | undefined>(persisted ? initial : undefined);
  const saveQueue = useRef(Promise.resolve());
  const [library, setLibrary] = useState(initialLibrary);
  const savedCampaign = library.campaigns.find(({ id }) => id === draft.appliedCampaignId);
  const [pane, setPane] = useState<"guide" | "plan">("guide");
  const [flow, setFlow] = useState(false);
  const [review, setReview] = useState(false);
  const [help, setHelp] = useState(false);
  const [existing, setExisting] = useState(false);
  const [worldPart, setWorldPart] = useState<WorldPart>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [repair, setRepair] = useState<GuideDestinationRepair>();
  const heading = useRef<HTMLHeadingElement>(null);
  const { question, subject } = draft;

  function edit(change: Partial<GuideInterview>) {
    if (busyRef.current || conflict) return;
    const updated = { ...latest.current, ...change, revision: latest.current.revision + 1 };
    latest.current = updated;
    setDraft(updated);
    setReview(false);
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        await repo.saveGuideInterview(updated, savedVersion.current);
        savedVersion.current = updated;
      });
    void saveQueue.current.then(
      () => setSaveError(""),
      (reason: unknown) => {
        if (reason instanceof GuideInterviewConflictError) {
          setConflict(true);
          setReview(false);
          setSaveError(t("cgInterviewConflict"));
        } else {
          setSaveError(t("cgSaveFailed"));
        }
      },
    );
  }

  function reloadLatest() {
    void run(async () => {
      await saveQueue.current.catch(() => {});
      const current = await repo.loadGuideInterview();
      const reloaded = current ?? newGuideInterview(language);
      if (reloaded.appliedCampaignId) setLibrary(await readLibrary(repo));
      savedVersion.current = current;
      latest.current = reloaded;
      saveQueue.current = Promise.resolve();
      setDraft(reloaded);
      setConflict(false);
      setSaveError("");
      setReview(false);
      setPane("guide");
    }, false);
  }

  useEffect(() => {
    if (pane === "guide") heading.current?.focus();
  }, [question, pane, review]);
  useEffect(() => {
    if (repair && pane === "plan" && !flow)
      document.getElementById(`guide-${repair.sceneId}-${repair.field}`)?.focus();
  }, [repair, pane, flow]);

  function showRepair(target: GuideDestinationRepair) {
    setFlow(false);
    setPane("plan");
    setRepair({ ...target });
  }

  function focusQuestion(next: GuideQuestion) {
    if (busyRef.current) return;
    setHelp(false);
    setReview(false);
    setPane("guide");
    edit({
      question: next,
      subject: questionSubjects[next] ?? null,
      deferred: draft.deferred.filter((item) => item !== next),
    });
  }

  function chooseSubject(next: GuideSubject) {
    const question = nextGuideQuestion(draft, next);
    setHelp(false);
    if (question) focusQuestion(question);
    else edit({ subject: next, question: null });
  }

  function advance(defer: boolean) {
    const deferred =
      defer && question ? [...new Set([...draft.deferred, question])] : draft.deferred;
    let next: GuideQuestion | null = null;
    if (subject) {
      next = nextGuideQuestion(
        { ...draft, deferred },
        subject,
        question === "world" ? question : null,
      );
      // An unfinished answer can be revisited without skipping ahead.
      if (!defer && next === question) return;
    }
    edit({ deferred, question: next });
    setHelp(false);
    setExisting(false);
  }

  async function run(task: () => Promise<void>, flush = true) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (flush) await saveQueue.current;
      await task();
    } catch (reason) {
      if (reason instanceof GuideInterviewConflictError) {
        setConflict(true);
        setReview(false);
        setSaveError(t("cgInterviewConflict"));
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const preview = useMemo(() => {
    if (draft.appliedCampaignId) return undefined;
    const candidate = guideApprovalDraft(draft);
    if (!candidate.ok) return candidate;
    try {
      const approved = candidate.draft;
      const map = approved.map;
      const realm =
        map.kind === "new" ? undefined : library.realms.find(({ id }) => id === map.realmId);
      const built = buildGuideAdventure(approved, { ...library, realm });
      const launch = sessionFromAdventureStart(
        {
          campaign: built.campaign,
          characters: [...library.characters, ...built.characters],
          realms: built.realm ? [...library.realms, built.realm] : library.realms,
          places: [...library.places, ...built.places],
          objects: [...library.objects, ...built.objects],
          factions: [...library.factions, ...built.factions],
          voices: [],
          rulesets: [],
        },
        sessionId,
      );
      if (
        !launch.ok ||
        !launch.session.encounter ||
        !publicCommands(launch.session.encounter).some(
          ({ action, blocked }) => action.kind === "interaction" && !blocked,
        )
      )
        return {
          ok: false as const,
          question: "action" as const,
          message: launch.ok ? t("cgOpeningAction") : launch.reason,
        };
      return { ...candidate, built };
    } catch (reason) {
      return {
        ok: false as const,
        question: "place" as const,
        message: reason instanceof Error ? reason.message : String(reason),
      };
    }
  }, [draft, library, sessionId, t]);

  function approve() {
    if (!preview?.ok || conflict) return;
    void run(async () => {
      const campaign = await repo.approveGuideInterview(draft).catch(async (reason: unknown) => {
        if (!(reason instanceof GuideInterviewConflictError)) setLibrary(await readLibrary(repo));
        throw reason;
      });
      const applied = { ...draft, revision: draft.revision + 1, appliedCampaignId: campaign.id };
      latest.current = applied;
      savedVersion.current = applied;
      setDraft(applied);
      setReview(false);
      setLibrary(await readLibrary(repo));
      await onCreated(campaign.id);
    });
  }

  function play() {
    const id = draft.appliedCampaignId;
    if (!id) return;
    void run(async () => onStart(await startSavedGuideAdventure(repo, id, sessionId)));
  }

  const activeChoice =
    draft.choices.find(({ label, outcome }) => label.trim() && !outcome.trim()) ??
    draft.choices.find(({ label }) => label.trim());
  // Keep editing the same outcome while typing, even once it is nonempty.
  const [outcomeId, setOutcomeId] = useState<string>();
  const outcome = draft.choices.find(({ id }) => id === outcomeId) ?? activeChoice;
  function answerOutcome(value: string) {
    if (!outcome) return;
    setOutcomeId(outcome.id);
    edit({
      choices: draft.choices.map((choice) =>
        choice.id === outcome.id ? { ...choice, outcome: value } : choice,
      ),
    });
  }
  const currentChoice = draft.choices.find(({ label }) => !label.trim()) ?? draft.choices[0];
  function answerAction(label: string, context = currentChoice?.context ?? "free") {
    const answer = { ...(currentChoice ?? newGuideChoice()), label, context };
    edit({
      choices: currentChoice
        ? draft.choices.map((choice) => (choice.id === answer.id ? answer : choice))
        : [...draft.choices, answer],
    });
  }
  function pickExistingPlace(id: string) {
    const card = library.places.find((place) => place.id === id);
    if (card)
      edit({
        opening: {
          ...draft.opening,
          place: { name: card.name, placeId: id, realmId: card.realmId },
        },
        ...(!draft.premise.trim() ? { premise: t("cgPremisePlace", { name: card.name }) } : {}),
      });
  }
  const existingScenes = library.campaigns.flatMap((campaign) =>
    campaign.scenes
      .filter((scene) => scene.encounter)
      .map((scene) => ({
        id: JSON.stringify([campaign.id, scene.id]),
        name: `${campaign.name} · ${scene.name}`,
        scene,
        campaign,
      })),
  );
  function pickExistingScene(id: string) {
    const chosen = existingScenes.find((entry) => entry.id === id);
    if (!chosen) return;
    const { campaign, scene } = chosen;
    const card = library.places.find((place) => place.id === scene.placeId);
    const node = library.realms
      .find(({ id }) => id === campaign.mapWorldId)
      ?.worldMap?.nodes.find(({ id }) => id === scene.mapNodeId);
    const place =
      node && campaign.mapWorldId
        ? {
            name: node.name,
            realmId: campaign.mapWorldId,
            nodeId: node.id,
            placeId: node.placeId ?? node.id,
            cardId: card?.id,
          }
        : card
          ? { name: card.name, realmId: card.realmId, placeId: card.id }
          : draft.opening.place;
    edit({
      opening: {
        ...draft.opening,
        place,
        name: scene.name,
        arrival: scene.encounter?.definition.description ?? "",
      },
      ...(!draft.premise.trim() ? { premise: t("cgPremiseScene", { name: scene.name }) } : {}),
    });
  }
  const selectedPlace = library.places.find(({ id }) => id === draft.opening.place.placeId);
  const node = library.realms
    .find(({ id }) => id === draft.opening.place.realmId)
    ?.worldMap?.nodes.find(({ id }) => id === draft.opening.place.nodeId);
  const arrivalSuggestion = node?.intro || selectedPlace?.note || node?.description;
  const future = draft.later[0];
  const assistantChoice =
    question === "action" ? currentChoice : question === "outcome" ? outcome : undefined;
  const questionBody =
    question &&
    {
      idea: (
        <>
          <p>{t("cgIntroHelp")}</p>
          <GuideText
            label={t("cgIdea")}
            value={draft.premise}
            change={(premise) => edit({ premise })}
            multiline
          />
          <div className="guide-buttons guide-idea-actions">
            <button type="button" disabled={!draft.premise.trim()} onClick={() => advance(false)}>
              {t("cgNext")}
            </button>
            <button type="button" aria-expanded={help} onClick={() => setHelp(!help)}>
              {t("cgFindIdea")}
            </button>
          </div>
          <div className="guide-buttons">
            <button type="button" onClick={() => setExisting(!existing)}>
              {t("cgExisting")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPane("plan");
                setFlow(false);
              }}
            >
              {t("cgOpenOverview")}
            </button>
          </div>
          {existing && (
            <>
              <GuideExisting
                label={t("cgStartPlace")}
                records={library.places}
                select={pickExistingPlace}
              />
              <GuideExisting
                label={t("cgStartScene")}
                records={existingScenes}
                select={pickExistingScene}
              />
              <RoleFields
                role={draft.role}
                library={library}
                change={(role) =>
                  edit({
                    role,
                    ...(!draft.premise.trim() && role.existingId
                      ? { premise: t("cgPremiseRole", { name: role.name }) }
                      : {}),
                  })
                }
              />
              {!library.characters.length && !library.places.length && <p>{t("cgLibraryHint")}</p>}
            </>
          )}
          {help &&
            guideIdeas.map((idea) => (
              <button type="button" key={idea} onClick={() => edit({ premise: t(idea) })}>
                {t(idea)}
              </button>
            ))}
        </>
      ),
      direction: (
        <>
          <GuideText
            label={t("cgPlayerExperience")}
            value={draft.intention}
            change={(intention) => edit({ intention })}
          />
          <button type="button" onClick={() => setHelp(!help)}>
            {t("cgShowSuggestions")}
          </button>
          {help &&
            directions.map((label) => (
              <button type="button" key={label} onClick={() => edit({ intention: t(label) })}>
                {t(label)}
              </button>
            ))}
        </>
      ),
      role: <RoleFields role={draft.role} library={library} change={(role) => edit({ role })} />,
      place: (
        <PlaceFields
          place={draft.opening.place}
          library={library}
          change={(place) => edit({ opening: { ...draft.opening, place } })}
        />
      ),
      arrival: (
        <>
          {draft.role.name && <p>{t("cgNoticeRole", { name: draft.role.name })}</p>}
          <GuideText
            label={t("cgArrival")}
            value={draft.opening.arrival}
            multiline
            change={(arrival) => edit({ opening: { ...draft.opening, arrival } })}
          />
          {arrivalSuggestion && (
            <button
              type="button"
              onClick={() => edit({ opening: { ...draft.opening, arrival: arrivalSuggestion } })}
            >
              {t("cgUsePlaceIntro")}
            </button>
          )}
        </>
      ),
      action: (
        <>
          <GuideText
            label={t("cgAction")}
            value={currentChoice?.label ?? ""}
            change={answerAction}
          />
          <button type="button" onClick={() => answerAction(t("cgAskHelp"), "help")}>
            {t("cgAskHelp")}
          </button>
          <button type="button" onClick={() => answerAction(t("cgInvestigate"), "free")}>
            {t("cgInvestigate")}
          </button>
        </>
      ),
      outcome: (
        <>
          <GuideText
            label={t("cgOutcome")}
            value={outcome?.outcome ?? ""}
            multiline
            change={answerOutcome}
          />
          <button type="button" onClick={() => setHelp(!help)}>
            {t("cgInvent")}
          </button>
          {help &&
            outcomeSuggestions(outcome?.context ?? "free").map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => answerOutcome(t(suggestion))}>
                {t(suggestion)}
              </button>
            ))}
        </>
      ),
      world: (
        <>
          <div className="guide-buttons">
            {(
              [
                ["people", t("cgPerson")],
                ["place", t("cgPlace")],
                ["factions", t("cgGroup")],
                ["items", t("cgItem")],
                ["map", t("cgWorldOrMap")],
              ] as const
            ).map(([part, label]) => (
              <button
                type="button"
                key={part}
                aria-pressed={part === worldPart}
                onClick={() => setWorldPart(part)}
              >
                {label}
              </button>
            ))}
          </div>
          {worldPart && (
            <WorldFields draft={draft} library={library} edit={edit} part={worldPart} />
          )}
        </>
      ),
      future: (
        <GuideText
          label={t("cgFutureMoment")}
          value={future?.arrival ?? ""}
          multiline
          change={(arrival) =>
            edit({ later: [{ ...(future ?? newGuideScene()), arrival }, ...draft.later.slice(1)] })
          }
        />
      ),
    }[question];

  return (
    <>
      <div className="guide-buttons guide-toolbar">
        <nav className="guide-mobile-tabs" aria-label={t("cgGuideTabs")}>
          <button type="button" aria-pressed={pane === "guide"} onClick={() => setPane("guide")}>
            {t("cgGuide")}
          </button>
          <button type="button" aria-pressed={pane === "plan"} onClick={() => setPane("plan")}>
            {t("cgPlan")}
          </button>
        </nav>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(async () => close(), !conflict)}
        >
          {t("cgClose")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {conflict && (
        <button type="button" disabled={busy} onClick={reloadLatest}>
          {t("cgLoadLatestDraft")}
        </button>
      )}
      {draft.appliedCampaignId ? (
        <section className="guide-question">
          <h2>{t("cgSaved")}</h2>
          <div className="guide-buttons">
            <button type="button" disabled={busy} onClick={play}>
              {t("cgPlaytest")}
            </button>
            {openStoryboard && (
              <button
                type="button"
                disabled={busy}
                onClick={() => openStoryboard(draft.appliedCampaignId!)}
              >
                {t("cgOpenStoryboard")}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                edit({ ...newGuideInterview(language), appliedCampaignId: undefined });
                setPane("guide");
              }}
            >
              {t("cgNewIdea")}
            </button>
          </div>
          {savedCampaign && (
            <GuideImagePlan
              key={savedCampaign.id}
              saved
              images={savedGuideImages(savedCampaign, library)}
            />
          )}
        </section>
      ) : (
        <div className="guide-columns" data-pane={pane}>
          <section className="guide-question" aria-label={t("cgActiveQuestion")}>
            <h2 ref={heading} tabIndex={-1}>
              {review
                ? t("cgReviewPlan")
                : question === "outcome" && outcome
                  ? t("cgQNamedOutcome", { name: outcome.label })
                  : question
                    ? t(questionNames[question])
                    : t("cgChooseTopic")}
            </h2>
            {review && preview?.ok ? (
              <>
                <ul>
                  <li>{t("cgCreated", { name: preview.built.campaign.name })}</li>
                  {preview.built.realm && (
                    <li>{t("cgCreateMap", { name: preview.built.realm.name })}</li>
                  )}
                  {[
                    ...preview.built.places,
                    ...preview.built.objects,
                    ...preview.built.characters,
                    ...preview.built.factions,
                  ].map(({ id, name }) => (
                    <li key={id}>{t("cgCreated", { name })}</li>
                  ))}
                  {preview.draft.map.kind !== "new" && (
                    <li>
                      {t("cgReused", {
                        name:
                          library.realms.find(
                            ({ id }) =>
                              preview.draft.map.kind !== "new" && id === preview.draft.map.realmId,
                          )?.name ?? "",
                      })}
                    </li>
                  )}
                  {preview.draft.map.kind !== "new" &&
                    preview.draft.plan.places
                      .filter(
                        ({ id }) => preview.draft.map.kind !== "new" && preview.draft.map.sites[id],
                      )
                      .map(({ id, name }) => <li key={id}>{t("cgReused", { name })}</li>)}
                  {[draft.role, ...draft.people, ...draft.factions, ...draft.items]
                    .filter(({ existingId }) => existingId)
                    .map(({ name, existingId }, index) => (
                      <li key={`${existingId}-${index}`}>{t("cgReused", { name })}</li>
                    ))}
                </ul>
                <div className="guide-buttons">
                  <button type="button" disabled={busy} onClick={approve}>
                    {t("cgApprove")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setReview(false)}>
                    {t("cgContinue")}
                  </button>
                </div>
              </>
            ) : question ? (
              <>
                <fieldset disabled={busy || conflict} className="guide-answer">
                  {questionBody}
                </fieldset>
                <GuideAssistant
                  key={JSON.stringify([
                    draft.id,
                    question,
                    assistantChoice?.id,
                    question === "outcome" ? assistantChoice?.label : undefined,
                    question === "world" ? worldPart : undefined,
                  ])}
                  draft={draft}
                  question={question}
                  choice={assistantChoice}
                  worldPart={question === "world" ? worldPart : undefined}
                  disabled={busy || conflict}
                  edit={(change) => {
                    if (question === "outcome") setOutcomeId(assistantChoice?.id);
                    edit(change);
                  }}
                />
                {question !== "idea" && (
                  <div className="guide-buttons">
                    <button
                      type="button"
                      disabled={busy || conflict}
                      onClick={() => {
                        setOutcomeId(undefined);
                        advance(false);
                      }}
                    >
                      {t("cgNext")}
                    </button>
                    <button
                      type="button"
                      disabled={busy || conflict}
                      onClick={() => {
                        setOutcomeId(undefined);
                        advance(true);
                      }}
                    >
                      {t("cgDefer")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="guide-buttons">
                {(Object.keys(subjectNames) as GuideSubject[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    disabled={busy || conflict}
                    onClick={() => chooseSubject(key)}
                  >
                    {t(subjectNames[key])}
                  </button>
                ))}
              </div>
            )}
            {draft.deferred.length > 0 && (
              <section>
                <h3>{t("cgOpenQuestions")}</h3>
                {draft.deferred.map((key) => {
                  const question = key as GuideQuestion;
                  const topic = questionSubjects[question];
                  return topic && outstandingQuestions(draft, topic).includes(question) ? (
                    <button
                      type="button"
                      key={key}
                      disabled={busy || conflict}
                      onClick={() => focusQuestion(question)}
                    >
                      {t(questionNames[question])}
                    </button>
                  ) : null;
                })}
              </section>
            )}
            {draft.premise.trim() &&
              !review &&
              (preview?.ok ? (
                <button type="button" disabled={busy || conflict} onClick={() => setReview(true)}>
                  {t("cgReviewCreate")}
                </button>
              ) : (
                preview && (
                  <p>
                    {"copy" in preview && preview.copy
                      ? t(preview.copy, "values" in preview ? preview.values : undefined)
                      : preview.message}{" "}
                    {"repair" in preview && preview.repair ? (
                      <button
                        type="button"
                        onClick={() => preview.repair && showRepair(preview.repair)}
                      >
                        {t("cgShowField")}
                      </button>
                    ) : (
                      <button type="button" onClick={() => focusQuestion(preview.question)}>
                        {t(questionNames[preview.question])}
                      </button>
                    )}
                  </p>
                )
              ))}
          </section>
          <aside className="guide-plan" aria-label={t("cgPlan")}>
            <h2>{t("cgPlan")}</h2>
            <fieldset disabled={busy || conflict} className="guide-editor">
              <GuidePlanEditor
                draft={draft}
                edit={edit}
                library={library}
                focusQuestion={focusQuestion}
                flow={flow}
                setFlow={setFlow}
              />
            </fieldset>
            {draft.premise.trim() && (
              <GuideImagePlan key={draft.id} images={guideImages(draft, library)} />
            )}
          </aside>
        </div>
      )}
    </>
  );
}
