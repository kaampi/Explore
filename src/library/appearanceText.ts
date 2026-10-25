// A deterministic formatter for imported appearance lists, not an AI rewrite.
// Only known descriptive words are lowercased; names, numbers and prose survive.
const DESCRIPTION_WORDS = new Set((
  "short long medium straight curly wavy black brown blond blonde red auburn white grey gray silver blue green hazel amber golden dark light pale fair tan tanned smooth rough soft clear freckled scarred " +
  "small large medium flat round broad narrow slim slender muscular athletic petite tall thin stocky full very cute pretty handsome angular sharp oval square youthful mature " +
  "hair bangs fringe eyes eye skin face chest butt build shoulders waist hips nose lips ears beard mustache moustache freckles scars a an and with"
).split(" "));
const MODIFIERS: Record<string, string> = {
  small: "size", medium: "size", large: "size",
  flat: "shape", round: "shape", broad: "shape", narrow: "shape",
  slim: "build", slender: "build", muscular: "build", athletic: "build",
};

function splitList(text: string): string[] {
  const parts: string[] = [];
  let start = 0, depth = 0, quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') quoted = !quoted;
    if (quoted) continue;
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    // Keep C++, numeric quantities (5+ scars), and parenthetical text intact.
    if (c === "+" && !depth && !/[+\d]/.test(text[i - 1] ?? "") && !/[+\d]/.test(text[i + 1] ?? "")) {
      parts.push(text.slice(start, i)); start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
function knownFragment(text: string): boolean {
  const words = text.match(/[\p{L}]+/gu) ?? [];
  return words.length > 0 && words.every(word => DESCRIPTION_WORDS.has(word.toLowerCase())) && !/[.!?;\n]/.test(text);
}
function shape(text: string): { noun: string; modifiers: string[] } | null {
  const match = text.match(/^([a-z, ]+) (chest|butt|build|shoulders|waist|hips)$/);
  if (!match) return null;
  const modifiers = match[1]!.split(/[, ]+/).filter(Boolean);
  return modifiers.length && modifiers.every(word => MODIFIERS[word]) ? { noun: match[2]!, modifiers } : null;
}
function compatible(modifiers: string[]): boolean {
  const groups = new Map<string, string>();
  for (const word of modifiers) {
    const group = MODIFIERS[word]!;
    if (groups.has(group) && groups.get(group) !== word) return false;
    groups.set(group, word);
  }
  return true;
}
function sentence(parts: string[]): string {
  if (!parts.length) return "";
  const joined = parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  return joined.replace(/^\p{L}/u, letter => letter.toUpperCase()) + ".";
}
function article(text: string): string {
  return /\b(?:chest|butt|build|waist|face|nose|beard|mustache|moustache)$/.test(text) && !/^(?:a|an) /.test(text)
    ? `${/^[aeiou]/.test(text) ? "an" : "a"} ${text}` : text;
}

export function formatAppearanceList(source: string): string {
  const original = source.trim();
  const pieces = splitList(original);
  if (pieces.length < 2) return original; // Ordinary prose is not rewritten.
  const parts: string[] = [];
  for (const piece of pieces) {
    let text = piece.trim();
    if (!text) continue;
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
    if (knownFragment(text)) {
      text = text.toLowerCase().replace(/\s+/g, " ");
      text = text.replace(/^(short|long|medium),\s+(?=(?:black|brown|blond|blonde|red|white|grey|gray|silver) hair$)/, "$1 ");
    }
    if (parts.includes(text)) continue;
    const next = shape(text);
    const existing = next ? parts.findIndex(part => shape(part)?.noun === next.noun) : -1;
    if (next && existing >= 0) {
      const combined = [...new Set([...shape(parts[existing]!)!.modifiers, ...next.modifiers])];
      if (compatible(combined)) { parts[existing] = `${combined.join(", ")} ${next.noun}`; continue; }
    }
    parts.push(next && compatible(next.modifiers) ? `${next.modifiers.join(", ")} ${next.noun}` : text);
  }
  // Hair + bangs describe the same feature without adding an inferred trait.
  for (let i = 0; i < parts.length - 1; i++) {
    if (knownFragment(parts[i]!) && knownFragment(parts[i + 1]!) && /\bhair$/.test(parts[i]!) && /\b(?:bangs|fringe)$/.test(parts[i + 1]!)) {
      parts.splice(i, 2, `${parts[i]} with ${parts[i + 1]}`);
    }
  }
  if (parts.every(knownFragment)) {
    const body = parts.filter(part => shape(part));
    const other = parts.filter(part => !shape(part));
    return [sentence(other.map(article)), sentence(body.map(article))].filter(Boolean).join(" ");
  }
  // Unknown vocabulary may contain names or complete sentences. Use separators
  // without lowercasing it, reordering it, or guessing what it describes.
  return parts.join("; ").replace(/^\p{L}/u, letter => letter.toUpperCase()).replace(/([^.!?])$/, "$1.");
}
