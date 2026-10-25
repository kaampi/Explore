import { extractSillyTavernJsonFromPng } from "@library/sillyTavernImport";
import { LorebookSchema, type Lorebook, type LoreEntry } from "./LorebookSchema";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : []; }
const active = (value: unknown) => value !== undefined && value !== null && value !== false && value !== 0 && value !== "";

/** Pure, deliberately conservative adapter. It never changes Sandbox's matcher. */
export function importLorebook(raw: unknown, sourceName: string): Lorebook {
  const root = record(raw);
  if (!root) throw new Error("This file is not a lorebook.");
  const data = record(root.data);
  const embedded = record(data?.character_book) ?? record(root.character_book);
  const book = embedded ?? (root.spec === "lorebook_v3" ? data : root);
  if (!book || !(Array.isArray(book.entries) || record(book.entries))) throw new Error("No lorebook entries were found in this file.");
  const entries = Array.isArray(book.entries) ? book.entries : Object.values(record(book.entries)!);
  if (entries.length > 5000) throw new Error("This lorebook has more than 5,000 entries. Split it into smaller books.");
  const native = !Array.isArray(book.entries);
  const globalReasons: string[] = [];
  if (root.spec && !["chara_card_v2", "chara_card_v3", "lorebook_v3"].includes(String(root.spec))) globalReasons.push("Unrecognized source format version.");
  if (Object.keys(record(book.extensions) ?? {}).length) globalReasons.push("Book-level extensions need manual adaptation.");
  if (book.recursive_scanning === true) globalReasons.push("Recursive activation is not supported.");
  const result: LoreEntry[] = entries.map((rawEntry, index) => {
    const e = record(rawEntry);
    if (!e) return { id: String(index), title: `Entry ${index + 1}`, content: "", keywords: [], mode: "dormant", reasons: ["Invalid entry; original data retained."], approved: false, raw: rawEntry };
    const ext = record(e.extensions) ?? {};
    const reasons = [...globalReasons];
    if (e.extensions !== undefined && !record(e.extensions)) reasons.push("Invalid entry extensions.");
    const known = new Set(["uid", "id", "key", "keys", "keysecondary", "secondary_keys", "comment", "name", "content", "constant", "selective", "order", "insertion_order", "priority", "position", "disable", "enabled", "addMemo", "displayIndex", "caseSensitive", "case_sensitive", "matchWholeWords", "use_regex", "extensions", "excludeRecursion", "preventRecursion", "delayUntilRecursion", "probability", "useProbability", "depth", "selectiveLogic", "outletName", "group", "groupOverride", "groupWeight", "scanDepth", "useGroupScoring", "automationId", "role", "vectorized", "sticky", "cooldown", "delay", "matchPersonaDescription", "matchCharacterDescription", "matchCharacterPersonality", "matchCharacterDepthPrompt", "matchScenario", "matchCreatorNotes", "triggers", "ignoreBudget", "characterFilter"]);
    const knownExtensions = new Set(["position", "display_index", "case_sensitive", "match_whole_words", "exclude_recursion", "prevent_recursion", "delay_until_recursion", "probability", "useProbability", "depth", "selectiveLogic", "outlet_name", "group", "group_override", "group_weight", "scan_depth", "use_group_scoring", "automation_id", "role", "vectorized", "sticky", "cooldown", "delay", "match_persona_description", "match_character_description", "match_character_personality", "match_character_depth_prompt", "match_scenario", "match_creator_notes", "triggers", "ignore_budget"]);
    for (const key of Object.keys(e)) if (!known.has(key)) reasons.push(`Unrecognized source field: ${key}.`);
    for (const key of Object.keys(ext)) if (!knownExtensions.has(key)) reasons.push(`Unrecognized extension: ${key}.`);
    const keys = strings(native ? e.key : e.keys);
    if (Array.isArray(native ? e.key : e.keys) && (native ? e.key as unknown[] : e.keys as unknown[]).some(key => typeof key !== "string")) reasons.push("Invalid keyword list.");
    const content = text(e.content);
    const disabled = native ? e.disable === true : e.enabled !== true;
    if (disabled) reasons.push("Disabled in the source.");
    if (!content.trim()) reasons.push("No text content.");
    if (e.constant !== undefined && typeof e.constant !== "boolean") reasons.push("Invalid constant flag.");
    if ((native && e.disable !== undefined && typeof e.disable !== "boolean") || (!native && typeof e.enabled !== "boolean")) reasons.push("Invalid enabled flag.");
    if (e.constant !== true && (!Array.isArray(native ? e.key : e.keys) || keys.length === 0)) reasons.push("No usable activation keywords; never treated as always active.");
    const secondary = native ? e.keysecondary : e.secondary_keys;
    if (e.selective !== undefined && typeof e.selective !== "boolean") reasons.push("Invalid selective flag.");
    if (secondary !== undefined && (!Array.isArray(secondary) || secondary.some(key => typeof key !== "string"))) reasons.push("Invalid secondary-key list.");
    if (e.selective === true && strings(secondary).length) reasons.push("Secondary-key conditions are not supported.");
    if (e.use_regex === true || keys.some(key => /^\/.+\/[a-z]*$/i.test(key))) reasons.push("Regex activation is not supported.");
    const caseSensitive = native ? e.caseSensitive : e.case_sensitive ?? ext.case_sensitive;
    if (caseSensitive !== undefined && caseSensitive !== null && typeof caseSensitive !== "boolean") reasons.push("Invalid case sensitivity flag.");
    if (caseSensitive === true) reasons.push("Case-sensitive activation is not supported.");
    const value = (nativeName: string, extensionName: string) => e[nativeName] ?? ext[extensionName];
    if (value("useProbability", "useProbability") !== false && value("probability", "probability") !== undefined && value("probability", "probability") !== 100) reasons.push("Probability activation is not supported.");
    const unsupported: [string, string, string][] = [
      ["sticky", "sticky", "Sticky activation"], ["cooldown", "cooldown", "Cooldown"], ["delay", "delay", "Delayed activation"],
      ["vectorized", "vectorized", "Vector retrieval"], ["group", "group", "Inclusion groups"],
      ["delayUntilRecursion", "delay_until_recursion", "Recursion-only activation"], ["outletName", "outlet_name", "Prompt outlets"],
      ["automationId", "automation_id", "Automation"],
      ["matchPersonaDescription", "match_persona_description", "Persona scanning"], ["matchCharacterDescription", "match_character_description", "Character scanning"],
      ["matchCharacterPersonality", "match_character_personality", "Personality scanning"], ["matchScenario", "match_scenario", "Scenario scanning"],
      ["matchCreatorNotes", "match_creator_notes", "Creator-note scanning"], ["matchCharacterDepthPrompt", "match_character_depth_prompt", "Character-note scanning"],
    ];
    for (const [field, extension, label] of unsupported) if (active(value(field, extension))) reasons.push(`${label} is not supported.`);
    const characterFilter = record(e.characterFilter);
    const emptyCharacterFilter = characterFilter && Object.keys(characterFilter).every(key => ["isExclude", "names", "tags"].includes(key)) &&
      [characterFilter.names, characterFilter.tags].every(list => list === undefined || Array.isArray(list) && list.length === 0);
    if (strings(value("triggers", "triggers")).length || active(e.characterFilter) && !emptyCharacterFilter) reasons.push("Source-specific activation filters are not supported.");
    const position = native ? e.position : ext.position ?? e.position;
    if (position !== undefined && ![0, 1, "before_char", "after_char"].includes(position as string | number)) reasons.push("This prompt insertion position is not supported.");
    if (e.role !== undefined && e.role !== 0 || ext.role !== undefined && ext.role !== 0) reasons.push("This message role is not supported.");
    if (content.includes("{{") || /^\s*@@/m.test(content)) reasons.push("Macros or decorators need manual adaptation.");
    return {
      id: `${index}:${text(e.uid ?? e.id) || String(e.uid ?? e.id ?? index)}`,
      title: text(e.comment) || text(e.name) || `Entry ${index + 1}`,
      content,
      keywords: keys,
      mode: reasons.length ? "dormant" : e.constant === true ? "always" : "keywords",
      reasons,
      approved: false,
      raw: rawEntry,
    };
  });
  return LorebookSchema.parse({ id: crypto.randomUUID(), name: text(book.name).trim() || sourceName.replace(/\.[^.]+$/, "") || "Imported lore", sourceName, importedAt: new Date().toISOString(), raw, binding: { kind: "none", targetId: "" }, entries: result });
}

export async function readLorebookFile(file: File): Promise<Lorebook> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a lorebook or character card under 20 MB.");
  const png = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  const raw: unknown = png ? await extractSillyTavernJsonFromPng(new Uint8Array(await file.arrayBuffer())) : JSON.parse(await file.text());
  return importLorebook(raw, file.name);
}

/** A malformed embedded book must not prevent importing the character itself. */
export function importEmbeddedLore(raw: unknown, sourceName: string): Lorebook {
  try { return importLorebook(raw, sourceName); }
  catch (err) {
    return LorebookSchema.parse({ id: crypto.randomUUID(), name: sourceName, sourceName,
      importedAt: new Date().toISOString(), raw, binding: { kind: "none", targetId: "" },
      entries: [{ id: "unreadable", title: "Unreadable embedded lore", content: "", keywords: [], mode: "dormant", approved: false, raw,
        reasons: [err instanceof Error ? err.message : "Invalid embedded lore."] }],
    });
  }
}
