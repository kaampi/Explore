/**
 * The pictures a thing can have in the pack and on its info card. A fixed list, so that every
 * theme draws them the same way. The author chooses one for a thing; without a choice one is
 * taken from the thing's tags, and otherwise a neutral one.
 */
export const ITEM_ICONS = [
  "sword",
  "dagger",
  "key",
  "letter",
  "lantern",
  "rope",
  "bottle",
  "ring",
  "bread",
  "card",
  "chip",
  "tool",
  "generic",
] as const;
export type ItemIcon = (typeof ITEM_ICONS)[number];

/** Which tags suggest which picture, in the order they are tried. */
const TAG_ICONS: ReadonlyArray<readonly [RegExp, ItemIcon]> = [
  [/\b(sword|blade|saber|sabre|lightsaber)\b/, "sword"],
  [/\b(dagger|knife|dirk|shiv)\b/, "dagger"],
  [/\b(key|keycard|passkey)\b/, "key"],
  [/\b(letter|note|ledger|book|scroll|map|message|document|paper)\b/, "letter"],
  [/\b(lantern|lamp|torch|light)\b/, "lantern"],
  [/\b(rope|cord|chain)\b/, "rope"],
  [/\b(bottle|potion|flask|vial|drink)\b/, "bottle"],
  [/\b(ring|amulet|jewel|jewellery|relic)\b/, "ring"],
  [/\b(bread|food|meal|ration|fruit)\b/, "bread"],
  [/\b(card|badge|pass|ticket)\b/, "card"],
  [/\b(chip|data|drive|disk|circuit)\b/, "chip"],
  [/\b(tool|wrench|hammer|pick|lockpick|kit)\b/, "tool"],
];

/**
 * The picture for a thing: the one chosen, else one from its tags, else one from its name, and for
 * a weapon one from how it strikes (a sword, or a dagger for a knife), else the neutral one.
 */
export function iconFor(item: {
  icon?: string | undefined;
  tags?: readonly string[] | undefined;
  name?: string | undefined;
  weaponKind?: "melee" | "ranged" | undefined;
}): ItemIcon {
  if (item.icon && (ITEM_ICONS as readonly string[]).includes(item.icon))
    return item.icon as ItemIcon;
  const from = (text: string) => TAG_ICONS.find(([pattern]) => pattern.test(text))?.[1];
  const byTags = from((item.tags ?? []).join(" ").toLowerCase());
  if (byTags) return byTags;
  const byName = from((item.name ?? "").toLowerCase());
  if (byName) return byName;
  if (item.weaponKind === "melee") return "sword";
  if (item.weaponKind === "ranged") return "tool";
  return "generic";
}

/** Whether a thing is magical: it has the tag `magic`. Shown as a word, never as a colour. */
export function isMagic(item: { tags?: readonly string[] | undefined }): boolean {
  return (item.tags ?? []).some((tag) => tag.trim().toLowerCase() === "magic");
}

/** What a library thing adds to the item it becomes in a scene: its picture and its tags. */
export function itemExtras(object: {
  icon?: string | undefined;
  tags?: readonly string[] | undefined;
}): { icon?: string; tags?: string[] } {
  return {
    ...(object.icon ? { icon: object.icon } : {}),
    ...(object.tags?.length ? { tags: [...object.tags] } : {}),
  };
}
