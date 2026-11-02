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

/** Display only. The library's summed total is NOT our percentile result. */
export function percentileNotation(roll: number): string {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new Error("Invalid d100 roll.");
  const tens = Math.floor((roll % 100) / 10) * 10 || 100;
  const units = roll % 10 || 10;
  return `1d100+1d10@${tens},${units}`;
}

export function checkOutcomeInstruction(result: CheckResult,sceneConsequence?:string): string {
  return [
    "ENGINE-RESOLVED ACTION CHECK — authoritative outcome for this beat.",
    JSON.stringify({ action: result.action, attribute: result.attributeName, value: result.value,
      range: [result.min, result.max], difficulty: result.difficulty, roll: result.roll,
      target: result.target, outcome: result.success ? "SUCCESS" : "FAILURE" }),
    "Narrate this outcome; do not reroll, reverse it, or replace it with a favor/closeness check.",
    "Resolve the stated attempt in this reply with an explicit, observable consequence. A facial expression, hesitation or question alone is not a resolved outcome. Do not leave the attempt pending or ask for the argument the player has already attempted to make.",
    "The engine resolves this permitted attempt within its authored scope. Narrate the resolved NPC response; do not decide the outcome again. A successful check grants no control beyond that scope and never decides the player's next action.",
    result.success
      ? "SUCCESS: show concrete progress toward the stated goal within the scene's established limits. Do not narrate mere uncertainty or an effective refusal as success. Leave the player's next actions to the player."
      : "FAILURE: the stated attempt does not achieve its goal. Show a definite refusal, obstacle or other concrete setback now. Do not soften failure into 'depends' or a request for more explanation that simply repeats the same unresolved persuasion attempt. For an attempt to persuade a guard to permit entry, the guard refuses entry and the gate remains closed; skepticism alone is insufficient.",
    "The current attempt is finished. Further conversation may explore a different approach, new evidence or changed circumstances; do not invite an immediate reroll of the same unchanged attempt. Do not invent combat damage, stat changes, rooms, or rewards.",
    ...(sceneConsequence?[`RESOLVED SCENE FACTS — these are the authored mechanical consequences, not suggestions: ${sceneConsequence} Describe these facts now. Do not add another condition, request more justification, or leave permission undecided.`]:[])
  ].join("\n");
}
