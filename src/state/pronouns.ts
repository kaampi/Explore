export const BUILTIN_PRONOUNS = ["she", "he", "it"] as const;
export type BuiltinPronoun = (typeof BUILTIN_PRONOUNS)[number];

export function isBuiltinPronoun(value: string): value is BuiltinPronoun {
  return value === "she" || value === "he" || value === "it";
}

export function normalizePronoun(raw: string): string {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  if (key === "she" || key === "he" || key === "it" || key === "they") return key;
  return trimmed;
}

export type PronounForms = {
  they: string;
  them: string;
  their: string;
  theirs: string;
  themselves: string;
  subject: string;
  object: string;
  possessive: string;
};

export function pronounForms(pronoun?: string): PronounForms | undefined {
  if (!pronoun) return undefined;
  if (pronoun === "she") {
    return {
      they: "she",
      them: "her",
      their: "her",
      theirs: "hers",
      themselves: "herself",
      subject: "she",
      object: "her",
      possessive: "her"
    };
  }
  if (pronoun === "he") {
    return {
      they: "he",
      them: "him",
      their: "his",
      theirs: "his",
      themselves: "himself",
      subject: "he",
      object: "him",
      possessive: "his"
    };
  }
  if (pronoun === "it") {
    return {
      they: "it",
      them: "it",
      their: "its",
      theirs: "its",
      themselves: "itself",
      subject: "it",
      object: "it",
      possessive: "its"
    };
  }
  if (pronoun === "they") {
    return {
      they: "they",
      them: "them",
      their: "their",
      theirs: "theirs",
      themselves: "themselves",
      subject: "they",
      object: "them",
      possessive: "their"
    };
  }
  return {
    they: pronoun,
    them: pronoun,
    their: `${pronoun}'s`,
    theirs: `${pronoun}'s`,
    themselves: pronoun,
    subject: pronoun,
    object: pronoun,
    possessive: `${pronoun}'s`
  };
}

export function pronounLabel(id: string): string {
  if (id === "she") return "She";
  if (id === "he") return "He";
  if (id === "it") return "It";
  if (id === "they") return "They";
  return id;
}
