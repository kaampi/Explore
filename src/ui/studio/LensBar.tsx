import { TAG_FILTER_ALL, TAG_FILTER_UNSORTED, type TagFilter } from "@library/objectFilter";

export function LensBar({
  filter,
  tags,
  onPick,
  lede = "Hides the shelf. Does not change who already belongs."
}: {
  filter: TagFilter;
  tags: string[];
  onPick: (filter: TagFilter) => void;
  lede?: string;
}) {
  return (
    <div className="lens-bar">
      <p className="shuttle__heading">Look for</p>
      <div className="setup-chips" role="list">
        <button
          type="button"
          className={filter === TAG_FILTER_ALL ? "setup-chip setup-chip--active" : "setup-chip"}
          onClick={() => onPick(TAG_FILTER_ALL)}
        >
          <span className="setup-chip__pick">All</span>
        </button>
        <button
          type="button"
          className={filter === TAG_FILTER_UNSORTED ? "setup-chip setup-chip--active" : "setup-chip"}
          onClick={() => onPick(TAG_FILTER_UNSORTED)}
        >
          <span className="setup-chip__pick">Unsorted</span>
        </button>
        {tags.map((tag) => (
          <button
            type="button"
            key={tag}
            className={filter === tag ? "setup-chip setup-chip--active" : "setup-chip"}
            onClick={() => onPick(tag)}
          >
            <span className="setup-chip__pick">{tag}</span>
          </button>
        ))}
      </div>
      <p className="inspector-empty" style={{ marginTop: 8, marginBottom: 0 }}>
        {lede}
      </p>
    </div>
  );
}
