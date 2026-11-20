import { useEffect, useRef, useState } from "react";
import type { Session } from "../../state/StateSchema";
import type { EncounterAction } from "../../game/EncounterSchema";
import { playerInventory, type InventoryEntry } from "../../session/playerInventory";
import { iconFor } from "../../library/itemIcons";
import { ItemCard } from "../play/ItemCard";
import { ItemIcon } from "../play/ItemIcon";
import { inventoryCard } from "../play/itemCardData";
import { ItemSlot, useOrnament } from "../play/ornament";
import { MenuButton, useContextMenu, type MenuItem } from "./Menu";
import { useTranslate } from "../i18n/LanguageProvider";
import "./playerInventory.css";

function InventoryIcon({ kind }: { kind: InventoryEntry["kind"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "weapon" ? (
        <>
          <path d="m5 19 13-13 1-4-4 1L2 16m0-4 10 10M7 17l-4 4" />
        </>
      ) : kind === "ammunition" ? (
        <>
          <path d="m4 20 16-16m-5 0h5v5M4 14v6h6" />
        </>
      ) : kind === "resource" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v10m3-8c-4-3-8 2-3 3s1 6-3 3" />
        </>
      ) : (
        <>
          <rect x="5" y="6" width="14" height="16" rx="4" />
          <path d="M9 6V4a3 3 0 0 1 6 0v2M5 12h14m-9 3h4" />
        </>
      )}
    </svg>
  );
}
export function PlayerInventory({
  session,
  busy = false,
  onAction,
  announce = true,
  onJournal,
}: {
  session: Session;
  busy?: boolean;
  onAction?: (action: EncounterAction) => void;
  /** Say "Added to inventory" in words. The play view says it with its own marks instead. */
  announce?: boolean;
  /** Keeps a thing in the journal. Without it the menu of a thing has no such row. */
  onJournal?: (text: string) => void;
}) {
  const t = useTranslate();
  const [tab, setTab] = useState<"things" | "notes">("things");
  const entries = playerInventory(session),
    signature = JSON.stringify(entries.map((e) => [e.key, e.quantity]));
  const previous = useRef({ sessionId: session.id, entries }),
    [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = { sessionId: session.id, entries };
    if (before.sessionId !== session.id) {
      setMessage("");
      setRecent([]);
      setSelected(null);
      return;
    }
    const gained = entries.filter(
        (e) => e.quantity > (before.entries.find((old) => old.key === e.key)?.quantity ?? 0),
      ),
      lost = before.entries.filter(
        (e) => e.quantity > (entries.find((now) => now.key === e.key)?.quantity ?? 0),
      );
    if (!gained.length && !lost.length) return;
    if (announce)
      setMessage(
        gained.length
          ? "Added to inventory: " + gained.map((e) => e.name).join(", ")
          : "Inventory updated: " + lost.map((e) => e.name).join(", "),
      );
    setRecent(gained.map((e) => e.key));
    const timer = window.setTimeout(() => {
      setMessage("");
      setRecent([]);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [session.id, signature]);
  useEffect(() => {
    if (selected && !entries.some((e) => e.key === selected)) setSelected(null);
  }, [selected, signature]);
  const item = entries.find((e) => e.key === selected);
  const count = entries.filter((e) => e.kind === "item" || e.kind === "weapon").length;
  const isNote = (entry: InventoryEntry) => !!entry.readableContent;
  const shown = entries.filter((entry) => (tab === "notes" ? isNote(entry) : !isNote(entry)));
  const notes = entries.filter(isNote).length;
  // Slots are only for show: empty ones fill the row, and there are at least three rows.
  const slotCount = Math.max(
    SLOT_ROWS_MIN * SLOT_COLUMNS,
    Math.ceil(shown.length / SLOT_COLUMNS) * SLOT_COLUMNS,
  );
  const { set } = useOrnament("slot");
  const tabNames = { things: t("icThings"), notes: set === "hull" ? t("icData") : t("icNotes") };
  return (
    <section className="player-inventory" aria-label="Player inventory">
      <div className="player-inventory__heading">
        <span className="player-inventory__title">
          <InventoryIcon kind="item" />
          <h3>Inventory</h3>
        </span>
        <span className="player-inventory__count">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>
      <div
        className="player-inventory__feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message && <span>{message}</span>}
      </div>
      <div className="player-inventory__tabs" role="tablist" aria-label="Player inventory">
        {(["things", "notes"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className="player-inventory__tab"
            onClick={() => setTab(name)}
          >
            {tabNames[name]}
            {name === "notes" && notes > 0 && <small> {notes}</small>}
          </button>
        ))}
      </div>
      {!entries.length && (
        <p className="player-inventory__empty">
          Your inventory is empty. Items you collect will appear here.
        </p>
      )}
      <ul className="player-inventory__grid" role="tabpanel">
        {shown.map((entry) => (
          <li key={entry.key}>
            <Slot
              entry={entry}
              fresh={recent.includes(entry.key)}
              session={session}
              busy={busy}
              onOpen={() => setSelected(entry.key)}
              onAction={onAction}
              onJournal={onJournal}
            />
          </li>
        ))}
        {Array.from({ length: slotCount - shown.length }, (_, index) => (
          <li key={`empty-${index}`} className="player-inventory__empty-slot" aria-hidden="true" />
        ))}
      </ul>
      {item && (
        <ItemCard
          card={inventoryCard(session, item)}
          busy={busy}
          onClose={() => setSelected(null)}
          {...(onAction ? { onAction } : {})}
          {...(onJournal ? { onJournal } : {})}
        />
      )}
    </section>
  );
}

const SLOT_COLUMNS = 5;
const SLOT_ROWS_MIN = 3;

/** One compartment of the pack: its picture and name, and the same menu by right click as by the button. */
function Slot({
  entry,
  fresh,
  session,
  busy,
  onOpen,
  onAction,
  onJournal,
}: {
  entry: InventoryEntry;
  fresh: boolean;
  session: Session;
  busy: boolean;
  onOpen: () => void;
  onAction: ((action: EncounterAction) => void) | undefined;
  onJournal: ((text: string) => void) | undefined;
}) {
  const t = useTranslate();
  const card = inventoryCard(session, entry);
  const items: MenuItem[] = [
    { label: t("icInspect", { name: entry.name }), onSelect: onOpen },
    ...card.actions.map((choice) => ({
      label: choice.label,
      disabled: busy || !!choice.blocked || !onAction,
      ...(choice.blocked ? { reason: choice.blocked } : {}),
      onSelect: () => onAction?.(choice.action),
    })),
    ...(onJournal
      ? [
          {
            label: t("icAddToJournal"),
            onSelect: () =>
              onJournal(
                entry.readableContent ??
                  `${entry.name}${entry.description ? `: ${entry.description}` : ""}`,
              ),
          },
        ]
      : []),
  ];
  const context = useContextMenu(entry.name, items);
  return (
    <>
      <ItemSlot
        className={"player-inventory__item" + (fresh ? " player-inventory__item--new" : "")}
        aria-label={"Inspect " + entry.name}
        aria-haspopup="dialog"
        onClick={onOpen}
        {...context.bind}
      >
        <span className="player-inventory__icon">
          <ItemIcon name={iconFor(entry)} size={26} />
        </span>
        <span className="player-inventory__name">
          {entry.name}
          {entry.container && <small>In {entry.container}</small>}
        </span>
        {entry.kind === "ammunition" || entry.kind === "resource" ? (
          <span className="player-inventory__quantity">{entry.quantity}</span>
        ) : (
          fresh && <span className="player-inventory__new">New</span>
        )}
      </ItemSlot>
      {context.menu}
      <MenuButton
        label={`${entry.name}: ${t("icMore")}`}
        items={items}
        className="player-inventory__more"
      />
    </>
  );
}
