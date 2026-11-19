import { hostile } from "../../game/EncounterEngine";
import type { EncounterGame } from "../../game/EncounterSchema";
import type { Session } from "../../state/StateSchema";

/** How many values are drawn as meters under "Your character". The rest are in the fold. */
export const METERS_SHOWN = 3;

/** One of the player's values, with the scale it is on. */
export type PlayerValue = {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
};

/**
 * The player's values as the play view shows them. A value that can move in the story (the
 * rule-set lets it shift) is a meter, and one that stays put is a skill. A rule-set can say
 * otherwise for a value with `display`, which comes first: "meter", "skill" or "hidden". At most
 * three meters are drawn; any more go in the fold with the skills, in the rule-set's order.
 */
export function playerValues(session: Session): { meters: PlayerValue[]; fold: PlayerValue[] } {
  const game = session.encounter;
  const player = game?.state.actors[game.definition.playerId];
  if (!game || !player) return { meters: [], fold: [] };
  const defined = new Map((session.ruleset?.attributes ?? []).map((a) => [a.id, a]));
  const meters: PlayerValue[] = [];
  const fold: PlayerValue[] = [];
  for (const attribute of game.definition.rules.attributes) {
    const raw = player.stats[attribute.id];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (raw === undefined || !Number.isFinite(value)) continue;
    const rule = defined.get(attribute.id);
    const display = rule?.display ?? ((rule?.maxShift ?? 0) > 0 ? "meter" : "skill");
    if (display === "hidden") continue;
    const entry = {
      id: attribute.id,
      name: attribute.name,
      value,
      min: attribute.min,
      max: attribute.max,
    };
    (display === "meter" ? meters : fold).push(entry);
  }
  // The meters over the limit go in the fold, in the order they came.
  const shown = meters.slice(0, METERS_SHOWN);
  const rest = meters.slice(METERS_SHOWN);
  const order = [...game.definition.rules.attributes.map((a) => a.id)];
  const folded = [...fold, ...rest].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { meters: shown, fold: folded };
}

/**
 * Whether the play view has any use for health: the scene has someone who is an enemy, or a
 * weapon, or an outcome that can start a fight, or the player is already hurt. Without any of
 * that, health is left out (and so is a "Hostile" label).
 */
export function hasCombat(game: EncounterGame): boolean {
  const { definition: d, state: s } = game;
  const player = s.actors[d.playerId];
  if (!player) return false;
  return (
    d.weapons.length > 0 ||
    player.weapons.length > 0 ||
    player.hp < player.maxHp ||
    Object.values(s.actors).some((actor) => actor.id !== d.playerId && hostile(d, player, actor)) ||
    d.interactions.some((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) => effect.kind === "start-combat",
      ),
    )
  );
}
