import { useState, type ReactNode } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import { adventureMapPlaces } from "../../library/adventureMap";
import type { Faction } from "../../library/factions";
import type {
  GuideInterview,
  GuideQuestion,
  InterviewMaterial,
  InterviewPlace,
} from "../../library/guideInterview";
import { newGuideChoice, newGuideScene } from "../../library/guideInterview";
import type {
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
} from "../../library/LibrarySchema";

export type InterviewLibrary = {
  campaigns: CampaignTemplate[];
  characters: CharacterTemplate[];
  factions: Faction[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
  realms: RealmTemplate[];
};
export type EditGuide = (change: Partial<GuideInterview>) => void;

export function GuideText({
  label,
  value,
  change,
  multiline = false,
  id,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  multiline?: boolean;
  id?: string | undefined;
}) {
  return (
    <label className="guide-field">
      <span>{label}</span>
      {multiline ? (
        <textarea id={id} value={value} onChange={(event) => change(event.target.value)} />
      ) : (
        <input id={id} value={value} onChange={(event) => change(event.target.value)} />
      )}
    </label>
  );
}

export function GuideExisting({
  label,
  records,
  value,
  select,
}: {
  label: string;
  records: { id: string; name: string }[];
  value?: string | undefined;
  select: (id: string) => void;
}) {
  const t = useTranslate();
  if (!records.length) return null;
  return (
    <label className="guide-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => select(event.target.value)}>
        <option value="">{t("cgSelect")}</option>
        {records.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlaceFields({
  place,
  library,
  change,
  id,
}: {
  place: InterviewPlace;
  library: InterviewLibrary;
  change: (place: InterviewPlace) => void;
  id?: string;
}) {
  const t = useTranslate();
  const nodes = library.realms.flatMap((world) =>
    adventureMapPlaces(world, library.places)
      .filter(({ node }) => !node.isArea)
      .map(({ node, place, path }) => ({
        id: JSON.stringify([world.id, node.id]),
        name: `${world.name} · ${path}`,
        selection: {
          name: place.name,
          realmId: world.id,
          placeId: place.id,
          nodeId: node.id,
          cardId: library.places.find((card) => card.id === place.id && card.realmId === world.id)
            ?.id,
        },
      })),
  );
  return (
    <>
      <GuideText
        id={id}
        label={t("cgPlaceName")}
        value={place.name}
        change={(name) => change({ name })}
      />
      <GuideExisting
        label={t("cgExistingPlace")}
        records={library.places}
        value={!place.nodeId ? place.placeId : undefined}
        select={(id) => {
          const selected = library.places.find((entry) => entry.id === id);
          change(
            selected
              ? { name: selected.name, placeId: id, realmId: selected.realmId }
              : { name: "" },
          );
        }}
      />
      <GuideExisting
        label={t("cgMapPlace")}
        records={nodes}
        value={place.nodeId ? JSON.stringify([place.realmId, place.nodeId]) : undefined}
        select={(id) => change(nodes.find((entry) => entry.id === id)?.selection ?? { name: "" })}
      />
    </>
  );
}

export function RoleFields({
  role,
  library,
  change,
}: {
  role: InterviewMaterial;
  library: InterviewLibrary;
  change: (role: InterviewMaterial) => void;
}) {
  const t = useTranslate();
  return (
    <>
      <GuideText
        label={t("cgPlayerRole")}
        value={role.name}
        change={(name) => change({ name, note: role.note })}
      />
      <GuideExisting
        label={t("cgExistingRole")}
        records={library.characters}
        value={role.existingId}
        select={(id) => {
          const person = library.characters.find((entry) => entry.id === id);
          change(
            person
              ? { name: person.name, note: person.personality, existingId: id }
              : { name: "", note: "" },
          );
        }}
      />
    </>
  );
}

const worldParts = [
  {
    field: "people",
    title: "cgPeople",
    name: "cgPersonName",
    role: "cgPersonRole",
    reuse: "cgReusePerson",
    add: "cgAddPerson",
    records: "characters",
  },
  {
    field: "factions",
    title: "cgGroups",
    name: "cgGroupName",
    role: "cgGroupRole",
    reuse: "cgReuseGroup",
    add: "cgAddGroup",
    records: "factions",
  },
  {
    field: "items",
    title: "cgItems",
    name: "cgItemName",
    role: "cgItemRole",
    reuse: "cgReuseItem",
    add: "cgAddItem",
    records: "objects",
  },
] as const;
export type WorldPart = (typeof worldParts)[number]["field"] | "map" | "place";

export function WorldFields({
  draft,
  edit,
  library,
  part,
}: {
  draft: GuideInterview;
  edit: EditGuide;
  library: InterviewLibrary;
  part?: WorldPart | undefined;
}) {
  const t = useTranslate();
  return (
    <>
      {(!part || part === "map") && (
        <>
          <GuideText
            label={t("cgWorldName")}
            value={draft.world.name}
            change={(name) => edit({ world: { name, note: draft.world.note } })}
          />
          <GuideText
            label={t("cgAboutWorld")}
            value={draft.world.note}
            change={(note) => edit({ world: { ...draft.world, note } })}
            multiline
          />
          <GuideExisting
            label={t("cgExistingWorld")}
            records={library.realms}
            value={draft.world.existingId}
            select={(id) => {
              const world = library.realms.find((entry) => entry.id === id);
              edit({
                world: world
                  ? { name: world.name, note: world.note, existingId: id }
                  : { name: "", note: "" },
              });
            }}
          />
        </>
      )}
      {part === "place" && (
        <>
          {draft.later.map((scene) => (
            <fieldset key={scene.id}>
              <legend>{scene.name || t("cgLaterPlace")}</legend>
              <PlaceFields
                place={scene.place}
                library={library}
                change={(place) =>
                  edit({
                    later: draft.later.map((row) =>
                      row.id === scene.id ? { ...row, place } : row,
                    ),
                  })
                }
              />
            </fieldset>
          ))}
          <button type="button" onClick={() => edit({ later: [...draft.later, newGuideScene()] })}>
            {t("cgAddPlace")}
          </button>
        </>
      )}
      {worldParts
        .filter(({ field }) => !part || part === field)
        .map(({ field, title, name, role, reuse, add, records }) => (
          <div key={field}>
            <h4>{t(title)}</h4>
            {draft[field].map((row, index) => {
              function replace(next: InterviewMaterial) {
                edit({ [field]: draft[field].map((current, i) => (i === index ? next : current)) });
              }
              return (
                <fieldset key={index}>
                  <GuideText
                    label={t(name)}
                    value={row.name}
                    change={(name) => replace({ name, note: row.note })}
                  />
                  <GuideText
                    label={t(role)}
                    value={row.note}
                    change={(note) => replace({ ...row, note })}
                  />
                  <GuideExisting
                    label={t(reuse)}
                    records={library[records]}
                    value={row.existingId}
                    select={(id) => {
                      const record = library[records].find((entry) => entry.id === id);
                      replace(
                        record
                          ? { name: record.name, note: row.note, existingId: id }
                          : { name: "", note: row.note },
                      );
                    }}
                  />
                </fieldset>
              );
            })}
            <button
              type="button"
              onClick={() => edit({ [field]: [...draft[field], { name: "", note: "" }] })}
            >
              {t(add)}
            </button>
          </div>
        ))}
    </>
  );
}

function PlanSection({
  title,
  question,
  focusQuestion,
  children,
  keepOpen,
}: {
  title: string;
  question: GuideQuestion;
  focusQuestion: (question: GuideQuestion) => void;
  children: ReactNode;
  keepOpen?: () => void;
}) {
  return (
    <section className="guide-plan-section" onFocusCapture={keepOpen}>
      <h3>
        <button type="button" onClick={() => focusQuestion(question)}>
          {title}
        </button>
      </h3>
      {children}
    </section>
  );
}

const optionalSections = {
  direction: "cgDirection",
  role: "cgRoleSection",
  opening: "cgOpening",
  choices: "cgPlayerChoices",
  world: "cgWorldMaterial",
  later: "cgLaterScenes",
  secrets: "cgSecrets",
} as const;
type OptionalSection = keyof typeof optionalSections;

export function GuidePlanEditor({
  draft,
  edit,
  library,
  focusQuestion,
  flow,
  setFlow,
}: {
  draft: GuideInterview;
  edit: EditGuide;
  library: InterviewLibrary;
  focusQuestion: (question: GuideQuestion) => void;
  flow: boolean;
  setFlow: (value: boolean) => void;
}) {
  const t = useTranslate();
  const { opening } = draft;
  const [revealed, setRevealed] = useState<ReadonlySet<OptionalSection>>(new Set());
  const hasContent = {
    direction: !!draft.intention.trim(),
    role: !!draft.role.name.trim(),
    opening: !!(opening.place.name.trim() || opening.arrival.trim()),
    choices: draft.choices.length > 0,
    world: !!(
      draft.world.name.trim() ||
      draft.world.note.trim() ||
      draft.people.length ||
      draft.factions.length ||
      draft.items.length
    ),
    later: draft.later.length > 0,
    secrets: !!draft.secrets.trim(),
  };
  const show = (section: OptionalSection) => hasContent[section] || revealed.has(section);
  const reveal = (section: OptionalSection) =>
    setRevealed((old) => (old.has(section) ? old : new Set([...old, section])));
  const additional = (Object.keys(optionalSections) as OptionalSection[]).filter(
    (section) => !show(section),
  );
  const hasFlow = draft.choices.some(({ label, outcome }) => label.trim() && outcome.trim());
  return (
    <>
      {(hasFlow || flow) && (
        <nav className="guide-buttons" aria-label={t("cgPlanView")}>
          <button type="button" aria-pressed={!flow} onClick={() => setFlow(false)}>
            {t("cgOverview")}
          </button>
          <button type="button" aria-pressed={flow} onClick={() => setFlow(true)}>
            {t("cgFlow")}
          </button>
        </nav>
      )}
      {flow ? (
        <section className="guide-plan-section">
          <h3>{opening.name || opening.place.name || t("cgTheOpening")}</h3>
          {opening.arrival && <p>{opening.arrival}</p>}
          {draft.choices
            .filter(({ label }) => label.trim())
            .map((choice) => (
              <article key={choice.id}>
                <h4>{choice.label}</h4>
                <p>{choice.outcome || t("cgOpenOutcome")}</p>
                {choice.targetSceneId && (
                  <p>
                    {t("cgDestination", {
                      name:
                        draft.later.find(({ id }) => id === choice.targetSceneId)?.name ||
                        t("cgLaterScene"),
                    })}
                  </p>
                )}
              </article>
            ))}
        </section>
      ) : (
        <>
          <PlanSection title={t("cgIdea")} question="idea" focusQuestion={focusQuestion}>
            {draft.premise && (
              <>
                <p className="guide-original">{draft.premise}</p>
                <GuideText
                  label={t("cgAdventureTitle")}
                  value={draft.title}
                  change={(title) => edit({ title })}
                />
              </>
            )}
          </PlanSection>
          {show("direction") && (
            <PlanSection
              title={t("cgDirection")}
              question="direction"
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("direction")}
            >
              <GuideText
                label={t("cgIntent")}
                value={draft.intention}
                change={(intention) => edit({ intention })}
              />
            </PlanSection>
          )}
          {show("role") && (
            <PlanSection
              title={t("cgRoleSection")}
              question="role"
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("role")}
            >
              <RoleFields role={draft.role} library={library} change={(role) => edit({ role })} />
            </PlanSection>
          )}
          {show("opening") && (
            <PlanSection
              title={t("cgOpening")}
              question={opening.place.name ? "arrival" : "place"}
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("opening")}
            >
              <PlaceFields
                place={opening.place}
                library={library}
                change={(place) => edit({ opening: { ...opening, place } })}
              />
              <GuideText
                label={t("cgPlanArrival")}
                value={opening.arrival}
                multiline
                change={(arrival) => edit({ opening: { ...opening, arrival } })}
              />
            </PlanSection>
          )}
          {show("choices") && (
            <PlanSection
              title={t("cgPlayerChoices")}
              question={draft.choices.length ? "outcome" : "action"}
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("choices")}
            >
              {draft.choices.map((choice) => {
                function change(patch: Partial<typeof choice>) {
                  edit({
                    choices: draft.choices.map((row) =>
                      row.id === choice.id ? { ...row, ...patch } : row,
                    ),
                  });
                }
                const destinations = draft.later
                  .filter(
                    ({ id, place, arrival }) =>
                      id === choice.targetSceneId || (place.name.trim() && arrival.trim()),
                  )
                  .map(({ id, name, place }) => ({
                    id,
                    name: name.trim() || place.name || t("cgLaterScene"),
                  }));
                if (
                  choice.targetSceneId &&
                  !destinations.some(({ id }) => id === choice.targetSceneId)
                )
                  destinations.push({ id: choice.targetSceneId, name: t("cgMissingDestination") });
                return (
                  <fieldset key={choice.id}>
                    <GuideText
                      label={t("cgPlanAction")}
                      value={choice.label}
                      change={(label) => change({ label })}
                    />
                    <GuideText
                      label={t("cgPlanOutcome")}
                      value={choice.outcome}
                      multiline
                      change={(outcome) => change({ outcome })}
                    />
                    <GuideExisting
                      label={t("cgGoToScene")}
                      records={destinations}
                      value={choice.targetSceneId}
                      select={(targetSceneId) => change({ targetSceneId })}
                    />
                    {choice.targetSceneId && (
                      <button type="button" onClick={() => change({ targetSceneId: "" })}>
                        {t("cgRemoveLink")}
                      </button>
                    )}
                  </fieldset>
                );
              })}
              <button
                type="button"
                onClick={() => edit({ choices: [...draft.choices, newGuideChoice()] })}
              >
                {t("cgAddChoice")}
              </button>
            </PlanSection>
          )}
          {show("world") && (
            <PlanSection
              title={t("cgWorldMaterial")}
              question="world"
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("world")}
            >
              <WorldFields draft={draft} edit={edit} library={library} />
            </PlanSection>
          )}
          {show("later") && (
            <PlanSection
              title={t("cgLaterScenes")}
              question="future"
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("later")}
            >
              {draft.later.map((scene) => {
                function change(patch: Partial<typeof scene>) {
                  edit({
                    later: draft.later.map((row) =>
                      row.id === scene.id ? { ...row, ...patch } : row,
                    ),
                  });
                }
                return (
                  <fieldset key={scene.id}>
                    <legend>
                      {scene.place.name &&
                      scene.arrival &&
                      draft.choices.some(
                        (choice) => choice.label.trim() && choice.targetSceneId === scene.id,
                      )
                        ? t("cgScene")
                        : t("cgSceneDraft")}
                    </legend>
                    <GuideText
                      label={t("cgSceneName")}
                      value={scene.name}
                      change={(name) => change({ name })}
                    />
                    <GuideText
                      id={`guide-${scene.id}-arrival`}
                      label={t("cgWhatHappens")}
                      value={scene.arrival}
                      multiline
                      change={(arrival) => change({ arrival })}
                    />
                    <PlaceFields
                      id={`guide-${scene.id}-place`}
                      place={scene.place}
                      library={library}
                      change={(place) => change({ place })}
                    />
                  </fieldset>
                );
              })}
              <button
                type="button"
                onClick={() => edit({ later: [...draft.later, newGuideScene()] })}
              >
                {t("cgAddScene")}
              </button>
            </PlanSection>
          )}
          {show("secrets") && (
            <PlanSection
              title={t("cgSecrets")}
              question="future"
              focusQuestion={focusQuestion}
              keepOpen={() => reveal("secrets")}
            >
              <GuideText
                label={t("cgAuthorOnly")}
                value={draft.secrets}
                multiline
                change={(secrets) => edit({ secrets })}
              />
            </PlanSection>
          )}
          {additional.length > 0 && (
            <details className="guide-plan-section">
              <summary>{t("cgAddToPlan")}</summary>
              <div className="guide-buttons">
                {additional.map((section) => (
                  <button type="button" key={section} onClick={() => reveal(section)}>
                    {t(optionalSections[section])}
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
