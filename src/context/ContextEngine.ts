import { describePhysicalState } from "../state/physicalContinuity";
import type { ChatMessage } from "@llm/types";
import {
  ConversationTurnSchema,
  type CharacterPronoun,
  type ConversationTurn,
  type Session
} from "@state/StateSchema";
import { createSnapshot, type StateSnapshot } from "@state/StateVersioning";
import { applyBudget, DEFAULT_BUDGET, type AssembledBudget, type BudgetConfig } from "./ContextBudgetManager";
import { PRIORITY, type ContextBlock } from "./ContextBlock";
import {
  applyInstructionSafety,
  buildInstructionHierarchyPreamble,
  type InjectionScanResult
} from "./InstructionHierarchy";
import { buildLayerBlocks } from "@layers/LayerEngine";
import { buildMemoryBlocks } from "@memory/MemoryEngine";
import { getHighestCondensedTurnEnd } from "@memory/condensationMarker";
import { formatPass1UserContent } from "./PlayerAgency";
import { callName } from "@library/personName";
import type { FavorCheck } from "@state/favorCheck";
import { namedRoomsInCanon } from "@state/WorldCanon";
import { isBarishPlace, sideRoomStage } from "@state/playerDestination";
import { isUndressedClothing } from "@state/clothing";
import { maskUnheardGivenNames, narrationCallName, nameHeardInConversation } from "@state/nameHeard";
import { herePrompt, type PlaceIntro } from "@state/placeIntro";
import { pronounForms } from "@state/pronouns";
import { liveTraitBody, liveTraitLine, traitVoice, desireBandFromStats, type TraitBand } from "@state/traitBands";

export type Pass1Meters = {
  trust?: number;
  familiarity?: number;
  tension?: number;
  /** Band of the rule-set field marked as the closeness/desire signal. Missing = none marked. */
  desireBand?: TraitBand;
  stats?: { id: string; label: string; value: string | number; meaning?: string }[];
};

/**
 * Context Engine — Master Spec §10-11.
 * Assembles the dynamic context sent to the LLM for a turn: current
 * state, recent conversation, and (in later phases) active layers and
 * retrieved memory. Delegates budget enforcement to ContextBudgetManager
 * and takes the pre-turn state snapshot (§29) at assembly time, since
 * that's precisely the moment "the state as the LLM will see it" is
 * fixed.
 */

// Conversation turns are stored as z.unknown() in the canonical schema
// (conversation history's shape is intentionally loose at rest, so old
// or malformed entries don't block loading the rest of the session).
// ContextEngine parses against the same ConversationTurnSchema that
// StateEngine.appendConversationTurn writes, and skips entries that
// don't match rather than failing the whole assembly.
export { ConversationTurnSchema };
export type { ConversationTurn };

export interface AssembleOptions {
  budget?: BudgetConfig;
  /** Blocks contributed by other callers beyond the standard Layer/Memory Engine wiring below. */
  extraBlocks?: ContextBlock[];
  /** Cap on how many most-recent conversation turns are even considered before budgeting. */
  maxConversationTurns?: number;
  /** Cap on how many top-ranked memories are considered before budgeting. Default 5. */
  maxMemories?: number;
  /** Walking back to the venue, or a night/time-skip, this turn. */
  continuation?: boolean;
}

export interface AssembledContext extends AssembledBudget {
  snapshot: StateSnapshot;
  /** Conversation turns present in the session but not parseable as a ConversationTurn; not fatal, just excluded. */
  skippedConversationEntries: number;
  /** Heuristic prompt-injection signals found in untrusted blocks (§23) — informational, for diagnostics/Inspector Mode, not a filter. */
  injectionFindings: InjectionScanResult[];
}

function attributeDef(session: Session, attributeId: string) {
  return session.ruleset?.attributes.find((def) => def.id === attributeId);
}

function attributeLabel(session: Session, attributeId: string): string {
  return attributeDef(session, attributeId)?.name ?? attributeId;
}

function traitMeaningLines(session: Session): string[] {
  const lines: string[] = [];
  for (const [id, character] of Object.entries(session.characters)) {
    if (!character.stats) continue;
    const who = narrationCallName(session, id);
    for (const [statId, field] of Object.entries(character.stats)) {
      const def = attributeDef(session, statId);
      if (!def) continue;
      const line = liveTraitLine(who, def, field.value, traitVoice({ char: who, pronoun: character.pronoun }));
      if (line) lines.push(line);
    }
  }
  return lines;
}

function physicalContinuityLines(session: Session): string[] {
  const facts = describePhysicalState(session.physical, 30);
  if (!facts.length) return [];
  return [
    "Physical continuity: these facts persist until an explicit transition changes them.",
    "Do not silently reverse facing, break contact, move objects or release restraints.",
    "A movement attempt is not automatically a successful change.",
    "An exclusive occupied body part cannot perform another exclusive grip or weapon hold until released. Other free limbs remain usable; never assume humanoid anatomy.",
    ...facts.map((fact) => `- ${fact}`)
  ];
}

function buildStateSummaryBlock(session: Session): ContextBlock {
  const stage = sideRoomStage(session);
  const characterLines = Object.entries(session.characters).map(([id, character]) => {
    const livePosition =
      stage && isBarishPlace(character.position.value) ? stage : character.position.value;
    const parts = [`position: ${livePosition}`, `mood: ${character.mood.value}`];
    if (character.name?.trim()) {
      const given = callName(character.name, character.familyName, character.middleName);
      const heard = nameHeardInConversation(session, given);
      parts.unshift(heard ? `called ${given}` : `given name ${given} (unheard)`);
      const middle = character.middleName?.trim();
      const family = character.familyName?.trim();
      if (middle) parts.splice(1, 0, `middle ${middle}`);
      if (family) parts.splice(middle ? 2 : 1, 0, `surname ${family}`);
    }
    if (character.pronoun) parts.push(`pronoun: ${character.pronoun}`);
    if (typeof character.approximateAge === "number") parts.push(`age: about ${character.approximateAge}`);
    if (character.appearance?.trim()) parts.push(`looks: ${character.appearance.trim()}`);
    if (character.clothing?.value.trim()) parts.push(`wearing: ${character.clothing.value.trim()}`);
    if (character.holding?.value.trim()) parts.push(`holding: ${character.holding.value.trim()}`);
    if (character.pose?.value.trim()) {
      const pose = character.pose.value;
      if (!(stage && isBarishPlace(pose))) {
        parts.push(`pose: ${pose}`);
      }
    }
    if (character.energy) parts.push(`energy: ${character.energy.value}`);
    if (character.stats) {
      for (const [statId, field] of Object.entries(character.stats)) {
        parts.push(`${attributeLabel(session, statId)}: ${field.value}`);
      }
    }
    const bond = session.relationships[id];
    if (bond) {
      parts.push(`trust: ${bond.trust.value}`, `familiarity: ${bond.familiarity.value}`, `tension: ${bond.tension.value}`);
    }
    return `- ${id}: ${parts.join(", ")}`;
  });

  const sceneParts = [
    ...physicalContinuityLines(session),
    session.scene
      ? stage
        ? "This beat is not in the public bar."
        : `Scene: ${session.scene.location}${session.scene.realm ? ` in ${session.scene.realm}` : ""}`
      : "Scene: (unset)"
  ];
  const env = session.scene?.environment;
  if (env && !stage) {
    const envBits: string[] = [];
    if (env.lighting) envBits.push(`lighting: ${env.lighting}`);
    if (env.noise) envBits.push(`noise: ${env.noise}`);
    if (env.music !== undefined) envBits.push(`music: ${env.music ? "yes" : "no"}`);
    if (envBits.length > 0) sceneParts.push(`Environment: ${envBits.join(", ")}`);
  }
  if (session.ruleset) {
    const names = session.ruleset.attributes.map((def) => def.name).join(", ");
    sceneParts.push(`Rule-set: ${session.ruleset.name}${names ? ` (${names})` : ""}`);
  }
  if (session.player) {
    const you = session.player;
    const youBits = [
      you.name?.trim() ? `called ${you.name.trim()}` : null,
      you.pronoun ? `pronoun: ${you.pronoun}` : null,
      you.appearance?.trim() ? `looks: ${you.appearance.trim()}` : null,
      you.personality?.trim() ? `who they are: ${you.personality.trim()}` : null,
      `position: ${you.position.value}`,
      `status: ${you.status.value}`
    ].filter(Boolean);
    if (you.stats) {
      for (const [statId, value] of Object.entries(you.stats)) {
        if (!value.trim()) continue;
        youBits.push(`${attributeLabel(session, statId)}: ${value.trim()}`);
      }
    }
    sceneParts.push(maskUnheardGivenNames(session, `Player: ${youBits.join(", ")}`));
  }
  if (stage) {
    sceneParts.push(
      maskUnheardGivenNames(
        session,
        `Current room: ${stage}. Write only ${stage}. Do not mention the public bar, "behind the bar", or the venue name.`
      )
    );
  }
  const intro = herePrompt(session);
  if (intro) {
    sceneParts.push(
      maskUnheardGivenNames(session, `Here — ${intro.title}: ${intro.body}`)
    );
  }
  const arrivedWhy = (session.handoff ?? "").trim();
  if (arrivedWhy) {
    sceneParts.push(
      maskUnheardGivenNames(
        session,
        `Why they are here (fact — the agreement from the last scene, not a new meeting). Honor it. Do not invent a different reason, including sex if they asked for sleep or comfort: ${arrivedWhy}`
      )
    );
  }
  const realmFact = (session.scene?.realmBrief ?? session.scene?.realmNote ?? "").trim();
  if (realmFact && session.scene?.realm) {
    sceneParts.push(
      maskUnheardGivenNames(session, `Realm — ${session.scene.realm}: ${realmFact}`)
    );
  }
  const rooms = namedRoomsInCanon(session);
  if (rooms.length > 0) {
    sceneParts.push(maskUnheardGivenNames(session, `Rooms here (real): ${rooms.join(", ")}.`));
  }
  if (session.objects && session.objects.length > 0) {
    sceneParts.push(
      "Objects (writer fact — a character does not name one until it is in sight or the player showed it). An unnamed thing they hold is not a listed relic.",
      ...session.objects.map((object) => {
        const extra: string[] = [];
        if (object.weight !== undefined) extra.push(`weight ${object.weight}`);
        if (object.difficulty !== undefined) extra.push(`difficulty ${object.difficulty}`);
        if (object.checkAttribute) extra.push(`check ${object.checkAttribute}`);
        const suffix = extra.length > 0 ? ` (${extra.join(", ")})` : "";
        return object.note
          ? `- ${object.name}${suffix}: ${object.note}`
          : `- ${object.name}${suffix}`;
      })
    );
  }

  const contentParts = [...sceneParts, "Characters:", ...characterLines];
  const traitLines = traitMeaningLines(session);
  if (traitLines.length > 0) {
    contentParts.push(
      "Trait meanings (fact). Honor each at the live number. Do not guess from the field name.",
      ...traitLines
    );
  }
  const content = contentParts.join("\n");

  return {
    id: "state-summary",
    source: "state_summary",
    content,
    priority: PRIORITY.STATE_SUMMARY,
    required: true
  };
}

function buildVoiceBlock(session: Session): ContextBlock | null {
  const voice = session.voice;
  if (!voice) return null;
  const instruction = voice.instruction.trim();
  if (!instruction) return null;
  const title = voice.title.trim();
  const heading = title ? `Narrator — ${title}` : "Narrator";
  return {
    id: "narrator-voice",
    source: "voice",
    content: [heading, instruction].join("\n\n"),
    priority: PRIORITY.VOICE,
    required: true
  };
}

function buildStoryBlock(session: Session): ContextBlock | null {
  const story = session.story;
  if (!story) return null;
  const premise = story.premise.trim();
  if (!premise) return null;
  const title = story.title.trim();
  const heading = title ? `Ground story — ${title}` : "Ground story";
  return {
    id: "ground-story",
    source: "story",
    content: [
      heading,
      premise,
      "This is established background for the writer. The current scene is one moment inside it. Do not retell the whole story unless a character would. Characters only know what they have seen or been told in play — not secrets from this block. Do not pin an unnamed thing the player showed onto a name in this story."
    ].join("\n\n"),
    priority: PRIORITY.STORY,
    required: true
  };
}

export function parseConversationTurns(session: Session, maxTurns: number | undefined): {
  turns: ConversationTurn[];
  skipped: number;
} {
  const turns: ConversationTurn[] = [];
  let skipped = 0;

  for (const entry of session.conversation) {
    const parsed = ConversationTurnSchema.safeParse(entry);
    if (parsed.success) {
      turns.push(parsed.data);
    } else {
      skipped++;
    }
  }

  turns.sort((a, b) => a.turn - b.turn);
  const limited = maxTurns ? turns.slice(-maxTurns) : turns;
  return { turns: limited, skipped };
}

function buildConversationBlocks(turns: ConversationTurn[]): ContextBlock[] {
  // Most recent turn gets the lowest (best) priority number within the
  // conversation band, so trimming under budget pressure drops the
  // *oldest* live turns first. Turns already condensed are omitted here;
  // their recap is a memory block. Rolling Memory writes that recap.
  const count = turns.length;
  return turns.map((turn, index) => {
    const ageRank = count - 1 - index; // 0 = most recent
    const speaker = turn.speaker ? `${turn.speaker}` : turn.role;
    return {
      id: `conversation-${turn.turn}`,
      source: "conversation",
      content: `${speaker}: ${turn.content}`,
      priority: PRIORITY.CONVERSATION_RECENT + ageRank,
      required: false
    };
  });
}

export function assembleContext(session: Session, options: AssembleOptions = {}): AssembledContext {
  const preamble = buildInstructionHierarchyPreamble();
  const voiceBlock = buildVoiceBlock(session);
  const storyBlock = buildStoryBlock(session);
  const stateSummaryBlock = buildStateSummaryBlock(session);
  const { turns, skipped } = parseConversationTurns(session, options.maxConversationTurns);
  const condensedThrough = getHighestCondensedTurnEnd(session);
  const liveTurns = turns.filter((turn) => turn.turn > condensedThrough);
  const conversationBlocks = buildConversationBlocks(liveTurns);
  const layerBlocks = buildLayerBlocks(session, options.continuation ? { continuation: true } : {});
  const memoryBlocks = buildMemoryBlocks(session, session.stateVersion, options.maxMemories ?? 5);

  const closenessBlocks = closenessBlocksForSession(session);
  const rawBlocks: ContextBlock[] = [
    preamble,
    ...closenessBlocks,
    ...(voiceBlock ? [voiceBlock] : []),
    ...(storyBlock ? [storyBlock] : []),
    stateSummaryBlock,
    ...layerBlocks,
    ...memoryBlocks,
    ...conversationBlocks,
    ...(options.extraBlocks ?? [])
  ];

  // §23: scan and wrap every untrusted block (conversation, and later
  // memory/active_layer) BEFORE budgeting, so the wrapper delimiters are
  // part of what gets measured and never silently dropped by trimming.
  const { blocks: safeBlocks, findings } = applyInstructionSafety(rawBlocks);

  const budgetResult = applyBudget(safeBlocks, options.budget ?? DEFAULT_BUDGET);

  return {
    ...budgetResult,
    snapshot: createSnapshot(session),
    skippedConversationEntries: skipped,
    injectionFindings: findings
  };
}

/** Renders assembled blocks into a single prompt string, grouped by source, in priority order. */
export function renderContext(assembled: AssembledContext): string {
  const sorted = [...assembled.includedBlocks].sort((a, b) => a.priority - b.priority);
  return sorted.map((b) => b.content).join("\n\n");
}

/**
 * Pass 1 chat messages — Master Spec §4.1 / §10.
 *
 * Conversation history is sent as real user/assistant turns, not dumped
 * into the system prompt. RP models (Stheno and similar) treat a single
 * system blob as "start this scene from the character sheet," which
 * produces the same establishing shot every turn. Native chat roles make
 * prior beats look like a conversation to continue.
 *
 * The current player utterance is the final user message. It is stripped
 * from history if assembly already included it (SessionEngine appends
 * before assembling).
 */
function whereThisBeat(
  name: string,
  player?: {
    position?: string;
    characterPosition?: string;
    stageRoom?: string;
    venueName?: string;
    inParty?: boolean;
  }
): string | undefined {
  if (player?.stageRoom) {
    const venue = player.venueName?.trim();
    const forbidden = venue
      ? `"${venue}", the public floor, the counter`
      : `the public floor, the counter, the venue name`;
    const stayed = player.characterPosition?.trim();
    const sameRoom =
      !stayed || stayed.toLowerCase() === player.stageRoom.toLowerCase();
    const theirSpace = Boolean(name && player.stageRoom.toLowerCase().includes(name.toLowerCase()));
    if (player.inParty || sameRoom) {
      return `WHERE this beat: ${player.stageRoom}. Write ${player.stageRoom} only. They are already in ${player.stageRoom} — do not write arriving from the bar, the floor, or a staff door. Forbidden: ${forbidden}. Earlier replies that said the public floor are stale.`;
    }
    if (theirSpace && !sameRoom) {
      return `WHERE this beat: the player is in ${player.stageRoom}. ${name} is still in ${stayed}. ${name} is not in the party. Do not walk ${name} with the player. Do not write ${name} pushing off from the bar into this room unless live position is ${player.stageRoom}. Forbidden: ${forbidden}.`;
    }
    return `WHERE this beat: the player is in ${player.stageRoom}. ${name} is still in ${stayed}. ${name} is not in the party. Do not walk ${name} with the player. Forbidden: ${forbidden}.`;
  }
  if (player?.position && player.characterPosition) {
    if (!player.inParty && player.position.toLowerCase() !== player.characterPosition.toLowerCase()) {
      return `WHERE this beat: player is in ${player.position}; ${name} is in ${player.characterPosition}. ${name} is not in the party. Do not bring ${name} to the player's place. Do not mention a room they left unless ${name} is still there.`;
    }
    return `WHERE this beat: player is in ${player.position}; ${name} is in ${player.characterPosition}. One geography. Do not put anyone in two rooms at once. Do not mention a room they left.`;
  }
  return undefined;
}

function canonAndFavorLines(
  name: string,
  player?: { status?: string; position?: string; favor?: FavorCheck }
): string[] {
  const asleep = (player?.status ?? "").toLowerCase().includes("asleep");
  const invent =
    "Do not invent extra rooms or a hotel. Rooms listed in the state summary as existing here are facts.";
  if (asleep) {
    return [
      invent,
      `The player is asleep${player?.position ? ` (${player.position})` : ""}. Stay with that beat here. Do not invent another room.`
    ];
  }
  const lines = [invent];
  const favor = player?.favor;
  if (!favor) return lines;
  if (favor.granted) {
    lines.push(
      `Favor this turn: d100 ${favor.roll} vs trust ${favor.trust} — grant. Rooms and objects only. If the player asked to use a room or a thing, ${name} can agree when it stays in this scene — including leaving the floor or going to a named room. A grant does not create a new place.`
    );
  } else {
    lines.push(
      `Favor this turn: d100 ${favor.roll} vs trust ${favor.trust} — refuse. Rooms and objects only — if they asked to use a room or a thing, ${name} does not take them there this beat. Listed rooms are still here. Do not invent a hotel.`
    );
  }
  return lines;
}

export function isWarmBeat(meters?: Pass1Meters): boolean {
  if (!meters) return false;
  const trust = meters.trust;
  const band = meters.desireBand;
  const trustHigh = trust !== undefined && trust >= 70;
  const trustOk = trust === undefined || trust >= 50;
  if (band === undefined) return trustHigh;
  if (trustHigh && (band === "mid" || band === "high")) return true;
  if (band === "high" && trustOk) return true;
  return false;
}

/** Positive only — naming a refusal line here makes local models copy it. */
function warmthInstruction(name: string): string {
  return `${name} wants the player this beat. If they ask for a kiss, a hug, or to be held, write ${name} doing that now. Live meters outrank a reserved mood or "slow to open up".`;
}

export function closenessBeatBlock(name: string, meters?: Pass1Meters, characterId?: string): ContextBlock | null {
  if (!isWarmBeat(meters)) return null;
  return {
    id: characterId ? `closeness-this-beat-${characterId}` : "closeness-this-beat",
    source: "system_rule",
    content: warmthInstruction(name),
    priority: PRIORITY.CLOSENESS_BEAT,
    required: true
  };
}

export function metersFromSession(session: Session, characterId: string): Pass1Meters {
  const bond = session.relationships[characterId];
  const character = session.characters[characterId];
  const desireBand = desireBandFromStats(session.ruleset?.attributes, character?.stats);
  return {
    ...(bond?.trust.value !== undefined ? { trust: bond.trust.value } : {}),
    ...(bond?.familiarity.value !== undefined ? { familiarity: bond.familiarity.value } : {}),
    ...(bond?.tension.value !== undefined ? { tension: bond.tension.value } : {}),
    ...(desireBand ? { desireBand } : {}),
    ...(character?.stats
      ? {
          stats: Object.entries(character.stats).map(([id, field]) => {
            const def = attributeDef(session, id);
            const meaning = def
              ? liveTraitBody(
                  def,
                  field.value,
                  traitVoice({
                    char: narrationCallName(session, characterId),
                    pronoun: character.pronoun
                  })
                )
              : undefined;
            return {
              id,
              label: attributeLabel(session, id),
              value: field.value,
              ...(meaning ? { meaning } : {})
            };
          })
        }
      : {})
  };
}

function closenessBlocksForSession(session: Session): ContextBlock[] {
  return Object.keys(session.characters).flatMap((id) => {
    const meters = metersFromSession(session, id);
    const name = narrationCallName(session, id);
    const block = closenessBeatBlock(name, meters, id);
    return block ? [block] : [];
  });
}

function metersLine(meters?: Pass1Meters): string | undefined {
  if (!meters) return undefined;
  const bits: string[] = [];
  if (meters.trust !== undefined) bits.push(`trust ${meters.trust}`);
  if (meters.familiarity !== undefined) bits.push(`familiarity ${meters.familiarity}`);
  if (meters.tension !== undefined) bits.push(`tension ${meters.tension}`);
  for (const row of meters.stats ?? []) {
    bits.push(`${row.label} ${row.value}`);
  }
  if (bits.length === 0) return undefined;
  const meaningCue = meters.stats?.some((row) => row.meaning?.trim())
    ? " Honor the trait meanings in the state summary at these numbers. Do not guess from the field name."
    : "";
  return `Meters: ${bits.join(", ")}.${meaningCue}`;
}

function othersLine(
  name: string,
  others?: { name: string; position?: string }[]
): string | undefined {
  if (!others?.length) return undefined;
  const list = others
    .map((person) => (person.position?.trim() ? `${person.name} (${person.position.trim()})` : person.name))
    .join("; ");
  return `Also here: ${list}. They are in this scene. If the player sat with, looked at, or spoke to one of them, that person can take a spoken line this beat. Do not write the room as only ${name}.`;
}

function speechRule(
  name: string,
  warm: boolean,
  others?: { name: string; position?: string }[],
  outOfSight?: boolean
): string {
  if (outOfSight) {
    return `SPEECH: ${name} is not here. Do not write ${name}'s body, eyes, or quoted dialogue. If someone at the player's place speaks, they may have one quoted line. If the place is empty, narration only.`;
  }
  const spoken = warm ? `"Yes."` : `"I'm here."`;
  const beat = warm ? `${name} leans in. ${spoken}` : `${name} looks at you. ${spoken}`;
  const group = others?.length
    ? ` ${name} is the voice of this beat. Other people here may react in one line.`
    : "";
  return `SPEECH: ${name} talks.${group} If the player asked a question, this reply MUST contain quotation marks around spoken words. Wrong: a paragraph of empathy and no quotes. Right: ${beat}`;
}

function clothingHonorLines(clothing?: string, holding?: string, stageRoom?: string): string[] {
  const worn = clothing?.trim() ?? "";
  const held = holding?.trim() ?? "";
  const outfit =
    clothing === undefined
      ? "Clothing and what they hold are live state."
      : worn === ""
        ? "Live wearing is empty. Do not invent an outfit."
        : isUndressedClothing(worn)
          ? `Live wearing is ${worn}. No dress, no pockets this beat. Wrong: "the pocket of her dress". Right: bare skin, or live holding.`
          : `Live wearing is ${worn}. No other clothes. Do not invent pockets that outfit does not have.`;
  const hands =
    holding === undefined
      ? "If holding is not listed, their hands are empty."
      : held === ""
        ? "Live holding is empty. Hands empty. Do not invent a pocket."
        : `They are holding ${held}. That is where the thing is — not an invented pocket.`;
  const here = stageRoom?.trim();
  if (here) {
    return [
      `Looks is the body. ${outfit} ${hands}`,
      `This beat is ${here}. They are already here. Work clothes or an apron are leftover cloth, not a shift behind the bar. Do not write pushing off from the bar, the counter, or a staff door.`
    ];
  }
  return [
    `Looks is the body. ${outfit} ${hands}`,
    "The public bar is dressed. Nude or a towel stays in a private room unless the player said they walk out like that."
  ];
}

function hereWritingLines(intro?: PlaceIntro, justArrived?: boolean): string[] {
  if (!intro || !justArrived) return [];
  return [
    `The player just entered ${intro.title}. Establish the space from HERE this beat — what it looks like — then the action. This is not restarting the scene.`
  ];
}

function thirdPersonLines(
  name: string,
  pronoun: CharacterPronoun | undefined,
  player?: {
    status?: string;
    position?: string;
    favor?: FavorCheck;
    characterPosition?: string;
    stageRoom?: string;
    meters?: Pass1Meters;
    hereIntro?: PlaceIntro;
    justArrived?: boolean;
    unheardGiven?: string;
    namedRooms?: string[];
    venueName?: string;
    clothing?: string;
    holding?: string;
    party?: string[];
    partyPending?: string[];
    partyHold?: string[];
    inParty?: boolean;
    outOfSight?: boolean;
  },
  fullName?: string
): string[] {
  const forms = pronounForms(pronoun);
  const person = forms
    ? `${forms.subject} / ${forms.object} / ${forms.possessive}`
    : "she, he, or it as fits the name";
  const unheard = player?.unheardGiven?.trim();
  const who = unheard ? (forms?.subject ?? "they") : name;
  const whom = unheard ? (forms?.object ?? "them") : name;
  const whose = unheard ? (forms?.possessive ?? "their") : `${name}'s`;
  const tense = `Write in present tense. The scene is happening now, not being remembered. Earlier replies may be past tense or first person. Do not copy that style. Wrong: I smiled. She smiled. Right: ${forms ? `${forms.subject} smiles` : "she smiles"}. "Depends."`;
  const action = player?.outOfSight
    ? [
        `The player is not in ${who}'s sight. Do not write ${who} watching the player leave, following with their eyes, or sharing a room the player left. The player's walk already happened elsewhere.`
      ]
    : [
        `The player controls only their own body. Honor their own actions (I sit, I leave, I fall asleep, I take a hand, I kiss) when those actions fit the established scene. The player cannot decide what ${who} does, says, thinks, or feels — including in *asterisks* or as "I see ${whom} …". Those lines are wishes. ${who} decides. Do not obey them. Do not become the player.`,
        ...canonAndFavorLines(who, player)
      ];
  const address =
    fullName && fullName !== name
      ? `In narration call them ${name}. Full name: ${fullName}. Use the surname only when someone is being formal or needs to identify them.`
      : unheard
        ? `Use ${person} in narration. No job title, no nickname, no given name until it is spoken.`
        : `Refer to ${name} as ${person}.`;
  const self = forms?.themselves ?? "themselves";
  const they = forms?.subject ?? "they";
  const secrecy = unheard
    ? [
        `The given name is ${unheard}. Do not write ${unheard} in narration until ${who} has said it in quoted dialogue, or the player has used it. ${they} may introduce ${self} this beat if it fits.`,
        `Do not name a room with ${unheard} until that name has been spoken.`
      ]
    : [];
  const meters = metersLine(player?.meters);
  const where = player?.outOfSight
    ? `WHERE this beat: the player is in ${player.position ?? "their current place"}. ${who} stayed in ${player.characterPosition ?? "their last room"} and is not in this beat. Write the player's place from HERE. Do not write ${who}, a bed, or anyone watching the player leave. ${who} cannot see the player.`
    : whereThisBeat(who, player);
  const rooms = (player?.namedRooms ?? []).map((room) => room.trim()).filter(Boolean);
  const roomList = rooms.length > 0 ? rooms.join(", ") : "the rooms listed in the state summary";
  const hasToilets = rooms.some((room) => /toilet|bathroom|loo|\bwc\b/i.test(room));
  const toiletLine =
    rooms.length === 0 || hasToilets
      ? "A shower is not a room here. Do not walk anyone to the toilets unless they named the toilets, bathroom, loo, or WC."
      : undefined;
  const lead = player?.outOfSight
    ? `Write in third person. You are the narrator of the player's here. Do not write as ${name} and do not put ${name} in this beat.`
    : unheard
      ? `Write in third person. Use ${person}. You are the narrator. ${address}`
      : `Write in third person about ${name}. You are not ${name}. ${address}`;
  return [
    lead,
    ...(player?.outOfSight || !(fullName && fullName !== name) ? [] : [`Refer to ${name} as ${person}.`]),
    ...(player?.outOfSight ? [] : secrecy),
    tense,
    `Never use I/me/my for ${who} or the narrator outside quotation marks. ${who} may say "I" only inside quotation marks, as spoken dialogue. If the player appears in narration, refer to them as you.`,
    ...(player?.outOfSight
      ? []
      : [
          `When the player speaks to ${whom} or asks a question, ${who} answers in quoted dialogue this beat. Narration is a short frame around the line. Do not answer with description only.`
        ]),
    ...(player?.outOfSight ? [] : clothingHonorLines(player?.clothing, player?.holding, player?.stageRoom)),
    ...(player?.outOfSight
      ? []
      : [
          `${who} knows what the player has said or shown, and what is in plain sight. Ground story and the object list are for you, the writer. Heard is not history. Do not invent family or jobs among people the player mentioned.`,
          `A thing they show is only the words they used. Do not give it a famous owner or a hidden history unless the object list says so, or they already said it. Wrong: a small brooch → "That's Elrond's brooch." Right: she looks at the brooch they showed.`
        ]),
    ...(player?.outOfSight
      ? []
      : [
          `Rooms listed as real exist for you, the writer. If the player asks for a room or a place to stay, answer from that list (${roomList}), not a hotel or a street. Do not claim a listed room is not here. ${who} may offer one; ${who} does not have to walk them there this beat.`
        ]),
    ...(player?.outOfSight
      ? []
      : player?.inParty
        ? [
            `If you both leave together this beat, stay in the same named room. Do not send the player to one listed room and ${whom} to another in one beat.`
          ]
        : [
            `The player leaving a room, the floor, or a landmark does not take ${who} along. ${who} stays at live position. Do not walk ${who} into the city or the next place unless the player accepted ${who} into the party.`
          ]),
    ...(player?.party && player.party.length > 0
      ? [
          `With the player this beat (engine): ${player.party.join(", ")}. Keep them with the player when the player moves. Do not leave them in the last room.`
        ]
      : []),
    ...(player?.partyHold && player.partyHold.length > 0
      ? [
          `Staying put (still in the party): ${player.partyHold.join(", ")}. They keep their live position. Do not walk them with the player until Come.`
        ]
      : []),
    ...(player?.partyPending && player.partyPending.length > 0
      ? [
          `Asked to join later (not traveling): ${player.partyPending.join(", ")}. They stay where they are. The player can recruit them only when they are in the same place, and only if a party slot is free.`
        ]
      : []),
    ...(toiletLine && !player?.outOfSight ? [toiletLine] : []),
    ...(player?.outOfSight
      ? []
      : [
          `Live position and pose are where ${who} is at the start of this beat. ${who} can leave the floor or go to a named room this beat. That does not put the player on staff duty and does not erase who ${who} is.`
        ]),
    ...(where ? [where] : []),
    ...(player?.outOfSight ? [] : hereWritingLines(player?.hereIntro, player?.justArrived)),
    ...action,
    ...(meters ? [meters] : []),
    `One beat, not a chapter. At most 500 characters. One motion and one spoken line, then a period. Stop. Do not start a sentence you cannot finish. A shorter finished beat is better than a longer cut one. Stay in this motion. Do not write the next step. Do not write the player's body, breath, arousal, or orgasm. That is their body. Honor it only if they wrote it this beat. Write ${whose} body, not yours. If the player falls asleep: one quiet close in this room. Output only the scene beat.`
  ];
}

export function buildPass1WritingInstructions(
  characterId: string,
  options: {
    narrator?: boolean;
    characterName?: string;
    fullName?: string;
    pronoun?: CharacterPronoun;
    playerStatus?: string;
    playerPosition?: string;
    characterPosition?: string;
    stageRoom?: string;
    favor?: FavorCheck;
    meters?: Pass1Meters;
    hereIntro?: PlaceIntro;
    justArrived?: boolean;
    unheardGiven?: string;
    continuation?: boolean;
    plotBeat?: boolean;
    others?: { name: string; position?: string }[];
    clothing?: string;
    holding?: string;
    namedRooms?: string[];
    venueName?: string;
    sceneHandoff?: boolean;
    playerCalled?: string;
    regenNote?: string;
    party?: string[];
    partyPending?: string[];
    partyHold?: string[];
    inParty?: boolean;
    outOfSight?: boolean;
  } = {}
): string {
  const name = options.characterName?.trim() || characterId;
  const unheard = options.unheardGiven?.trim();
  const fullName = unheard ? undefined : options.fullName?.trim();
  const others = options.others;
  const outOfSight = Boolean(options.outOfSight);
  const thirdPerson = thirdPersonLines(
    name,
    options.pronoun,
    {
      ...(options.playerStatus ? { status: options.playerStatus } : {}),
      ...(options.playerPosition ? { position: options.playerPosition } : {}),
      ...(options.characterPosition ? { characterPosition: options.characterPosition } : {}),
      ...(options.stageRoom ? { stageRoom: options.stageRoom } : {}),
      ...(options.favor ? { favor: options.favor } : {}),
      ...(options.meters ? { meters: options.meters } : {}),
      ...(options.hereIntro ? { hereIntro: options.hereIntro } : {}),
      ...(options.justArrived ? { justArrived: true } : {}),
      ...(unheard ? { unheardGiven: unheard } : {}),
      ...(options.namedRooms ? { namedRooms: options.namedRooms } : {}),
      ...(options.venueName ? { venueName: options.venueName } : {}),
      ...(options.clothing !== undefined ? { clothing: options.clothing } : {}),
      ...(options.holding !== undefined ? { holding: options.holding } : {}),
      ...(options.party && options.party.length > 0 ? { party: options.party } : {}),
      ...(options.partyPending && options.partyPending.length > 0
        ? { partyPending: options.partyPending }
        : {}),
      ...(options.partyHold && options.partyHold.length > 0 ? { partyHold: options.partyHold } : {}),
      ...(options.inParty ? { inParty: true } : {}),
      ...(outOfSight ? { outOfSight: true } : {})
    },
    fullName && fullName !== name ? fullName : undefined
  );

  const warm = isWarmBeat(options.meters);
  const arrived = Boolean(options.justArrived) || outOfSight;
  const afterNight = Boolean(options.continuation);
  const plotBeat = Boolean(options.plotBeat);
  const followScene = outOfSight
    ? "The player has left the last room. Write where they are now. Do not stay in the old bedroom or bar."
    : plotBeat
      ? "An authored beat is happening this turn. Write that beat now. One beat: they arrive and speak. A fight may start. Do not skip to leaving the city or a new town this beat. Do not greet them as a new customer."
      : afterNight
        ? "This is the next beat of the same scene after a night or a return to the floor. Write who is here and what they hold. Do not greet them as a new customer. Do not invent a new crisis. If a fight or visitors already started this visit, follow that — do not reset the floor to empty."
        : "A player time-skip or sleep in the established scene is not a restart — follow it without inventing a new place.";
  const honorHandoff = options.sceneHandoff
    ? "Honor WHY THEY ARE HERE. That is the agreement from the last scene. Do not start a different encounter. If they asked for sleep or comfort, do not start sex."
    : "";
  const playerCalled = options.playerCalled?.trim()
    ? `The player is called ${options.playerCalled.trim()}. Use that name. Honor their looks in Player. Do not invent a different body.`
    : "";
  const regenNote = options.regenNote?.trim()
    ? `This is a regeneration of the last beat. Honor this player note (writing instruction, not a new spoken line): ${options.regenNote.trim()}`
    : "";

  if (options.narrator) {
    return [
      speechRule(name, warm, others, outOfSight),
      othersLine(name, others),
      "Follow the narrator instruction above.",
      "Write the next beat of this ongoing scene. Answer the player's latest message.",
      regenNote,
      ...thirdPerson,
      arrived
        ? "A player walking into a named room is not a restart — establish that room from HERE."
        : "Do not restart from the opening.",
      followScene,
      honorHandoff,
      playerCalled,
      "Do not prefix the reply with a speaker label."
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }
  return [
    speechRule(name, warm, others, outOfSight),
    othersLine(name, others),
    `Write the next beat of this ongoing scene. Answer the player's latest message.`,
    regenNote,
    ...thirdPerson,
    arrived
      ? "A player walking into a named room is not a restart — establish that room from HERE."
      : "Do not restart from the opening.",
    followScene,
    honorHandoff,
    playerCalled,
    `Do not prefix the reply with "${name}:" or any speaker label.`
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildPass1Messages(
  assembled: AssembledContext,
  allTurns: ConversationTurn[],
  currentPlayerMessage: string,
  characterId: string,
  options: {
    characterName?: string;
    fullName?: string;
    pronoun?: CharacterPronoun;
    playerStatus?: string;
    playerPosition?: string;
    characterPosition?: string;
    stageRoom?: string;
    favor?: FavorCheck;
    meters?: Pass1Meters;
    characterNames?: string[];
    hereIntro?: PlaceIntro;
    justArrived?: boolean;
    unheardGiven?: string;
    continuation?: boolean;
    plotBeat?: boolean;
    others?: { name: string; position?: string }[];
    clothing?: string;
    holding?: string;
    namedRooms?: string[];
    venueName?: string;
    sceneHandoff?: boolean;
    playerCalled?: string;
    regenNote?: string;
    party?: string[];
    partyPending?: string[];
    partyHold?: string[];
    inParty?: boolean;
    outOfSight?: boolean;
  } = {}
): ChatMessage[] {
  const systemBlocks = assembled.includedBlocks
    .filter((block) => block.source !== "conversation")
    .sort((a, b) => a.priority - b.priority);

  const systemContent = [
    ...systemBlocks.map((block) => block.content),
    buildPass1WritingInstructions(characterId, {
      narrator: assembled.includedBlocks.some((block) => block.source === "voice"),
      ...(options.characterName ? { characterName: options.characterName } : {}),
      ...(options.fullName ? { fullName: options.fullName } : {}),
      ...(options.unheardGiven ? { unheardGiven: options.unheardGiven } : {}),
      ...(options.pronoun ? { pronoun: options.pronoun } : {}),
      ...(options.playerStatus ? { playerStatus: options.playerStatus } : {}),
      ...(options.playerPosition ? { playerPosition: options.playerPosition } : {}),
      ...(options.characterPosition ? { characterPosition: options.characterPosition } : {}),
      ...(options.stageRoom ? { stageRoom: options.stageRoom } : {}),
      ...(options.favor ? { favor: options.favor } : {}),
      ...(options.meters ? { meters: options.meters } : {}),
      ...(options.hereIntro ? { hereIntro: options.hereIntro } : {}),
      ...(options.justArrived ? { justArrived: true } : {}),
      ...(options.continuation ? { continuation: true } : {}),
      ...(options.plotBeat ? { plotBeat: true } : {}),
      ...(options.others && options.others.length > 0 ? { others: options.others } : {}),
      ...(options.clothing !== undefined ? { clothing: options.clothing } : {}),
      ...(options.holding !== undefined ? { holding: options.holding } : {}),
      ...(options.namedRooms && options.namedRooms.length > 0 ? { namedRooms: options.namedRooms } : {}),
      ...(options.venueName ? { venueName: options.venueName } : {}),
      ...(options.sceneHandoff ? { sceneHandoff: true } : {}),
      ...(options.playerCalled ? { playerCalled: options.playerCalled } : {}),
      ...(options.regenNote ? { regenNote: options.regenNote } : {}),
      ...(options.party && options.party.length > 0 ? { party: options.party } : {}),
      ...(options.partyPending && options.partyPending.length > 0
        ? { partyPending: options.partyPending }
        : {}),
      ...(options.partyHold && options.partyHold.length > 0 ? { partyHold: options.partyHold } : {}),
      ...(options.inParty ? { inParty: true } : {}),
      ...(options.outOfSight ? { outOfSight: true } : {})
    })
  ].join("\n\n");

  const includedIds = new Set(
    assembled.includedBlocks.filter((block) => block.source === "conversation").map((block) => block.id)
  );

  const history = allTurns
    .filter((turn) => includedIds.has(`conversation-${turn.turn}`))
    .sort((a, b) => a.turn - b.turn);

  const last = history[history.length - 1];
  if (last?.role === "player" && last.content === currentPlayerMessage) {
    history.pop();
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemContent }];
  for (const turn of history) {
    messages.push({
      role: turn.role === "character" ? "assistant" : "user",
      content: turn.content
    });
  }
  const focusName = options.characterName?.trim() || characterId;
  const names = [
    focusName,
    characterId,
    ...(options.characterNames ?? [])
  ];
  messages.push({
    role: "user",
    content: formatPass1UserContent(currentPlayerMessage, names, options.pronoun, focusName)
  });
  return messages;
}
