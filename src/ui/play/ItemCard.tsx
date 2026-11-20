import { Modal } from "../components/Modal";
import { MenuButton, type MenuItem } from "../components/Menu";
import { useTranslate } from "../i18n/LanguageProvider";
import type { EncounterAction } from "../../game/EncounterSchema";
import { ItemIcon } from "./ItemIcon";
import { Frame, NamePlate, NoteCard } from "./ornament";
import type { ItemCardData } from "./itemCardData";
import "./play-view.css";

/** The word for what sort of thing it is, which is told in the line under the name. */
function useTypeWord(card: ItemCardData): string {
  const t = useTranslate();
  const kind = {
    item: t("icTypeThing"),
    weapon: t("icTypeWeapon"),
    ammunition: t("icTypeAmmunition"),
    resource: t("icTypeResource"),
  }[card.kind];
  return card.magic ? `${kind} · ${t("icMagic")}` : kind;
}

/**
 * The same card for a thing wherever it is opened: from the pack, from "Things here". A thing that
 * can be read opens as a note instead. The order is always: name and type, picture, description,
 * what it does, what the rules say, where it was found, and what can be done with it.
 */
export function ItemCard({
  card,
  busy = false,
  onClose,
  onAction,
  onJournal,
}: {
  card: ItemCardData;
  busy?: boolean;
  onClose: () => void;
  onAction?: (action: EncounterAction) => void;
  /** Keeps the thing in the journal. Without it there is no such row. */
  onJournal?: (text: string) => void;
}) {
  const t = useTranslate();
  const type = useTypeWord(card);
  const [main, ...rest] = card.actions;
  const run = (action: EncounterAction) => {
    onClose();
    onAction?.(action);
  };
  const more: MenuItem[] = [
    ...rest.map((choice) => ({
      label: choice.label,
      disabled: busy || !!choice.blocked,
      ...(choice.blocked ? { reason: choice.blocked } : {}),
      onSelect: () => run(choice.action),
    })),
    ...(onJournal
      ? [
          {
            label: t("icAddToJournal"),
            onSelect: () => {
              onJournal(
                card.readableContent ??
                  `${card.name}${card.description ? `: ${card.description}` : ""}`,
              );
              onClose();
            },
          },
        ]
      : []),
  ];
  const actions = (main || more.length > 0) && (
    <div className="item-card__actions">
      {main && (
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={busy || !!main.blocked}
          title={main.blocked}
          onClick={() => run(main.action)}
        >
          {main.label}
        </button>
      )}
      {more.length > 0 && (
        <MenuButton label={t("icMore")} items={more} className="item-card__more" />
      )}
    </div>
  );
  if (card.readableContent)
    return (
      <Modal title={card.name} onClose={onClose} bare>
        <Frame className="item-card item-card--note">
          <button
            type="button"
            className="sb-icon item-card__close"
            onClick={onClose}
            aria-label={t("closeDialog")}
          >
            ×
          </button>
          <NamePlate as="h3" className="item-card__name">
            {card.name}
          </NamePlate>
          <NoteCard className="inventory-detail__reading item-card__note">
            <h3>{t("icRead")}</h3>
            <p>{card.readableContent}</p>
          </NoteCard>
          {actions}
        </Frame>
      </Modal>
    );
  const sentences = card.uses.map((use) =>
    use.kind === "opens"
      ? t("icOpens", { name: use.text })
      : use.kind === "needs"
        ? t("icNeeds", { text: use.text })
        : t("icAction", { label: use.text }),
  );
  return (
    <Modal title={card.name} onClose={onClose} bare>
      <Frame className="item-card">
        <button
          type="button"
          className="sb-icon item-card__close"
          onClick={onClose}
          aria-label={t("closeDialog")}
        >
          ×
        </button>
        <NamePlate as="h3" className="item-card__name">
          {card.name}
        </NamePlate>
        <p className="item-card__type">
          {type}
          {card.container ? ` · ${card.container}` : ""}
        </p>
        <div className="item-card__visual">
          {card.imageDataUrl ? (
            <img src={card.imageDataUrl} alt={card.name} />
          ) : (
            <ItemIcon name={card.icon} size={72} />
          )}
        </div>
        <p className="item-card__description">{card.description || t("icCarrying")}</p>
        {(card.kind === "ammunition" || card.kind === "resource") && (
          <p>
            {t("icAmount")}: <strong>{card.quantity}</strong>
          </p>
        )}
        {sentences.length > 0 && (
          <section aria-label={t("icWhatItDoes")} className="item-card__part">
            <h4>{t("icWhatItDoes")}</h4>
            <ul>
              {sentences.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </section>
        )}
        {card.rules.length > 0 && (
          <section aria-label={t("icRules")} className="item-card__part">
            <h4>{t("icRules")}</h4>
            <dl>
              {card.rules.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {card.origin && (
          <section aria-label={t("icFound")} className="item-card__part">
            <h4>{t("icFound")}</h4>
            <p>
              {card.origin.minutes === undefined
                ? card.origin.place
                : t("icFoundAt", {
                    place: card.origin.place,
                    day: String(Math.floor(card.origin.minutes / 1440) + 1),
                  })}
            </p>
          </section>
        )}
        {actions}
      </Frame>
    </Modal>
  );
}
