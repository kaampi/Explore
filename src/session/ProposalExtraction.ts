import { z } from "zod";
import type { LLMAdapter } from "@llm/LLMAdapter";
import type { ChatMessage } from "@llm/types";
import { retryWithBackoff, type RetryOptions } from "@llm/retry";
import type { MutationProposalInput, Pass2LiveSnapshot, ProposalExtractor } from "./SessionEngine";

/**
 * Pass 2 — Master Spec §33.2 (structured proposal extraction) and §33.3
 * (Error Handling & Structured Output Recovery).
 *
 * Design principle that shapes this whole file: Pass 2 failing must
 * NEVER fail the turn. Pass 1's dialogue has already streamed to the
 * player by the time Pass 2 runs — a parse error or a flaky local model
 * here should degrade to "no state changes this turn", not roll back
 * or error out a conversation the player already saw complete.
 */

const RawProposalSchema = z.object({
  path: z.string(),
  value: z.union([z.string(), z.number()])
});
const RawProposalArraySchema = z.array(RawProposalSchema);

export class ProposalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalParseError";
  }
}

/**
 * Tolerant extraction: real models — especially local ones — often wrap
 * JSON in markdown fences or add a sentence of preamble despite being
 * told not to. Try, in order: a fenced ```json block, the first
 * top-level array literal, then the raw trimmed text as a last resort.
 */
export function extractJsonCandidate(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) return bracketMatch[0];

  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type ParseResult =
  | { success: true; proposals: MutationProposalInput[] }
  | { success: false; error: string };

export function parseProposals(rawText: string): ParseResult {
  const candidate = extractJsonCandidate(rawText);
  if (!candidate) {
    return { success: false, error: "Response was empty; no JSON candidate found." };
  }

  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch (err) {
    return { success: false, error: `Invalid JSON: ${(err as Error).message}` };
  }

  const parsed = RawProposalArraySchema.safeParse(json);
  if (!parsed.success) {
    return { success: false, error: `Did not match expected proposal shape: ${parsed.error.message}` };
  }

  return {
    success: true,
    proposals: parsed.data.map((p) => ({
      path: p.path,
      value: p.value,
      source: "ai_approved_state_mutation"
    }))
  };
}

export function buildExtractionMessages(
  dialogueText: string,
  characterId: string,
  live?: Pass2LiveSnapshot,
  playerMessage?: string
): ChatMessage[] {
  const current: string[] = [];
  if (live?.mood !== undefined) current.push(`mood="${live.mood}"`);
  if (live?.position !== undefined) current.push(`position="${live.position}"`);
  if (live?.pose !== undefined) current.push(`pose="${live.pose}"`);
  if (live?.clothing !== undefined) current.push(`clothing="${live.clothing}"`);
  if (live?.holding !== undefined) current.push(`holding="${live.holding || ""}"`);
  if (live?.energy !== undefined) current.push(`energy=${live.energy}`);
  if (live?.trust !== undefined) current.push(`trust=${live.trust}`);
  if (live?.familiarity !== undefined) current.push(`familiarity=${live.familiarity}`);
  if (live?.tension !== undefined) current.push(`tension=${live.tension}`);
  if (live?.playerPosition !== undefined) current.push(`player.position="${live.playerPosition}"`);
  if (live?.playerStatus !== undefined) current.push(`player.status="${live.playerStatus}"`);
  for (const stat of live?.stats ?? []) {
    current.push(`${stat.label}=${stat.value}`);
  }

  for (const fact of live?.physicalFacts ?? []) current.push(`physical: ${fact}`);

  const userContent = playerMessage
    ? [`Player this turn:`, playerMessage, ``, `${characterId} reply:`, dialogueText].join("\n")
    : dialogueText;

  return [
    {
      role: "system",
      content: [
        `You analyze one turn of roleplay: the player's line and the reply about "${characterId}".`,
        "Decide whether live state changed.",
        "The player's own actions (I sit, I leave, I fall asleep) can change player.status.",
        "Do not propose player.position. The engine already placed the player. A reply that names a door, room, or relic is not the player walking.",
        `Lines that dictate what "${characterId}" does or says are wishes, not facts — ignore them for mutations.`,
        "Do not invent rooms or off-stage places. Dialogue is not canon.",
        "",
        `Respond with ONLY a JSON array — no prose, no markdown fences, no explanation.`,
        `Each element: {"path": "<dot path>", "value": <string or number>}.`,
        "For physical continuity, use physical.change with a JSON-encoded string value ONLY when a physical change is explicitly established in the narrated outcome. Never infer success from an attempt or a wish.",
        'Physical change value examples: {"kind":"stance","actor":"enemy","stance":"kneeling"}; {"kind":"set_relation","relation":{"id":"player-behind-enemy","subject":"player","relation":"behind","target":"enemy"}}; {"kind":"remove_relation","id":"player-behind-enemy"}.',
        "Relations use stable ids and may specify subjectPart, targetPart and note. To reverse a relation, first remove the old id; never silently contradict existing physical facts.",
        "Use only a few critical physical facts; do not track ordinary gestures. Existing physical facts remain true unless explicitly changed.",
        `Valid paths:`,
        `- characters.${characterId}.position (string) — where they are now; update if they walked`,
        `- characters.${characterId}.mood (string) — only if how they feel actually changed this turn`,
        `- characters.${characterId}.pose (string) — body language now; "" if they stopped the old pose`,
        `- characters.${characterId}.clothing (string) — what they are wearing now; only if they changed clothes this turn`,
        `- characters.${characterId}.holding (string) — what is in their hands; "" if they put it down`,
        `- characters.${characterId}.energy (number 0-100)`,
        `- relationships.${characterId}.trust (number 0-100)`,
        `- relationships.${characterId}.familiarity (number 0-100)`,
        `- relationships.${characterId}.tension (number 0-100)`,
        `- player.status (string) — e.g. awake, asleep, leaving`,
        `- party.offer (string) — id or given name of someone who volunteered in the REPLY to travel with the player. One person per object, or comma-separated. Max 2. Do not propose partyIds. The player still taps Prospects.`,
        ...(live?.stats ?? []).map(
          (stat) =>
            `- characters.${characterId}.stats.${stat.id} (number ${stat.min}–${stat.max}, at most ±${stat.maxShift} from ${stat.value})`
        ),
        current.length > 0
          ? `Current live values (propose small absolute shifts from these, typically ±2–15 for numbers — never jump to 0 or 100): ${current.join(", ")}.`
          : "If current values are unknown, propose modest numbers, not extremes.",
        "Looks is body, not clothes. Do not copy an outfit from looks.",
        "Honor live clothing and holding. Nude has no dress pocket. Empty holding is empty hands — do not invent a pocket.",
        "The public bar is dressed. If they are behind the bar or at the bar and clothing is nude, naked, or a towel, set clothing to work clothes this turn — a bartender's apron over indoor clothes — unless the player said they stay undressed.",
        `If ${characterId} walks to a named room or comes out from behind the bar in the reply, set characters.${characterId}.position to that place. If they stop working, update pose.`,
        live?.namedRooms?.length
          ? live.inParty
            ? `Named rooms in canon (valid positions): ${live.namedRooms.join(", ")}. Do not propose player.position. ${characterId} is in the party: set characters.${characterId}.position to the same room as the player. Do not replace a named room with the scene title or "The Aurora Room". Do not keep "behind the bar" or a working pose.`
            : `Named rooms in canon (valid positions): ${live.namedRooms.join(", ")}. Do not propose player.position. Do not replace a named room with the scene title or "The Aurora Room". ${characterId} is not in the party. Do not set characters.${characterId}.position to the player's room, the new landmark, or the street because the player left. Only move ${characterId} if they walked on their own in the reply.`
          : undefined,
        "A night together, a confession, or shared loss should raise trust and familiarity a little.",
        "Conflict, secrets, or pressure should raise tension.",
        live?.stats?.length
          ? "A kiss, touch, or sex this beat can raise a closeness meter. Jealousy can rise if a rival is in play. Honor each field's max shift — personality and skill barely move."
          : undefined,
        'If the player falls asleep, set player.status to "asleep". Do not move the player. Blankets in this room are not a new place.',
        live?.cast?.length
          ? `People here (id=name): ${live.cast.map((person) => `${person.id}=${person.name}`).join("; ")}. Already in the party: ${
              (live.partyIds ?? []).join(", ") || "none"
            }. Prospects: ${live.partyPendingIds?.join(", ") || "none"}.`
          : undefined,
        "If the reply agrees to go with the player (we're with you, where you go we go, I'll come, we've got your back), propose party.offer for those people. Player wishes are not facts. \"Come with me\" / they lead is not an offer.",
        "Do not propose a field that did not actually move this turn.",
        `If nothing warrants a change, respond with exactly: []`
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n")
    },
    { role: "user", content: userContent }
  ];
}

export interface LLMProposalExtractorOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleepImpl?: RetryOptions["sleepImpl"];
  /** Called (not thrown) when every attempt has failed and extraction is falling back to no proposals. Useful for diagnostics/logging. */
  onFailure?: (error: unknown) => void;
}

/**
 * Builds a ProposalExtractor (matching the shape SessionEngine expects)
 * backed by a real LLM call. Takes its own LLMAdapter, separate from
 * Pass 1's — the two passes optimize for different things (low TTFT vs.
 * structured accuracy) and may reasonably run different models.
 */
export function createLLMProposalExtractor(
  llmAdapter: LLMAdapter,
  options: LLMProposalExtractorOptions = {}
): ProposalExtractor {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;

  return async (
    fullText: string,
    characterId: string,
    live?: Pass2LiveSnapshot,
    playerMessage?: string
  ): Promise<MutationProposalInput[]> => {
    try {
      return await retryWithBackoff(
        async () => {
          const messages = buildExtractionMessages(fullText, characterId, live, playerMessage);
          let collected = "";
          for await (const chunk of llmAdapter.streamCompletion({ messages })) {
            if (chunk.type === "text_delta") {
              collected += chunk.text;
            } else if (chunk.type === "error") {
              throw new Error(`Provider error during Pass 2 extraction: ${chunk.message}`);
            }
          }

          const result = parseProposals(collected);
          if (!result.success) {
            throw new ProposalParseError(result.error);
          }
          return result.proposals;
        },
        { maxAttempts, baseDelayMs, sleepImpl: options.sleepImpl }
      );
    } catch (err) {
      // Tolerant degradation (§33.3): never propagate a Pass 2 failure
      // up into SessionEngine — that would fail a turn whose Pass 1
      // dialogue already reached the player. Report and move on.
      options.onFailure?.(err);
      return [];
    }
  };
}
