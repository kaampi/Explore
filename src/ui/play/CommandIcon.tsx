import type { CommandKind } from "../../game/catalog";

const PATHS: Record<CommandKind, string> = {
  // a speech bubble
  talk: "M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  // a small box
  item: "M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4m0 0 8-4m-8 4v8",
  // a magnifier
  look: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11.5L21 21",
  // a door
  door: "M6 3h12v18H6V3Zm9 9v.01",
  // an arrow
  move: "M5 12h14m-5-5 5 5-5 5",
  // crossed blades
  fight: "M5 19 19 5m-4 0h4v4M5 5l14 14m-4 0h4v-4",
};

/** A small drawing for a kind of choice. It only decorates: the words say what it is. */
export function CommandIcon({ kind }: { kind: CommandKind }) {
  return (
    <svg
      className="play-do__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[kind]} />
    </svg>
  );
}
