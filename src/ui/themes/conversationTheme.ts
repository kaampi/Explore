import type { PlayTheme, ThemeLibrary } from "./theme";

export function removeConversationTheme(library: ThemeLibrary, id: string): ThemeLibrary {
  const conversations = { ...library.conversations };
  delete conversations[id];
  return { ...library, conversations };
}

export function applyPlayTheme(
  library: ThemeLibrary,
  theme: PlayTheme,
  conversationId: string | null,
): ThemeLibrary {
  return {
    ...library,
    active: { ...theme },
    ...(conversationId
      ? {
          conversations: {
            ...library.conversations,
            [conversationId]: { ...theme },
          },
        }
      : { defaultPlay: { ...theme } }),
  };
}
export function activatePlayTheme(
  library: ThemeLibrary,
  conversationId: string | null,
): ThemeLibrary {
  const fallback = library.defaultPlay ?? library.active;
  const theme = conversationId
    ? (library.conversations[conversationId] ?? fallback)
    : fallback;
  return {
    ...library,
    defaultPlay: { ...fallback },
    active: { ...theme },
    ...(conversationId
      ? {
          conversations: {
            ...library.conversations,
            [conversationId]: { ...theme },
          },
        }
      : {}),
  };
}
