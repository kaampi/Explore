import type { ItemIcon as IconName } from "../../library/itemIcons";

const PATHS: Record<IconName, string> = {
  sword: "m5 19 13-13 1-4-4 1L2 16m0-4 10 10M7 17l-4 4",
  dagger: "m14 3 7 7-9 9-3-3 3-3-5-5 3-3 3 3zm-7 14-4 4",
  key: "M15 9a4 4 0 1 1-4 4m0 0L3 21m5-3 2 2m-4-4 2 2",
  letter: "M4 5h16v14H4zm0 1 8 7 8-7",
  lantern: "M9 3h6M8 6h8l1 3v8l-2 3H9l-2-3V9zm4 4v5m-4 0h8",
  rope: "M5 6c4-3 8 3 12 0M5 11c4-3 8 3 12 0M5 16c4-3 8 3 12 0M5 6v10m12-10v10",
  bottle: "M10 3h4m-3 0v5L7 12v8h10v-8l-4-4V3M7 14h10",
  ring: "M12 21a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM9 7l3-4 3 4",
  bread: "M4 14c0-4 3-7 8-7s8 3 8 7v3H4zm4-3v2m4-3v3m4-2v2",
  card: "M3 6h18v12H3zm0 4h18M6 15h5",
  chip: "M7 7h10v10H7zm3-4v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4",
  tool: "M14 5a4 4 0 0 0 5 5l-9 9-4-4 9-9a4 4 0 0 0-1-1zM6 15l3 3",
  generic: "M5 6h14v13H5zm3-3h8v3H8z",
};

/** A thing's picture: a line drawing in the colour of the text, so every theme draws it its own way. */
export function ItemIcon({
  name,
  size = 24,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`item-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
