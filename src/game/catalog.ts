import type { EncounterAction, EncounterGame } from "./EncounterSchema";
import { actionBlock } from "./EncounterEngine";
import { encounterCommands } from "./intention";
import { actionLabel } from "./narration";
import { itemRevealed } from "./itemVisibility";

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
  const takesHiddenItem = [...interaction.success.effects, ...interaction.failure.effects].some(
    (effect) => effect.kind === "take-item" && !itemRevealed(game.definition, s, effect.itemId),
  );
  return missingRequired || excluded || takesHiddenItem;
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

/**
 * Up to three things to suggest under "What do you do?", never one that is blocked, in this order:
 * what can be done with the person the player is talking to and is not done, then other things
 * that can be done here and are not done, then doors that can be unlocked or opened, then
 * "Look around". Fights and turns are not suggested; the list of everything is "More choices".
 */
export function suggestedCommands(
  game: EncounterGame,
  addresseeId?: string,
  limit = 3,
): PublicCommand[] {
  const { definition: d, state: s } = game;
  if (s.phase !== "exploration") return [];
  const open = publicCommands(game).filter((command) => !command.blocked);
  const interactionOf = (command: PublicCommand) =>
    command.action.kind === "interaction"
      ? d.interactions.find(
          (i) => i.id === (command.action as { interactionId: string }).interactionId,
        )
      : undefined;
  const undone = (command: PublicCommand) => {
    const interaction = interactionOf(command);
    return !!interaction && !s.attempts.includes(interaction.id);
  };
  const withThem = open.filter(
    (command) =>
      undone(command) && !!addresseeId && interactionOf(command)?.counterpartyId === addresseeId,
  );
  const elsewhere = open.filter(
    (command) =>
      undone(command) && !(addresseeId && interactionOf(command)?.counterpartyId === addresseeId),
  );
  const doors = open.filter((command) => {
    if (command.action.kind !== "interact") return false;
    const door = s.barriers[command.action.barrierId];
    if (!door || door.open) return false;
    return command.action.operation === (door.locked ? "unlock" : "open");
  });
  const look = open.filter((command) => command.action.kind === "look");
  const seen = new Set<string>();
  return [...withThem, ...elsewhere, ...doors, ...look]
    .filter((command) => {
      const key = JSON.stringify(command.action);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
