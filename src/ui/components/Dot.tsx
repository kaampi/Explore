type DotKind = "locked" | "active" | "ai" | "player" | "inactive";

export function Dot({ kind, title }: { kind: DotKind; title?: string }) {
  return <span className={`tally-dot tally-dot--${kind}`} title={title} aria-hidden="true" />;
}
