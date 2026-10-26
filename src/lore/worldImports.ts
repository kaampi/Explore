import { importAventurasLorebook } from "./aventurasImport";
import { importAventurasOther } from "./aventurasOtherImport";
import { extractSillyTavernJsonFromPng } from "@library/sillyTavernImport";
import { importLorebook } from "./sillyTavernLore";
import { LorebookSchema, type Lorebook, type LoreEntry } from "./LorebookSchema";

export type ImportFormat = "auto" | "ai-dungeon" | "onlyworlds" | "azgaar" | "aventuras" | "sillytavern";
export const IMPORT_FORMAT_LABELS = {
  auto: "Detect automatically", "ai-dungeon": "AI Dungeon Story Cards", onlyworlds: "OnlyWorlds world JSON",
  azgaar: "Azgaar Full / Minimal JSON", aventuras: "Aventuras exchange JSON", sillytavern: "SillyTavern / V2 / V3 lore",
};
const rec = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (v: unknown): string => typeof v === "string" ? v : "";
const sourceId = (v: unknown) => typeof v === "string" || typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const label = (key: string) => key.replace(/_/g, " ");
function checkCount(count: number) { if (count > 5000) throw new Error("Import at most 5,000 entries at a time. Export a smaller collection."); }
function unsafeText(content: string) { return content.includes("{{") || /^\s*@@/m.test(content); }
function makeEntry(id: string, title: string, content: string, keywords: string[], raw: unknown, reasons: string[], entity?: LoreEntry["entity"]): LoreEntry {
  if (!content.trim()) reasons.push("No usable text content.");
  if (!keywords.length) reasons.push("No usable keywords; never treated as always active.");
  if (keywords.some(k => /^\/.+\/[a-z]*$/i.test(k)) || unsafeText(content)) reasons.push("Macros, regex or decorators need manual adaptation.");
  return LorebookSchema.shape.entries.element.parse({ id, title, content, keywords, raw, reasons, approved: false, mode: reasons.length ? "dormant" : "keywords", ...(entity ? { entity } : {}) });
}
function book(raw: unknown, sourceName: string, name: string, entries: LoreEntry[], origin: NonNullable<Lorebook["origin"]>, importNotes: string[]): Lorebook {
  checkCount(entries.length);
  return LorebookSchema.parse({ id: crypto.randomUUID(), name: (name.trim() || sourceName.replace(/\.[^.]+$/, "") || "Imported world").slice(0, 200), sourceName,
    importedAt: new Date().toISOString(), raw, entries, origin, importNotes, binding: { kind: "none", targetId: "" } });
}

export function importAIDungeon(raw: unknown, sourceName: string): Lorebook {
  if (!Array.isArray(raw)) throw new Error("AI Dungeon Story Cards must be a JSON array.");
  checkCount(raw.length);
  const entries = raw.map((item, i) => {
    const e = rec(item); const reasons: string[] = [];
    if (!e || typeof e.keys !== "string" || typeof e.value !== "string") reasons.push("Invalid Story Card: keys and value must be strings.");
    const keys = [...new Set(str(e?.keys).split(",").map(k => k.trim()).filter(Boolean))];
    const type = str(e?.type).toLowerCase();
    const title = str(e?.title).trim() || keys[0] || `Story Card ${i + 1}`;
    const known = new Set(["keys", "value", "type", "title", "description", "useForCharacterCreator", "useForCharacterCreation"]);
    for (const key of Object.keys(e ?? {})) if (!known.has(key)) reasons.push(`Unrecognized card field: ${key}.`);
    // Notes/description and Character Creator flags are retained, never promoted to lore or runtime settings.
    return makeEntry(`card:${i}`, title, str(e?.value), keys, item, reasons, {
      id: `card:${i}`, name: title, kind: type === "character" ? "character" : ["location", "place"].includes(type) ? "location" : "lore", category: type || "story-card",
    });
  });
  return book(raw, sourceName, "", entries, { format: "ai-dungeon" }, ["Only Story Cards are imported. Scenario scripts, instructions and adventure history are not part of this file. Card notes stay in the original."]);
}

const OW_CATEGORIES = new Set(["ability", "character", "collective", "construct", "creature", "event", "family", "institution", "language", "law", "location", "map", "marker", "narrative", "object", "phenomenon", "pin", "relation", "species", "title", "trait", "zone"]);
const OW_TEXT = ["description", "supertype", "subtype", "physicality", "mentality", "background", "motivations", "reputation", "form", "function", "political_climate", "customs", "infrastructure", "architecture", "defensibility", "summary", "significance", "social_effects", "physical_effects", "functional_effects", "personality_effects", "behaviour_effects"];
const OW_LINKS = ["location", "birthplace", "parent_location", "primary_power", "governing_title", "zone", "rival", "partner", "species", "traits", "abilities", "languages", "objects", "institutions", "family", "friends", "rivals", "populations", "secondary_powers", "founders", "cults", "delicacies", "extraction_methods", "extraction_goods", "industry_methods", "industry_goods", "extraction_markets", "industry_markets", "currencies", "buildings", "building_methods", "fighters", "defensive_objects", "anti_trait", "empowered_abilities"];

export function importOnlyWorlds(raw: unknown, sourceName: string): Lorebook {
  const root = rec(raw), world = rec(root?.world), elements = rec(root?.elements);
  if (root?.format !== "onlyworlds-world-export" || !world || !str(world.id).trim() || !elements) throw new Error("Choose an OnlyWorlds Export world JSON file with format, world.id and elements. Folder and API change-feed files are not supported here.");
  const rows: { category: string; value: unknown }[] = [];
  for (const [category, values] of Object.entries(elements)) {
    if (!Array.isArray(values)) throw new Error(`OnlyWorlds category ${category} must be an array.`);
    checkCount(rows.length + values.length);
    values.forEach(value => rows.push({ category, value }));
  }
  const counts = new Map<string, number>(); const names = new Map<string, string>();
  for (const { value } of rows) { const e = rec(value), id = str(e?.id); if (id) { counts.set(id, (counts.get(id) ?? 0) + 1); names.set(id, str(e?.name)); } }
  const entries = rows.map(({ category, value }, i) => {
    const e = rec(value), id = str(e?.id), name = str(e?.name).trim(); const reasons: string[] = [];
    if (!e || !id.trim() || !name) reasons.push("Element requires a source ID and a name.");
    if (!OW_CATEGORIES.has(category) || e?.type !== category) reasons.push("Unknown or inconsistent element category.");
    if (counts.get(id)! > 1) reasons.push("Duplicate source ID; references are ambiguous.");
    const links: { field: string; id: string; name: string }[] = [];
    const content = [`${name || "Unnamed element"} (${category})`];
    for (const key of OW_TEXT) if (str(e?.[key]).trim()) content.push(`${label(key)}: ${str(e?.[key])}`);
    for (const field of OW_LINKS) {
      const v = e?.[field]; const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && Boolean(x)) : typeof v === "string" && v ? [v] : [];
      for (const target of ids) links.push({ field, id: target, name: counts.get(target) === 1 ? names.get(target) || target : target });
      if (ids.length) content.push(`${label(field)}: ${ids.map(target => counts.get(target) === 1 && names.get(target) ? `${names.get(target)} [${target}]` : `[unresolved: ${target}]`).join(", ")}`);
    }
    const aliases = Array.isArray(e?.atlas_aliases) ? e.atlas_aliases.filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : [];
    return makeEntry(`${category}:${id || i}`, name || `Element ${i + 1}`, content.join("\n\n"), [...new Set([name, ...aliases].filter(Boolean))], value, reasons,
      { id: id || String(i), name: name || `Element ${i + 1}`, kind: category === "character" ? "character" : category === "location" ? "location" : "lore", category, links });
  });
  if (str(world.description).trim()) entries.unshift(makeEntry(`world:${str(world.id)}`, str(world.name) || "World overview", `${str(world.name)}\n\n${str(world.description)}`, str(world.name).trim() ? [str(world.name).trim()] : [], world, [], { id: str(world.id), name: str(world.name), kind: "lore", category: "world" }));
  return book(raw, sourceName, str(world.name), entries, { format: "onlyworlds", worldId: str(world.id), schemaVersion: str(root.schema_version) }, [
    "Named elements become keyword lore. Known descriptive fields and named references are included; other fields, external images, map geometry and game statistics stay in the original.",
    "Unknown categories, missing IDs/names and duplicate IDs remain dormant. References are kept as source IDs; unresolved references are labelled.",
  ]);
}

const AZ_CATEGORIES = ["states", "provinces", "burgs", "cultures", "religions", "rivers", "markers", "routes"] as const;
export function importAzgaar(raw: unknown, sourceName: string): Lorebook {
  const root = rec(raw), info = rec(root?.info), pack = rec(root?.pack);
  if (!info || !str(info.description).includes("Azgaar") || !str(info.description).includes("Fantasy") || !pack) throw new Error("Choose an Azgaar Full or Minimal JSON export. Pack/Grid cells, .map and GeoJSON files are not supported.");
  let total = 0;
  for (const key of AZ_CATEGORIES) { if (pack[key] !== undefined && !Array.isArray(pack[key])) throw new Error(`Azgaar ${key} must be an array.`); total += Array.isArray(pack[key]) ? pack[key].length : 0; }
  checkCount(total);
  const rows = AZ_CATEGORIES.flatMap(category => (Array.isArray(pack[category]) ? pack[category] as unknown[] : []).flatMap((value, index) => {
    if (value === 0 || value === null || rec(value)?.i === 0) return []; // generator sentinel / neutral entries
    return [{ category, value, index }];
  }));
  const names = new Map<string, string>(); const counts = new Map<string, number>();
  for (const { category, value } of rows) { const e = rec(value); const id = `${category}:${sourceId(e?.i)}`; counts.set(id, (counts.get(id) ?? 0) + 1); names.set(id, str(e?.fullName) || str(e?.name)); }
  const entries = rows.map(({ category, value, index }) => {
    const e = rec(value), id = sourceId(e?.i), name = (str(e?.fullName) || str(e?.name)).trim(); const reasons: string[] = [];
    if (!e || !id || !name || typeof e.i !== "number" || !Number.isInteger(e.i) || e.i < 1) reasons.push("Entry requires a positive source index and name.");
    if (e?.removed === true) reasons.push("Removed in the source map.");
    if (counts.get(`${category}:${id}`)! > 1) reasons.push("Duplicate source index.");
    const content = [`${name || "Unnamed map entry"} (${category})`];
    for (const field of ["note", "type", "form", "formName", "deity"]) if (str(e?.[field]).trim()) content.push(`${field}: ${str(e?.[field])}`);
    const links: { field: string; id: string; name: string }[] = [];
    for (const [field, targetCategory] of [["state", "states"], ["culture", "cultures"], ["religion", "religions"], ["capital", "burgs"]] as const) {
      if (category === "burgs" && field === "capital") { if (e?.capital === 1) content.push("Capital settlement: yes"); continue; }
      const targetId = sourceId(e?.[field]); if (!targetId || targetId === "0") continue;
      const key = `${targetCategory}:${targetId}`, target = counts.get(key) === 1 ? names.get(key) || targetId : targetId;
      links.push({ field: field!, id: key, name: target }); content.push(`${field}: ${target} [${key}]`);
    }
    // Source population is scaled by map settings; do not mislabel it as an actual head count.
    if (typeof e?.population === "number") content.push(`Source population value (unconverted): ${e.population}`);
    if (typeof e?.x === "number" && typeof e.y === "number") content.push(`Map coordinates: ${e.x}, ${e.y}`);
    return makeEntry(`${category}:${id || index}`, name || `Map entry ${index + 1}`, content.join("\n\n"), name ? [name] : [], value, reasons,
      { id: id || String(index), name: name || `Map entry ${index + 1}`, kind: ["states", "provinces", "burgs"].includes(category) ? "location" : "lore", category, links });
  });
  return book(raw, sourceName, str(info.mapName) || str(rec(root?.settings)?.mapName), entries,
    { format: "azgaar", worldId: sourceId(info.mapId), schemaVersion: str(info.version) }, [
      "Full/Minimal JSON imports named states, provinces, settlements, cultures, religions, rivers, markers and routes. Unsupported sections and unnamed rows remain in the original.",
      "Library places are a flat list. Borders, travel distances, polygons, economies and image assets are not recreated. Raw population values are not converted to people.",
    ]);
}

export function importWorldData(raw: unknown, sourceName: string, requested: ImportFormat = "auto"): Lorebook {
  const root = rec(raw); let format = requested;
  if (format === "auto") {
    if (Array.isArray(raw) && raw.some(v => { const e = rec(v); return e && ("keys" in e || "value" in e); })) format = "ai-dungeon";
    else if (root?.format === "aventuras-exchange") format = "aventuras";
    else if (root?.format === "onlyworlds-world-export") format = "onlyworlds";
    else if (str(rec(root?.info)?.description).includes("Azgaar")) format = "azgaar";
    else format = "sillytavern";
  }
  if (format === "ai-dungeon") return importAIDungeon(raw, sourceName);
  if (format === "onlyworlds") return importOnlyWorlds(raw, sourceName);
  if (format === "azgaar") return importAzgaar(raw, sourceName);
  if (format === "aventuras") return root?.entity === "lorebook" ? importAventurasLorebook(raw, sourceName) : importAventurasOther(raw, sourceName);
  return importLorebook(raw, sourceName);
}

export async function readWorldFile(file: File, format: ImportFormat = "auto"): Promise<Lorebook> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file under 20 MB. Azgaar Minimal JSON avoids the large geometry arrays.");
  const png = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  if (png && !["auto", "sillytavern"].includes(format)) throw new Error("Choose a JSON export for this format.");
  const raw: unknown = png ? await extractSillyTavernJsonFromPng(new Uint8Array(await file.arrayBuffer())) : JSON.parse(await file.text());
  return importWorldData(raw, file.name, format);
}
