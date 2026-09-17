import { useState } from "react";

export type ShuttleItem = {
  id: string;
  label: string;
  thumb?: string;
};

function Row({
  item,
  selected,
  onSelect,
  onMove
}: {
  item: ShuttleItem;
  selected: boolean;
  onSelect: () => void;
  onMove: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "shuttle__row is-on" : "shuttle__row"}
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onMove}
    >
      {item.thumb ? <img className="shuttle__thumb" src={item.thumb} alt="" /> : null}
      <span className="shuttle__label">{item.label}</span>
    </button>
  );
}

export function ShuttleList({
  leftHeading,
  rightHeading,
  leftEmpty,
  rightEmpty,
  left,
  right,
  onAdd,
  onRemove
}: {
  leftHeading: string;
  rightHeading: string;
  leftEmpty: string;
  rightEmpty: string;
  left: ShuttleItem[];
  right: ShuttleItem[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const canAdd = Boolean(leftId && left.some((item) => item.id === leftId));
  const canRemove = Boolean(rightId && right.some((item) => item.id === rightId));

  function add() {
    if (!leftId || !canAdd) return;
    onAdd(leftId);
    setLeftId(null);
    setRightId(leftId);
  }

  function remove() {
    if (!rightId || !canRemove) return;
    onRemove(rightId);
    setRightId(null);
    setLeftId(rightId);
  }

  return (
    <div className="shuttle">
      <div className="shuttle__col">
        <p className="shuttle__heading">{leftHeading}</p>
        <div className="shuttle__list" role="listbox" aria-label={leftHeading}>
          {left.length === 0 ? <p className="shuttle__empty">{leftEmpty}</p> : null}
          {left.map((item) => (
            <Row
              key={item.id}
              item={item}
              selected={item.id === leftId}
              onSelect={() => setLeftId(item.id)}
              onMove={() => {
                onAdd(item.id);
                setLeftId(null);
                setRightId(item.id);
              }}
            />
          ))}
        </div>
      </div>
      <div className="shuttle__actions">
        <button type="button" className="shuttle__move" disabled={!canAdd} onClick={add} aria-label="Add to campaign">
          Add <span aria-hidden="true">&gt;</span>
        </button>
        <button type="button" className="shuttle__move" disabled={!canRemove} onClick={remove} aria-label="Remove from campaign">
          <span aria-hidden="true">&lt;</span> Remove
        </button>
      </div>
      <div className="shuttle__col">
        <p className="shuttle__heading">{rightHeading}</p>
        <div className="shuttle__list" role="listbox" aria-label={rightHeading}>
          {right.length === 0 ? <p className="shuttle__empty">{rightEmpty}</p> : null}
          {right.map((item) => (
            <Row
              key={item.id}
              item={item}
              selected={item.id === rightId}
              onSelect={() => setRightId(item.id)}
              onMove={() => {
                onRemove(item.id);
                setRightId(null);
                setLeftId(item.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
