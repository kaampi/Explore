import { usesGameRules } from "../state/playMode";
import type { Session } from "@state/StateSchema";
import { pass1NameOptions, maskUnheardGivenNames } from "@state/nameHeard";
import { sideRoomStage, venueBuildingName } from "@state/playerDestination";
import { herePrompt } from "@state/placeIntro";
import { namedRoomsInCanon } from "@state/WorldCanon";
import { DEFAULT_BUDGET } from "./ContextBudgetManager";
import {
  assembleContext,
  FAN_FICTION_WRITING,
  buildPass1WritingInstructions,
  metersFromSession,
  parseConversationTurns
} from "./ContextEngine";
import { estimateTokens } from "./tokenEstimate";
import type { ContextBlockSource } from "./ContextBlock";

export type PromptBudgetPart = {
  id: string;
  label: string;
  tokens: number;
};

export type PromptBudgetSnapshot = {
  /** Estimated tokens in the next Pass 1 request (heuristic, ~4 chars/token). */
  promptTokens: number;
  assembledTokens: number;
  targetTokens: number;
  hardCeilingTokens: number;
  overTarget: boolean;
  droppedBlocks: number;
  injectionFindings: number;
  parts: PromptBudgetPart[];
};

const SOURCE_LABEL: Record<ContextBlockSource, string> = {
  system_rule: "rules",
  voice: "narrator",
  story: "story",
  state_summary: "state",
  active_layer: "layers",
  memory: "memory",
  conversation: "chat"
};

const PART_ORDER = ["rules", "narrator", "story", "state", "layers", "memory", "pass 1", "chat"] as const;

/**
 * Live size of the prompt that would go to the model this turn, plus the
 * assembled-block total the budget trimmer uses.
 */
export function inspectPromptBudget(session: Session): PromptBudgetSnapshot {
  const assembled = assembleContext(session);
  const bySource = new Map<string, number>();

  for (const block of assembled.includedBlocks) {
    if (block.source === "conversation") continue;
    const label = SOURCE_LABEL[block.source];
    bySource.set(label, (bySource.get(label) ?? 0) + estimateTokens(block.content));
  }

  const focusId = Object.keys(session.characters)[0];
  const character = focusId ? session.characters[focusId] : undefined;
  const names = focusId ? pass1NameOptions(session, focusId) : {};
  const stageRoom = sideRoomStage(session);
  const intro = herePrompt(session);
  const introForModel = intro
    ? {
        ...intro,
        title: maskUnheardGivenNames(session, intro.title),
        body: maskUnheardGivenNames(session, intro.body)
      }
    : undefined;
  const writing = !usesGameRules(session) ? FAN_FICTION_WRITING : focusId
    ? buildPass1WritingInstructions(focusId, {
        narrator: assembled.includedBlocks.some((block) => block.source === "voice"),
        ...names,
        ...(character?.pronoun ? { pronoun: character.pronoun } : {}),
        ...(session.player?.status.value ? { playerStatus: session.player.status.value } : {}),
        ...(session.player?.position.value
          ? { playerPosition: maskUnheardGivenNames(session, session.player.position.value) }
          : {}),
        ...(character?.position.value
          ? { characterPosition: maskUnheardGivenNames(session, character.position.value) }
          : {}),
        ...(stageRoom ? { stageRoom: maskUnheardGivenNames(session, stageRoom) } : {}),
        ...(introForModel ? { hereIntro: introForModel } : {}),
        ...(character?.clothing ? { clothing: character.clothing.value } : {}),
        ...(character?.holding ? { holding: character.holding.value } : {}),
        ...(namedRoomsInCanon(session).length > 0 ? { namedRooms: namedRoomsInCanon(session) } : {}),
        ...(venueBuildingName(session.scene?.location)
          ? { venueName: venueBuildingName(session.scene?.location) }
          : {}),
        meters: metersFromSession(session, focusId)
      })
    : "";
  const writingTokens = estimateTokens(writing);
  if (writingTokens > 0) bySource.set("pass 1", writingTokens);

  const { turns } = parseConversationTurns(session, undefined);
  const kept = new Set(
    assembled.includedBlocks.filter((block) => block.source === "conversation").map((block) => block.id)
  );
  const chatTokens = turns
    .filter((turn) => kept.has(`conversation-${turn.turn}`))
    .reduce((sum, turn) => sum + estimateTokens(turn.content), 0);
  if (chatTokens > 0) bySource.set("chat", chatTokens);

  const parts = PART_ORDER.filter((id) => (bySource.get(id) ?? 0) > 0).map((id) => ({
    id,
    label: id,
    tokens: bySource.get(id) ?? 0
  }));

  const promptTokens = parts.reduce((sum, part) => sum + part.tokens, 0);

  return {
    promptTokens,
    assembledTokens: assembled.totalTokens,
    targetTokens: DEFAULT_BUDGET.targetTokens,
    hardCeilingTokens: DEFAULT_BUDGET.hardCeilingTokens,
    overTarget: promptTokens > DEFAULT_BUDGET.targetTokens,
    droppedBlocks: assembled.droppedBlocks.length,
    injectionFindings: assembled.injectionFindings.length,
    parts
  };
}

