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
/**
 * The theme in use for a conversation. One the player has set for it stays. A game seen for the
 * first time takes the look its author gave it, if it has one; otherwise the player's own default.
 * The player's default is never replaced by an author's theme.
 */
export function activatePlayTheme(
  library: ThemeLibrary,
  conversationId: string | null,
  authorTheme?: PlayTheme,
): ThemeLibrary {
  const fallback = library.defaultPlay ?? library.active;
  const theme = conversationId
    ? (library.conversations[conversationId] ?? authorTheme ?? fallback)
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
