import archerFighting from "../assets/archer-fighting.png";
import monaFighting from "../assets/mona-fighting.png";
import playerSword from "../assets/player-sword.png";
import type { Session } from "../../state/StateSchema";
import { hostile } from "../../game/EncounterEngine";
export type Fighter = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: string;
  status: string[];
  image?: string | undefined;
  portrait?: string | undefined;
  anatomyId?: string | undefined;
  parts?: string[] | undefined;
};
const condition = (hp: number, disposition: string, defending: boolean, ready?: boolean) =>
  hp === 0
    ? ["Incapacitated"]
    : disposition === "surrendered"
      ? ["Surrendered"]
      : disposition === "fled"
        ? ["Retreated"]
        : ready === false
          ? ["Weapon down"]
          : defending
            ? ["Defending"]
            : [];
/** Pictures that come with the gatehouse example's people, used until the author draws their own. */
const EXAMPLE_FIGURES: Record<string, string> = {
  Mona: monaFighting,
  "The archer": archerFighting,
};

export function encounterFighters(session: Session): { player: Fighter; opponents: Fighter[] } {
  const { definition: d, state: s } = session.encounter!,
    player = s.actors[d.playerId]!;
  const view = (id: string): Fighter => {
    const a = s.actors[id]!,
      place = d.places.find((p) => p.id === a.position)!;
    return {
      id,
      name: a.name,
      hp: a.hp,
      maxHp: a.maxHp,
      position: place.name + (place.elevation ? ` · +${place.elevation} m` : ""),
      status: condition(a.hp, a.disposition, a.defending, a.weaponReady),
      anatomyId: a.anatomyTemplateId,
      parts: a.anatomyTemplateId
        ? session.anatomyTemplates?.[a.anatomyTemplateId]?.parts.map((p) => p.id)
        : undefined,
      portrait: id === d.playerId ? session.player?.portraitDataUrl : undefined,
      image: session.combatArtwork?.[id]?.imageDataUrl ?? EXAMPLE_FIGURES[a.name],
    };
  };
  const opponents = Object.values(s.actors)
    .filter((a) => hostile(d, player, a))
    .map((a) => view(a.id));
  const fromExample = opponents.some((o) => o.name in EXAMPLE_FIGURES);
  const you = view(player.id);
  return {
    player: fromExample && !you.image ? { ...you, image: playerSword } : you,
    opponents,
  };
}

export function projectFighters(
  session: Session,
  snapshot: import("../../game/EncounterSchema").CombatBeat["actors"] | undefined,
) {
  const fighters = encounterFighters(session);
  if (!snapshot) return fighters;
  const view = (fighter: Fighter): Fighter => {
    const a = snapshot[fighter.id];
    if (!a) return fighter;
    const place = session.encounter?.definition.places.find((p) => p.id === a.position);
    return {
      ...fighter,
      hp: a.hp,
      status: condition(a.hp, a.disposition, a.defending, a.weaponReady),
      position: place
        ? place.name + (place.elevation ? ` · +${place.elevation} m` : "")
        : a.position,
    };
  };
  return { player: view(fighters.player), opponents: fighters.opponents.map(view) };
}
