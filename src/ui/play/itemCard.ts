import { itemOrigin, type ItemOrigin } from "../../game/AdventureEngine";
import { itemUses, publicCommands, type ItemUse } from "../../game/catalog";
import type { EncounterAction, EncounterGame } from "../../game/EncounterSchema";
import { itemRevealed } from "../../game/itemVisibility";
import { iconFor, isMagic, type ItemIcon } from "../../library/itemIcons";
import { inventoryActions, type InventoryEntry } from "../../session/playerInventory";
import type { Session } from "../../state/StateSchema";

/** The things lying in the place the player stands in, that the player may see. */
export function thingsHere(game: EncounterGame) {
  const { definition: d, state: s } = game;
  const player = s.actors[d.playerId];
  if (!player) return [];
  return d.items.filter(
    (item) => s.itemLocations[item.id] === player.position && itemRevealed(d, s, item.id),
  );
}

/** The actions that have something to do with a thing: the ones that take it or need it. */
export function actionsForThing(game: EncounterGame, itemId: string) {
  const { definition: d } = game;
  return publicCommands(game).filter((command) => {
    const action = command.action;
    if (action.kind !== "interaction") return false;
    const interaction = d.interactions.find((i) => i.id === action.interactionId);
    if (!interaction) return false;
    return (
      interaction.requiresItems.includes(itemId) ||
      [...interaction.success.effects, ...interaction.failure.effects].some(
        (effect) =>
          (effect.kind === "take-item" || effect.kind === "transfer-item") &&
          effect.itemId === itemId,
      )
    );
  });
}

export type CardAction = {
  label: string;
  /** Why it cannot be done now. It is still listed. */
  blocked?: string | undefined;
  action: EncounterAction;
};

/** Everything an info card shows about a thing. The card itself only draws it. */
export type ItemCardData = {
  key: string;
  name: string;
  kind: "item" | "weapon" | "ammunition" | "resource";
  icon: ItemIcon;
  magic: boolean;
  imageDataUrl?: string | undefined;
  description: string;
  /** What can be read on it. A thing with this opens as a note, not as a card. */
  readableContent?: string | undefined;
  quantity: number;
  container?: string | undefined;
  /** What the engine knows it does, in words. */
  uses: ItemUse[];
  /** Values by the rules, such as a weapon's damage. Empty when the rule-set has no values. */
  rules: { label: string; value: string }[];
  origin: ItemOrigin | null;
  actions: CardAction[];
};

/** Whether the game has a rule-set with values: only then is there anything "by the rules". */
function rulesHaveValues(session: Session): boolean {
  return (
    (session.ruleset?.attributes.length ?? 0) > 0 ||
    (session.encounter?.definition.rules.attributes.length ?? 0) > 0
  );
}

/** The card of a thing the player carries. */
export function inventoryCard(session: Session, entry: InventoryEntry): ItemCardData {
  const game = session.encounter;
  const item = game?.definition.items.find((i) => i.id === entry.id);
  return {
    key: entry.key,
    name: entry.name,
    kind: entry.kind,
    icon: iconFor({
      icon: entry.icon,
      tags: entry.tags,
      name: entry.name,
      weaponKind: entry.weaponKind,
    }),
    magic: isMagic({ tags: entry.tags }),
    imageDataUrl: entry.imageDataUrl,
    description: entry.description ?? "",
    readableContent: entry.readableContent,
    quantity: entry.quantity,
    container: entry.container,
    uses: game && entry.kind === "item" && item ? itemUses(game, entry.id) : [],
    rules: rulesHaveValues(session) ? (entry.facts ?? []) : [],
    origin: entry.kind === "item" ? itemOrigin(session, entry.id) : null,
    actions: inventoryActions(session, entry),
  };
}

/** The card of a thing lying in the place, which the player has not picked up. */
export function sceneItemCard(game: EncounterGame, itemId: string): ItemCardData | null {
  const item = game.definition.items.find((i) => i.id === itemId);
  if (!item) return null;
  return {
    key: "scene:" + itemId,
    name: item.name,
    kind: "item",
    icon: iconFor(item),
    magic: isMagic({ tags: item.tags }),
    imageDataUrl: item.imageDataUrl,
    description: item.description ?? "",
    readableContent: item.readableContent,
    quantity: 1,
    uses: itemUses(game, itemId),
    rules: [],
    origin: null,
    actions: actionsForThing(game, itemId).map((command) => ({
      label: command.label,
      blocked: command.blocked,
      action: command.action,
    })),
  };
}
