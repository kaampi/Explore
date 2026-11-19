import type { KeyboardEvent, ReactNode } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import type { PersonCard } from "./personCard";

function Face({ card, small = false }: { card: PersonCard; small?: boolean }) {
  return card.portrait ? (
    <img
      className={`play-person__face${small ? " play-person__face--small" : ""}`}
      src={card.portrait}
      alt=""
    />
  ) : (
    <span
      className={`play-person__face play-person__monogram${small ? " play-person__face--small" : ""}`}
      aria-hidden="true"
    >
      {card.initials}
    </span>
  );
}

/**
 * The left column: the picture of the place, the card of the person in focus, a tab for everyone
 * who is here, and a button that folds the column to a narrow strip. The person chosen is the one
 * the player talks to.
 */
export function PeopleColumn({
  sceneName,
  backdrop,
  cards,
  statuses,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: {
  sceneName: string;
  backdrop: ReactNode;
  cards: PersonCard[];
  /** A word about someone who is not just standing there: hostile, hurt, and so on. */
  statuses: Record<string, string>;
  selectedId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const t = useTranslate();
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];
  const move = (event: KeyboardEvent, index: number) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft"
    )
      return;
    event.preventDefault();
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = cards[(index + step + cards.length) % cards.length]!;
    onSelect(next.id);
    document.getElementById(`play-person-tab-${next.id}`)?.focus();
  };
  const tabs = (
    <div
      className="play-people__tabs"
      role="tablist"
      aria-label={t("pvPersonTabs")}
      aria-orientation={collapsed ? "vertical" : "horizontal"}
    >
      {cards.map((card, index) => (
        <button
          key={card.id}
          type="button"
          role="tab"
          id={`play-person-tab-${card.id}`}
          className="play-people__tab"
          aria-selected={card.id === selected?.id}
          aria-controls="play-person-card"
          tabIndex={card.id === selected?.id ? 0 : -1}
          title={collapsed ? card.name : undefined}
          aria-label={collapsed ? card.name : undefined}
          onClick={() => onSelect(card.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {collapsed && <Face card={card} small />}
          {!collapsed && card.name}
        </button>
      ))}
    </div>
  );
  const toggle = (
    <button
      type="button"
      className="play-people__toggle"
      aria-expanded={!collapsed}
      onClick={onToggleCollapsed}
    >
      <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
      <span className={collapsed ? "visually-hidden" : undefined}>
        {collapsed ? t("pvShowPicture") : t("pvReducePicture")}
      </span>
    </button>
  );
  if (collapsed)
    return (
      <div className="play-people play-people--collapsed">
        <div
          className="play-view__scene play-view__scene--thumb"
          role="img"
          aria-label={`${t("pvScenePicture")}: ${sceneName}`}
        >
          {backdrop}
        </div>
        {tabs}
        {toggle}
      </div>
    );
  return (
    <div className="play-people">
      <div
        className={`play-view__scene${backdrop ? "" : " play-view__scene--empty"}`}
        role="img"
        aria-label={`${t("pvScenePicture")}: ${sceneName}`}
      >
        {backdrop}
        <p className="play-view__scene-name">{sceneName}</p>
      </div>
      {selected ? (
        <>
          {cards.length > 1 && tabs}
          <div
            className="play-person"
            id="play-person-card"
            role={cards.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={cards.length > 1 ? `play-person-tab-${selected.id}` : undefined}
          >
            <Face card={selected} />
            <div className="play-person__text">
              <h2 className="play-person__name">{selected.name}</h2>
              {statuses[selected.id] && (
                <span className="play-person__status">{statuses[selected.id]}</span>
              )}
              {selected.line && <p className="play-person__line">{selected.line}</p>}
              {selected.mood && <p className="play-person__mood">{selected.mood}</p>}
            </div>
          </div>
        </>
      ) : (
        <p className="play-people__empty">{t("pvNobodyHere")}</p>
      )}
      {toggle}
    </div>
  );
}
