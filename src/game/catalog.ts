import type { EncounterAction, EncounterGame } from "./EncounterSchema";
import { actionBlock } from "./EncounterEngine";
import { encounterCommands } from "./intention";
import { actionLabel } from "./narration";

export type PublicCommand = {
  /** Short number such as "a3". Valid only for the list it came from. */
  ref: string;
  label: string;
  action: EncounterAction;
  /** Why the player cannot do this right now. The action is still listed. */
  blocked?: string;
};

function interactionIsSecret(game: EncounterGame, interactionId: string): boolean {
  const { definition: d, state: s } = game;
  const interaction = d.interactions.find((i) => i.id === interactionId);
  if (!interaction) return true;
  const missingRequired = interaction.requiresFlags.some((flag) => !s.flags.includes(flag));
  const excluded = interaction.excludesFlags.some((flag) => s.flags.includes(flag));
  return missingRequired || excluded;
}

function isHiddenSharedDoorAction(game: EncounterGame, action: EncounterAction): boolean {
  if (action.kind !== "interact") return false;
  const door = game.state.barriers[action.barrierId];
  if (!door?.shared) return false;
  const wantedOperation = door.locked ? "unlock" : "open";
  const useful = !door.open && action.operation === wantedOperation;
  return !useful;
}

/**
 * The one list of things the player may choose. The panel draws its buttons from it and
 * the AI may only point at one of its entries.
 *
 * Secret opportunities (flag conditions not met) are left out. Actions that are blocked for
 * other reasons stay in, with the reason, so the player learns why they do not work.
 */
export function publicCommands(game: EncounterGame): PublicCommand[] {
  const { definition: d, state: s } = game;
  return encounterCommands(game)
    .filter((action) => {
      if (action.kind === "interaction") return !interactionIsSecret(game, action.interactionId);
      return !isHiddenSharedDoorAction(game, action);
    })
    .map((action, index) => {
      const blocked = actionBlock(d, s, action);
      return {
        ref: `a${index + 1}`,
        label: actionLabel(d, s, action),
        action,
        ...(blocked ? { blocked } : {}),
      };
    });
}
