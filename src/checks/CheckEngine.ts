import { ActionDefinitionSchema } from "./ActionDefinitions";
import { z } from "zod";

export const DIFFICULTIES = {
  easy: { label: "Easy (+20)", modifier: 20 },
  normal: { label: "Normal", modifier: 0 },
  hard: { label: "Hard (−20)", modifier: -20 }
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export const CheckResultSchema = z.object({
  id: z.string().min(1),
  action: z.string().trim().min(1).max(240),
  actionDefinition: ActionDefinitionSchema.optional(),
  targetId: z.string().min(1),
  attributeId: z.string().min(1),
  attributeName: z.string().min(1),
  value: z.number().finite(),
  min: z.number().finite(),
  max: z.number().finite(),
  difficulty: z.enum(["easy", "normal", "hard"]),
  target: z.number().int().min(0).max(100),
  roll: z.number().int().min(1).max(100),
  success: z.boolean()
}).superRefine((result, ctx) => {
  if (result.max <= result.min || result.value < result.min || result.value > result.max) {
    ctx.addIssue({ code: "custom", message: "Invalid attribute range or value" });
    return;
  }
  if (result.actionDefinition && result.actionDefinition.attributeId !== result.attributeId) {
    ctx.addIssue({ code: "custom", message: "Action stat does not match the check." });
  }
  const target = checkTarget(result.value, result.min, result.max, result.difficulty);
  if (target !== result.target || result.success !== (result.roll <= target)) {
    ctx.addIssue({ code: "custom", message: "Check outcome does not match its roll and target" });
  }
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** d100 roll-under MVP: equality succeeds; 0% never, 100% always. */
export function checkTarget(value: number, min: number, max: number, difficulty: Difficulty): number {
  if (![value, min, max].every(Number.isFinite) || max <= min || value < min || value > max) {
    throw new Error("A check needs a finite stat within a valid min–max range.");
  }
  return Math.max(0, Math.min(100, Math.round((value - min) / (max - min) * 100) + DIFFICULTIES[difficulty].modifier));
}

export function resolveCheck(
  input: Omit<CheckResult, "roll" | "success" | "target">,
  rng: () => number = Math.random
): CheckResult {
  const target = checkTarget(input.value, input.min, input.max, input.difficulty);
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid random sample.");
  const roll = Math.floor(random * 100) + 1;
  return CheckResultSchema.parse({ ...input, target, roll, success: roll <= target });
}

export const SUCCESS_GRADES = {
  barely: { label: "Barely succeeds", narration: "The player succeeds, but only just." },
  lastEffort: { label: "Succeeds with a final effort", narration: "The player succeeds with a final effort." },
  succeeds: { label: "Succeeds", narration: "The player succeeds." },
  easily: { label: "Succeeds easily", narration: "The player succeeds easily." },
  effortlessly: { label: "Succeeds effortlessly", narration: "The player succeeds with playful ease." }
} as const;
export type SuccessGrade = keyof typeof SUCCESS_GRADES;

/** Exact roll/target bands, without rounding. Derived from the saved roll for replay. */
export function successGrade(result: Pick<CheckResult, "roll" | "target" | "success">): SuccessGrade | null {
  if (!result.success || result.target <= 0 || result.roll > result.target) return null;
  const scaledRoll = result.roll * 100;
  if (scaledRoll >= result.target * 80) return "barely";
  if (scaledRoll >= result.target * 60) return "lastEffort";
  if (scaledRoll >= result.target * 40) return "succeeds";
  if (scaledRoll >= result.target * 20) return "easily";
  return "effortlessly";
}

export function checkOutcomeLabel(result: CheckResult): string {
  const grade = successGrade(result);
  return grade ? SUCCESS_GRADES[grade].label : "Setback";
}

/** Display only. The library's summed total is NOT our percentile result. */
export function percentileNotation(roll: number): string {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new Error("Invalid d100 roll.");
  const tens = Math.floor((roll % 100) / 10) * 10 || 100;
  const units = roll % 10 || 10;
  return `1d100+1d10@${tens},${units}`;
}

export function checkOutcomeInstruction(result: CheckResult, participants?: { actor: string; counterpart: string }): string {
  const grade = successGrade(result);
  return [
    "ENGINE-RESOLVED ACTION CHECK — authoritative outcome for this beat.",
    JSON.stringify({ actor: participants?.actor ?? "the player", counterpart: participants?.counterpart ?? "the selected character",
      action: result.action, attribute: result.attributeName, value: result.value,
      range: [result.min, result.max], difficulty: result.difficulty, roll: result.roll,
      target: result.target, outcome: result.success ? "SUCCESS" : "FAILURE",
      successGrade: grade, effort: grade ? SUCCESS_GRADES[grade].narration : null,
      definedAction: result.actionDefinition ?? null }),
    "The attempted action is already supplied by the player. Continue with the counterpart's reaction only. Every new quoted line belongs to the counterpart; the player's next words and actions wait for the player's next turn.",
    ...(result.success ? [
      ...(result.actionDefinition ? [`The established success is: ${result.actionDefinition.successMeaning}. Apply this meaning to the exact player attempt; the grade determines ease, not extra rewards.`] : []),
      "The engine-defined success grade is authoritative. Reflect its effort and ease in the reaction; do not invent a critical success or upgrade the grade because the raw roll is low. Ease does not expand the scope of the attempted action.",
      "SUCCESS IS ESTABLISHED FACT. Begin with an observable positive result of this exact attempt. Current trust, mood and personality shape HOW the counterpart responds to the success; they do not decide the outcome again.",
      "If this is a charm or flirt attempt and no authored success meaning overrides this guidance: the counterpart warms to the player, shows interest and gives an engaged response. Caution may remain alongside that positive response.",
      "Keep success within the stated attempt. Charming someone earns a warmer response; moving to another room, physical intimacy and new commitments are separate choices. Narrate this successful moment, then leave space for the player."
    ] : [
      "FAILURE IS ESTABLISHED FACT. The attempt meets a proportionate setback. Show that consequence, with a clear opening for the player's next action."
    ]),
    "Use the engine outcome as written. Mechanical damage, stat changes, rooms and rewards require established rules; this check resolves the attempted interaction."
  ].join("\n");
}
