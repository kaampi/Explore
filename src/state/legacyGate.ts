import { z } from "zod";
import { CombatBeatSchema } from "../game/EncounterSchema";

/**
 * The saved form of the old gatehouse test, kept only so that older conversations still open.
 * Nothing plays it any more: the gatehouse is now an ordinary adventure.
 */
export const GATE_POSITIONS = [
  "gate",
  "wall-foot",
  "cover",
  "road",
  "courtyard",
  "stairs",
  "wall",
] as const;

const InitiativeSchema = z
  .object({
    rolls: z.object({
      player: z.number().int().min(1).max(100),
      mona: z.number().int().min(1).max(100).optional(),
      archer: z.number().int().min(1).max(100).optional(),
    }),
    order: z
      .array(z.enum(["player", "mona", "archer"]))
      .min(1)
      .max(3),
  })
  .refine(
    (v) =>
      v.order.includes("player") &&
      new Set(v.order).size === v.order.length &&
      v.order.every((id) => v.rolls[id] !== undefined),
  );
const EnemyTurnSchema = z.object({
  actor: z.enum(["mona", "archer"]),
  round: z.number().int().nonnegative(),
  from: z.enum(GATE_POSITIONS),
  to: z.enum(GATE_POSITIONS),
  action: z.enum(["attack", "defend", "retreat", "surrender", "open", "unlock", "rearm"]),
  weapon: z.enum(["sword", "bow", "dagger"]).optional(),
});
const CheckSchema = z.object({
  actor: z.string(),
  stat: z.string(),
  roll: z.number().int().min(1).max(100),
  target: z.number().int().min(0).max(100),
  degree: z.enum(["exceptional", "success", "failure", "severe"]),
  damage: z.number().int().nonnegative().optional(),
  round: z.number().int().nonnegative().optional(),
});
export type GateCheck = z.infer<typeof CheckSchema>;
export const GateEncounterSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  phase: z.enum(["exploration", "combat", "entered", "escaped", "defeated"]),
  position: z.enum(GATE_POSITIONS),
  hp: z.number().int().min(0).max(20),
  monaHp: z.number().int().min(0).max(16),
  archerHp: z.number().int().min(0).max(10),
  monaPosition: z.enum(GATE_POSITIONS).default("gate"),
  archerPosition: z.enum(GATE_POSITIONS).default("wall"),
  monaDefending: z.boolean().default(false),
  archerDefending: z.boolean().default(false),
  monaDisposition: z.enum(["active", "surrendered", "fled"]).default("active"),
  archerDisposition: z.enum(["active", "surrendered", "fled"]).default("active"),
  monaWeaponReady: z.boolean().optional(),
  archerWeaponReady: z.boolean().optional(),
  archerArrows: z.number().int().min(0).max(6).default(6),
  initiative: InitiativeSchema.optional(),
  gateLocked: z.boolean(),
  gateOpen: z.boolean(),
  admitted: z.boolean(),
  suspicious: z.number().int().min(0).max(3),
  posternFound: z.boolean(),
  keyOwner: z.enum(["mona", "player"]),
  arrows: z.number().int().min(0).max(4),
  wagonTipped: z.boolean().default(false),
  actionUsed: z.boolean(),
  moveUsed: z.boolean(),
  defending: z.boolean(),
  round: z.number().int().nonnegative(),
  attempts: z.array(z.string()),
  flags: z.array(z.string()),
  history: z.array(
    z.object({
      id: z.string(),
      revision: z.number().int(),
      action: z.string(),
      combat: z.boolean().optional(),
      intention: z.string().max(1000).optional(),
      speaker: z.enum(["mona", "narrator"]).optional(),
      enemyTurns: z.array(EnemyTurnSchema).optional(),
      renewedSurrender: z.enum(["mona", "archer"]).optional(),
      initiative: InitiativeSchema.optional(),
      text: z.string(),
      checks: z.array(CheckSchema),
      presentation: z.array(CombatBeatSchema).optional(),
    }),
  ),
});
export type GateEncounter = z.infer<typeof GateEncounterSchema>;
