/**
 * Archive names: given name is what narration uses; family name is identity.
 * First token = given, last token = family, anything between = middle.
 */

export type PersonName = { given: string; middle: string; family: string };

export function splitPersonName(full: string): PersonName {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { given: "", middle: "", family: "" };
  if (parts.length === 1) return { given: parts[0] ?? "", middle: "", family: "" };
  if (parts.length === 2) return { given: parts[0] ?? "", middle: "", family: parts[1] ?? "" };
  return {
    given: parts[0] ?? "",
    middle: parts.slice(1, -1).join(" "),
    family: parts[parts.length - 1] ?? ""
  };
}

/** Open a stored card: split a legacy single field if family/middle were never filled. */
export function namesFromStored(name: string, familyName?: string, middleName?: string): PersonName {
  const family = (familyName ?? "").trim();
  const middle = (middleName ?? "").trim();
  if (family || middle) return { given: name.trim(), middle, family };
  return splitPersonName(name);
}

export function formatPersonName(given: string, family?: string, middle?: string): string {
  return [given, middle, family].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

/** What the model should call them in ordinary narration. */
export function callName(given: string, family?: string, middle?: string): string {
  const first = given.trim();
  if (!first) return "";
  if ((family ?? "").trim() || (middle ?? "").trim()) return first;
  return splitPersonName(first).given;
}

/** Given, middle, family, and full name — for agency matching and prompt aliases. */
export function personNameTerms(given: string, family?: string, middle?: string): string[] {
  const stored = namesFromStored(given, family, middle);
  const called = callName(stored.given, stored.family, stored.middle);
  const full = formatPersonName(stored.given, stored.family, stored.middle);
  return [full, called, stored.given, stored.middle, stored.family];
}
