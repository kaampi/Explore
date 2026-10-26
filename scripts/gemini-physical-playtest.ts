/**
 * Opt-in live Gemini continuity evaluation.
 * Run with GEMINI_API_KEY and: npx tsx scripts/gemini-physical-playtest.ts
 * This is an LLM narration probe, not a replacement for deterministic engine tests.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { applyPhysicalChange, describePhysicalState } from "../src/state/physicalContinuity";

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY is missing. Configure it as an Actions secret.");
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300 }
      }),
      signal: AbortSignal.timeout(45000)
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await wait(3000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error("Gemini request failed: HTTP " + response.status + " (check model availability and free-tier quota).");
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const answer = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (!answer) throw new Error("Gemini returned no narration.");
    return answer;
  }
  throw new Error("Gemini request retries exhausted.");
}

async function main() {
  let state = applyPhysicalChange(undefined, { kind: "set_relation", relation: {
    id: "left", subject: "player", subjectPart: "left_arm", relation: "restraining", target: "guard_a", exclusive: true
  } });
  if (!state.ok) throw new Error(state.reason);
  state = applyPhysicalChange(state.state, { kind: "set_relation", relation: {
    id: "right", subject: "player", subjectPart: "right_arm", relation: "restraining", target: "guard_b", exclusive: true
  } });
  if (!state.ok) throw new Error(state.reason);
  const scenes = [
    { name: "both-arms-occupied", action: "I draw my sword with my left arm while continuing to hold both guards.", forbidden: /(?:draw|drew|pull|pulled|grab|grabb|unsheath|brandish|raise|lift|swing|wield).{0,65}(?:sword|blade)/i },
    { name: "unrelated-movement", action: "A third guard walks into the room. I keep holding both guards.", forbidden: /(?:release|let go|drop|loosen).{0,45}(?:guard|grip|hold)/i },
    { name: "other-arm-occupied", action: "I grab a bow with my right arm while holding guard B.", forbidden: /(?:grab|grasp|pick up|lift|take|hold).{0,45}(?:bow)/i }
  ];
  const results: Array<{ scenario: string; passed: boolean; response: string; note: string }> = [];
  for (const scene of scenes) {
    const prompt = [
      "You are narrating a grounded roleplaying scene. State is authoritative.",
      "Do not narrate impossible actions as successful. You may describe an attempted action and why it fails.",
      "A body part in an exclusive grip cannot hold another item unless explicitly released.",
      "Physical facts:\n" + describePhysicalState(state.state, 10, ["player"]).join("\n"),
      "Player action: " + scene.action,
      "Write 1-2 sentences of third-person narration. Do not silently release a guard."
    ].join("\n\n");
    const response = await ask(prompt);
    // Conservative heuristic: report suspected violations, not proof of consistency.
    const suspect = scene.forbidden.test(response) && !/(?:cannot|can't|couldn't|fails?|unable|impossible|without releasing|still holding|blocked|prevented|refuses|doesn't|does not|not enough|occupied)/i.test(response);
    results.push({ scenario: scene.name, passed: !suspect, response, note: suspect ? "Potential contradiction (heuristic)" : "No obvious contradiction detected" });
    await wait(1200);
  }
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/gemini-physical-playtest.json", JSON.stringify({ model, results }, null, 2) + "\n");
  const lines = ["# Gemini physical continuity playtest", "", "Model: " + model, "", "| Scenario | Heuristic result |", "|---|---|",
    ...results.map((r) => "| " + r.scenario + " | " + (r.passed ? "No obvious contradiction" : "Review needed") + " |"),
    "", "This is a small live-model narration smoke test. Regex checks can produce false positives and false negatives.",
    "Inspect the JSON artifact for full responses. API credentials are never included."];
  writeFileSync("artifacts/gemini-physical-playtest.md", lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
}
main().catch((err) => { console.error(err instanceof Error ? err.message : "Unknown playtest error"); process.exitCode = 1; });
