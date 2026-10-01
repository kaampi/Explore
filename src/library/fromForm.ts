import type { CharacterDraft } from "@session/createSession";
import {
  deriveStoryTitle,
  newCharacterTemplate,
  newPlaceTemplate,
  newStoryTemplate,
  newVoiceTemplate,
  nowIso,
  type CharacterTemplate,
  type LibrarySource,
  type PlaceTemplate,
  type StoryTemplate,
  type VoiceTemplate
} from "./LibrarySchema";
import { namesFromStored } from "./personName";

export function characterDraftFromTemplate(template: CharacterTemplate): CharacterDraft {
  const names = namesFromStored(template.name, template.familyName, template.middleName);
  return {
    name: names.given,
    ...(names.family ? { familyName: names.family } : {}),
    ...(names.middle ? { middleName: names.middle } : {}),
    ...(typeof template.approximateAge === "number" ? { approximateAge: template.approximateAge } : {}),
    personality: template.personality,
    mood: template.mood,
    position: "",
    libraryId: template.id,
    saveToLibrary: false,
    source: template.source,
    scenario: template.scenario,
    createdAt: template.createdAt,
    ...(template.pronoun ? { pronoun: template.pronoun } : {}),
    ...(template.appearance?.trim() ? { appearance: template.appearance } : {}),
    ...(template.portraitDataUrl ? { portraitDataUrl: template.portraitDataUrl } : {}),
    lore: []
  };
}

export function characterTemplateFromDraft(draft: CharacterDraft): CharacterTemplate | null {
  const name = draft.name.trim();
  if (!name || draft.saveToLibrary === false) return null;

  const source: LibrarySource = draft.source ?? "player";

  if (draft.libraryId) {
    return newCharacterTemplate({
      id: draft.libraryId,
      name,
      personality: draft.personality,
      mood: draft.mood,
      position: "",
      scenario: draft.scenario ?? "",
      source,
      ...(draft.pronoun ? { pronoun: draft.pronoun } : {}),
      familyName: (draft.familyName ?? "").trim(),
      middleName: (draft.middleName ?? "").trim(),
      ...(typeof draft.approximateAge === "number" ? { approximateAge: draft.approximateAge } : {}),
      appearance: draft.appearance ?? "",
      ...(draft.portraitDataUrl ? { portraitDataUrl: draft.portraitDataUrl } : {}),
      lore: (draft.lore ?? [])
        .filter((entry) => entry.content.trim())
        .map((entry, index) => ({
          id: entry.id?.trim() || `lore-${index + 1}`,
          title: entry.title ?? "",
          content: entry.content.trim(),
          keywords: entry.keywords ?? [],
          ...(entry.purpose ? { purpose: entry.purpose } : {})
        }))
    });
  }

  return newCharacterTemplate({
    name,
    personality: draft.personality,
    mood: draft.mood,
    position: "",
    scenario: draft.scenario ?? "",
    source,
    ...(draft.pronoun ? { pronoun: draft.pronoun } : {}),
    familyName: (draft.familyName ?? "").trim(),
    middleName: (draft.middleName ?? "").trim(),
    ...(typeof draft.approximateAge === "number" ? { approximateAge: draft.approximateAge } : {}),
    appearance: draft.appearance ?? "",
    ...(draft.portraitDataUrl ? { portraitDataUrl: draft.portraitDataUrl } : {}),
    lore: (draft.lore ?? [])
      .filter((entry) => entry.content.trim())
      .map((entry, index) => ({
        id: entry.id?.trim() || `lore-${index + 1}`,
        title: entry.title ?? "",
        content: entry.content.trim(),
        keywords: entry.keywords ?? [],
        ...(entry.purpose ? { purpose: entry.purpose } : {})
      }))
  });
}

export function placeTemplateFromForm(fields: {
  saveToLibrary: boolean;
  libraryId?: string;
  name: string;
  lighting: string;
  noise: string;
  music: boolean;
  note: string;
  brief?: string;
  source?: LibrarySource;
}): PlaceTemplate | null {
  const name = fields.name.trim();
  if (!name || !fields.saveToLibrary) return null;

  const source: LibrarySource = fields.source ?? "player";
  if (fields.libraryId) {
    return newPlaceTemplate({
      id: fields.libraryId,
      name,
      lighting: fields.lighting,
      noise: fields.noise,
      music: fields.music,
      note: fields.note,
      ...(fields.brief?.trim() ? { brief: fields.brief.trim() } : {}),
      source
    });
  }

  return newPlaceTemplate({
    name,
    lighting: fields.lighting,
    noise: fields.noise,
    music: fields.music,
    note: fields.note,
    ...(fields.brief?.trim() ? { brief: fields.brief.trim() } : {}),
    source
  });
}

export function storyTemplateFromForm(fields: {
  saveToLibrary: boolean;
  libraryId?: string;
  title: string;
  premise: string;
  source?: LibrarySource;
}): StoryTemplate | null {
  const premise = fields.premise.trim();
  if (!premise || !fields.saveToLibrary) return null;

  const name = deriveStoryTitle(fields.title, premise);
  const source: LibrarySource = fields.source ?? "player";
  if (fields.libraryId) {
    return newStoryTemplate({
      id: fields.libraryId,
      name,
      premise,
      source
    });
  }

  return newStoryTemplate({
    name,
    premise,
    source
  });
}

export function voiceTemplateFromForm(fields: {
  saveToLibrary: boolean;
  libraryId?: string;
  title: string;
  instruction: string;
  source?: LibrarySource;
}): VoiceTemplate | null {
  const instruction = fields.instruction.trim();
  if (!instruction || !fields.saveToLibrary) return null;

  const name = deriveStoryTitle(fields.title, instruction);
  const source: LibrarySource = fields.source ?? "player";
  if (fields.libraryId) {
    return newVoiceTemplate({
      id: fields.libraryId,
      name,
      instruction,
      source
    });
  }

  return newVoiceTemplate({
    name,
    instruction,
    source
  });
}

/** Preserve createdAt when updating an existing library record. */
export function withOriginalTimestamps<T extends { createdAt: string; updatedAt: string }>(
  next: T,
  previous: { createdAt: string } | undefined
): T {
  if (!previous) return next;
  return { ...next, createdAt: previous.createdAt, updatedAt: nowIso() };
}

