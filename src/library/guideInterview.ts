import { z } from "zod";
import { AdventureGuideDraftSchema, type GuidePlanInput } from "./adventureGuidePlan";

const subjects = ["opening", "direction", "world", "future"] as const;
const text = z.string().default("");
const material = z.object({ name: text, note: text, existingId: z.string().optional() });
const place = z.object({
  name: text,
  realmId: z.string().optional(),
  placeId: z.string().optional(),
  nodeId: z.string().optional(),
  cardId: z.string().optional(),
});
const scene = z.object({ id: z.string(), name: text, place, arrival: text });
const choice = z.object({
  id: z.string(),
  label: text,
  outcome: text,
  context: z.enum(["free", "help"]).default("free"),
  targetSceneId: text,
});
const questions = [
  "idea",
  "direction",
  "role",
  "place",
  "arrival",
  "action",
  "outcome",
  "world",
  "future",
] as const;

export const GuideInterviewSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  language: z.enum(["en", "sv", "nb"]).default("sv"),
  premise: text,
  title: text,
  intention: text,
  role: material,
  opening: scene,
  choices: z.array(choice).default([]),
  world: material,
  people: z.array(material).default([]),
  factions: z.array(material).default([]),
  items: z.array(material).default([]),
  later: z.array(scene).default([]),
  secrets: text,
  subject: z.enum(subjects).nullable(),
  question: z.enum(questions).nullable(),
  deferred: z.array(z.string()).default([]),
  appliedCampaignId: z.string().optional(),
});
export type GuideInterview = z.infer<typeof GuideInterviewSchema>;
export type GuideSubject = (typeof subjects)[number];
export type GuideQuestion = (typeof questions)[number];
export type InterviewPlace = z.infer<typeof place>;
export type InterviewScene = z.infer<typeof scene>;
export type InterviewMaterial = z.infer<typeof material>;

export function newGuideInterview(language: GuideInterview["language"] = "sv"): GuideInterview {
  return GuideInterviewSchema.parse({
    id: crypto.randomUUID(),
    revision: 1,
    language,
    role: {},
    world: {},
    opening: { id: "opening", place: {} },
    subject: null,
    question: "idea",
  });
}

export function newGuideScene(): InterviewScene {
  return scene.parse({ id: `scene-${crypto.randomUUID()}`, place: {} });
}

export function newGuideChoice() {
  return choice.parse({ id: `choice-${crypto.randomUUID()}` });
}

export const subjectNames = {
  direction: "cgSubjectDirection",
  opening: "cgSubjectOpening",
  world: "cgSubjectWorld",
  future: "cgSubjectFuture",
} as const;

export const questionNames = {
  idea: "cgQIdea",
  direction: "cgQDirection",
  role: "cgQRole",
  place: "cgQPlace",
  arrival: "cgQArrival",
  action: "cgQAction",
  outcome: "cgQOutcome",
  world: "cgQWorld",
  future: "cgQFuture",
} as const;

export function outstandingQuestions(
  draft: GuideInterview,
  subject: GuideSubject,
): GuideQuestion[] {
  if (subject === "direction") return draft.intention.trim() ? [] : ["direction"];
  if (subject === "world") return ["world"];
  if (subject === "future")
    return draft.later.some((scene) => scene.arrival.trim()) ? [] : ["future"];
  return [
    !draft.role.name.trim() && "role",
    !draft.opening.place.name.trim() && "place",
    !draft.opening.arrival.trim() && "arrival",
    !draft.choices.some((choice) => choice.label.trim()) && "action",
    draft.choices.some((choice) => choice.label.trim() && !choice.outcome.trim()) && "outcome",
  ].filter((question): question is GuideQuestion => Boolean(question));
}

export function nextGuideQuestion(
  draft: GuideInterview,
  subject: GuideSubject,
  current?: GuideQuestion | null,
): GuideQuestion | null {
  return (
    outstandingQuestions(draft, subject).find(
      (question) => question !== current && !draft.deferred.includes(question),
    ) ?? null
  );
}

export const guideIdeas = ["cgIdeaConcert", "cgIdeaGuest", "cgIdeaNeighbors"] as const;

export function outcomeSuggestions(context: "free" | "help") {
  return context === "help"
    ? (["cgOutcomeAgree", "cgOutcomeExchange", "cgOutcomeReferral"] as const)
    : (["cgOutcomeLearn", "cgOutcomeChange", "cgOutcomeOpportunity"] as const);
}

export type GuideDestinationRepair = { sceneId: string; field: "place" | "arrival" };

const planDefaults = {
  en: {
    name: "New adventure",
    world: "Adventure world",
    later: "Later scene",
    continue: "Continue to",
  },
  sv: {
    name: "Nytt äventyr",
    world: "Äventyrets värld",
    later: "Senare scen",
    continue: "Fortsätt till",
  },
  nb: {
    name: "Nytt eventyr",
    world: "Eventyrets verden",
    later: "Senere scene",
    continue: "Fortsett til",
  },
};

/** Compile the edited interview into the same validated input used by the G1 examples. */
export function guideApprovalDraft(draft: GuideInterview) {
  const openingQuestion = outstandingQuestions(draft, "opening")[0];
  if (!draft.premise.trim() || openingQuestion)
    return {
      ok: false as const,
      question: openingQuestion ?? "idea",
      message: "Öppningen behöver ett svar till.",
      copy: "cgMissingAnswer" as const,
    };

  const { opening, later } = draft;
  const defaults = planDefaults[draft.language];
  for (const choice of draft.choices) {
    if (!choice.targetSceneId) continue;
    if (!choice.label.trim())
      return {
        ok: false as const,
        question: "action" as const,
        message:
          "Ett val med resmål behöver en handling. Fyll i handlingen eller ta bort kopplingen i spelplanen.",
        copy: "cgTargetNeedsAction" as const,
      };
    const destination = later.find(({ id }) => id === choice.targetSceneId);
    if (!destination)
      return {
        ok: false as const,
        question: "future" as const,
        message: `Resmålet för ”${choice.label}” finns inte kvar. Välj ett nytt resmål eller ta bort kopplingen.`,
        copy: "cgTargetGone" as const,
        values: { action: choice.label },
      };
    const field = !destination.place.name.trim()
      ? "place"
      : !destination.arrival.trim()
        ? "arrival"
        : undefined;
    if (field)
      return {
        ok: false as const,
        question: "future" as const,
        repair: { sceneId: destination.id, field } satisfies GuideDestinationRepair,
        copy:
          field === "place"
            ? ("cgTargetPlaceMissing" as const)
            : ("cgTargetArrivalMissing" as const),
        values: { scene: destination.name.trim(), action: choice.label },
        message: `Resmålet ”${destination.name.trim() || "Senare scen"}” för ”${choice.label}” saknar ${field === "place" ? "plats" : "ankomsttext"}. Fyll i fältet eller ta bort kopplingen.`,
      };
  }
  const actions = draft.choices.filter(({ label }) => label.trim());
  const playable = [
    opening,
    ...later.filter(
      ({ id, place, arrival }) =>
        place.name.trim() &&
        arrival.trim() &&
        actions.some(({ targetSceneId }) => targetSceneId === id),
    ),
  ];
  const future = later.filter((scene) => !playable.includes(scene) && scene.arrival.trim());
  const placeKey = (scene: InterviewScene) => scene.place.nodeId ?? scene.place.placeId ?? scene.id;
  const places = new Map<string, InterviewPlace & { id: string }>();
  for (const scene of [opening, ...later].filter(({ place }) => place.name.trim())) {
    const key = placeKey(scene);
    if (!places.has(key)) places.set(key, { ...scene.place, id: `place-${scene.id}` });
  }
  const chosenPlaces = [...places.values()];
  const realmId = draft.world.existingId ?? chosenPlaces.find(({ realmId }) => realmId)?.realmId;
  const mapped = chosenPlaces.some(({ nodeId }) => nodeId);
  if (
    chosenPlaces.some((place) => place.realmId && place.realmId !== realmId) ||
    (mapped && chosenPlaces.some(({ nodeId }) => !nodeId))
  ) {
    return {
      ok: false as const,
      question: "place" as const,
      copy: "cgWorldMismatch" as const,
      message:
        "Välj alla spelbara platser i samma värld. När du använder en karta behöver varje spelbar plats en kartnod.",
    };
  }
  const links: GuidePlanInput["links"] = actions.flatMap((action) => {
    const destination = playable.find(({ id }) => id === action.targetSceneId);
    return destination
      ? [
          {
            id: `way-${action.id}`,
            fromSceneId: opening.id,
            toSceneId: destination.id,
            label: `${defaults.continue} ${destination.name.trim() || destination.place.name}`,
            requiresFlags: [action.id],
          },
        ]
      : [];
  });
  const plan: GuidePlanInput = {
    title:
      draft.title.trim() ||
      draft.premise
        .trim()
        .split(/[.!?\n]/)[0]!
        .slice(0, 80) ||
      defaults.name,
    playerName: draft.role.name,
    playerCharacterId: draft.role.existingId,
    playerIntro: opening.arrival,
    startSceneId: opening.id,
    world: {
      name: draft.world.name.trim() || defaults.world,
      note: draft.world.note,
      characters: draft.people
        .filter(({ name }) => name.trim())
        .map((person, index) => ({ ...person, id: `person-${index}` })),
      factions: draft.factions
        .filter(({ name }) => name.trim())
        .map((group, index) => ({ ...group, id: `group-${index}` })),
    },
    items: draft.items
      .filter(({ name }) => name.trim())
      .map((item, index) => ({
        id: `item-${index}`,
        name: item.name,
        description: item.note,
        existingId: item.existingId,
      })),
    places: chosenPlaces.map(({ id, name }, index) => ({
      id,
      name,
      position: { x: 15 + (index % 5) * 17, y: 20 + (Math.floor(index / 5) % 4) * 20 },
    })),
    scenes: [
      ...playable.map((scene) => ({
        kind: "playable" as const,
        id: scene.id,
        name: scene.name.trim() || scene.place.name,
        placeId: places.get(placeKey(scene))!.id,
        arrival: scene.arrival,
        actions:
          scene === opening
            ? actions.map((action) => ({
                id: action.id,
                label: action.label,
                outcome: action.outcome,
                setsFlags: [action.id],
              }))
            : [],
      })),
      ...future.map((scene) => ({
        kind: "draft" as const,
        id: scene.id,
        name: scene.name.trim() || defaults.later,
        note: scene.arrival,
      })),
    ],
    links,
  };
  const parsed = AdventureGuideDraftSchema.safeParse({
    id: `${draft.id}:${draft.revision}`,
    revision: draft.revision,
    answers: { premise: draft.premise, authorNote: draft.secrets },
    plan,
    map: !realmId
      ? { kind: "new" }
      : mapped
        ? {
            kind: "existing",
            realmId,
            sites: Object.fromEntries(
              chosenPlaces.map(({ id, nodeId, placeId, cardId }) => [
                id,
                {
                  nodeId,
                  placeId: placeId ?? nodeId,
                  placeCardId: cardId,
                },
              ]),
            ),
          }
        : {
            kind: "places",
            realmId,
            sites: Object.fromEntries(
              chosenPlaces.flatMap(({ id, placeId }) => (placeId ? [[id, placeId]] : [])),
            ),
          },
  });
  return parsed.success
    ? { ok: true as const, draft: parsed.data }
    : {
        ok: false as const,
        question: "place" as const,
        message: parsed.error.issues[0]?.message ?? "Kontrollera spelplanen.",
      };
}
