import { z } from "zod";

/**
 * Reference cards: the picture an author makes of a character, with its facts and palette. The rules
 * are in docs/reference-card.sv.md. A card is never shown to the player, never sent to the story AI,
 * and never copied into a playing session. This file has the shapes and the pure rules for versions
 * and cards. It does not read or write anything.
 */

export const MAX_CARDS = 8;
export const MAX_VERSIONS = 6;

export const ReferenceFactsSchema = z.object({
  age: z.string().optional(),
  height: z.string().optional(),
  build: z.string().optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  skin: z.string().optional(),
  marks: z.string().optional(),
  other: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});
export type ReferenceFacts = z.infer<typeof ReferenceFactsSchema>;

export const PaletteColorSchema = z.object({
  role: z.enum(["skin", "hair", "eyes", "clothing", "other"]),
  label: z.string(),
  color: z.string(),
});
export type PaletteColor = z.infer<typeof PaletteColorSchema>;

export const CharacterReferenceSchema = z.object({
  version: z.number().int().positive(),
  basedOn: z.number().int().positive().optional(),
  createdAt: z.string(),
  imageDataUrl: z.string(),
  thumbDataUrl: z.string(),
  imageHash: z.string(),
  facts: ReferenceFactsSchema,
  palette: z.array(PaletteColorSchema).default([]),
  styleNote: z.string().optional(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("local") }),
    z.object({ kind: z.literal("codex"), revision: z.number().int().nonnegative() }),
  ]),
});
export type CharacterReference = z.infer<typeof CharacterReferenceSchema>;

export const CodexBaseSchema = z.object({
  revision: z.number().int().nonnegative(),
  imageHash: z.string(),
  facts: ReferenceFactsSchema,
  palette: z.array(PaletteColorSchema).default([]),
});
export type CodexBase = z.infer<typeof CodexBaseSchema>;

export const ReferenceCardSchema = z.object({
  cardId: z.string().min(1),
  name: z.string(),
  versions: z.array(CharacterReferenceSchema).default([]),
  activeVersion: z.number().int().positive(),
  latestVersion: z.number().int().nonnegative(),
  portraitDataUrl: z.string().optional(),
  codexBase: CodexBaseSchema.optional(),
  codexCardRef: z.string().optional(),
});
export type ReferenceCard = z.infer<typeof ReferenceCardSchema>;

/**
 * With cards, the default is always one of them. A missing or stale `defaultCardId` is put right
 * when the references are read: the first card becomes the default. Nothing else is changed.
 */
export const CharacterReferencesSchema = z
  .object({
    cards: z.array(ReferenceCardSchema).default([]),
    defaultCardId: z.string().default(""),
  })
  .transform((references) =>
    references.cards.length > 0 &&
    !references.cards.some((card) => card.cardId === references.defaultCardId)
      ? { ...references, defaultCardId: references.cards[0]!.cardId }
      : references,
  );
export type CharacterReferences = z.infer<typeof CharacterReferencesSchema>;

/** What an author saves as a version: everything but the numbers and the time, which are given here. */
export type CardDraft = Omit<CharacterReference, "version" | "basedOn" | "createdAt">;

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** A card with its first version. The active version is 1, and the latest number is 1. */
export function newReferenceCard(
  cardId: string,
  name: string,
  draft: CardDraft,
  now: string,
): ReferenceCard {
  return {
    cardId,
    name,
    versions: [{ ...draft, version: 1, createdAt: now }],
    activeVersion: 1,
    latestVersion: 1,
  };
}

/**
 * Adds a named card. The first card becomes the default. When a second card comes, the character's
 * ordinary portrait goes to the first card if that card has none of its own: the ordinary portrait
 * showed the only look there was.
 */
export function addReferenceCard(
  references: CharacterReferences | undefined,
  input: {
    cardId: string;
    name: string;
    draft: CardDraft;
    now: string;
    characterPortrait?: string;
  },
): Outcome<CharacterReferences> {
  const current: CharacterReferences = references ?? { cards: [], defaultCardId: "" };
  if (current.cards.length >= MAX_CARDS)
    return fail("A character can have up to 8 reference cards.");
  if (current.cards.some((card) => card.cardId === input.cardId))
    return fail("That card already exists.");
  const name = input.name.trim();
  if (!name) return fail("Name the card.");
  const card = newReferenceCard(input.cardId, name, input.draft, input.now);
  const cards = current.cards.map((item, index) =>
    index === 0 && current.cards.length === 1 && !item.portraitDataUrl && input.characterPortrait
      ? { ...item, portraitDataUrl: input.characterPortrait }
      : item,
  );
  return ok({
    cards: [...cards, card],
    defaultCardId: current.defaultCardId || input.cardId,
  });
}

/**
 * Saves a change to a card as a new version. The number is always the latest plus one, and the
 * version that was changed is recorded in `basedOn`. When six versions are already kept, the oldest
 * one that is not active would be removed: that is only done when the author has confirmed it. Without
 * confirmation nothing changes, and the caller keeps the draft.
 */
export function saveCardVersion(
  card: ReferenceCard,
  draft: CardDraft,
  now: string,
  options: { confirmPrune?: boolean } = {},
): { status: "saved"; card: ReferenceCard } | { status: "needs-prune"; oldest: number } {
  let versions = card.versions;
  if (versions.length >= MAX_VERSIONS) {
    const removable = versions
      .filter((item) => item.version !== card.activeVersion)
      .map((item) => item.version);
    const oldest = Math.min(...removable);
    if (!options.confirmPrune) return { status: "needs-prune", oldest };
    versions = versions.filter((item) => item.version !== oldest);
  }
  const version = card.latestVersion + 1;
  const saved: CharacterReference = {
    ...draft,
    version,
    basedOn: card.activeVersion,
    createdAt: now,
  };
  return {
    status: "saved",
    card: {
      ...card,
      versions: [saved, ...versions].sort((a, b) => b.version - a.version),
      activeVersion: version,
      latestVersion: version,
    },
  };
}

/** Choosing an older version makes it active. No new version, and nothing in it changes. */
export function chooseCardVersion(card: ReferenceCard, version: number): Outcome<ReferenceCard> {
  if (!card.versions.some((item) => item.version === version)) return fail("That version is gone.");
  return ok({ ...card, activeVersion: version });
}

/** The default card can be changed at any time. */
export function setDefaultCard(
  references: CharacterReferences,
  cardId: string,
): Outcome<CharacterReferences> {
  if (!references.cards.some((card) => card.cardId === cardId)) return fail("No such card.");
  return ok({ ...references, defaultCardId: cardId });
}

/**
 * Removes a card. The default cannot go while other cards exist: another default is chosen first.
 * Removing the last card removes the references altogether. Adventures that use the card are not
 * changed here; the caller shows them and goes back to the default when the author has confirmed.
 */
export function removeReferenceCard(
  references: CharacterReferences,
  cardId: string,
): Outcome<CharacterReferences | undefined> {
  if (!references.cards.some((card) => card.cardId === cardId)) return fail("No such card.");
  const rest = references.cards.filter((card) => card.cardId !== cardId);
  if (rest.length === 0) return ok(undefined);
  if (references.defaultCardId === cardId)
    return fail("Choose another default card before this one is removed.");
  return ok({ cards: rest, defaultCardId: references.defaultCardId });
}

export function renameReferenceCard(
  references: CharacterReferences,
  cardId: string,
  name: string,
): Outcome<CharacterReferences> {
  const trimmed = name.trim();
  if (!trimmed) return fail("Name the card.");
  if (!references.cards.some((card) => card.cardId === cardId)) return fail("No such card.");
  return ok({
    ...references,
    cards: references.cards.map((card) =>
      card.cardId === cardId ? { ...card, name: trimmed } : card,
    ),
  });
}
