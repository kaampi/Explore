import brush from "./map-tools/brush.svg?raw";
import connectEntities from "./map-tools/connect-entities.svg?raw";
import editNodes from "./map-tools/edit-nodes.svg?raw";
import selectMove from "./map-tools/select-move.svg?raw";

const ICONS: Record<string, string> = {
  "brush.svg": brush,
  "connect-entities.svg": connectEntities,
  "edit-nodes.svg": editNodes,
  "select-move.svg": selectMove,
};

/**
 * A picture on a map tool button. The drawing is inline, in `currentColor`, so it follows the
 * button's text colour and turns plum on the chosen tool, in both the light and the dark mode.
 * The files are our own, bundled with the app.
 */
export function MapToolIcon({ name }: { name: string }) {
  const svg = ICONS[name];
  if (!svg) return null;
  return (
    <span
      className="world-map__tool-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
