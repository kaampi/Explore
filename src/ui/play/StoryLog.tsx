import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { formatGameTime } from "../../state/gameClock";
import { useTranslate } from "../i18n/LanguageProvider";
import type { StoryRow } from "./storyRows";
import { CheckCard, Divider, Frame, NamePlate } from "./ornament";

/** Words only get quotes when nobody has put any in: an answer that tells and quotes is left as it is. */
const HAS_QUOTE = /[“”"«»]/;
const quoted = (text: string) => (HAS_QUOTE.test(text) ? text : `“${text}”`);

/**
 * The story: running prose, what the player said and did, what people said, and the rolls, each
 * in its own look. A line shows "Save idea" (and "Remember this" for a line the AI improvised)
 * when it is pointed at or has focus. New lines are announced to a screen reader.
 */
export function StoryLog({
  rows,
  draftReply,
  hidden,
  showTime,
  hasEarlier,
  earlier,
  onToggleEarlier,
  canRemember,
  onSaveIdea,
  onRemember,
  onRowMenu,
}: {
  rows: StoryRow[];
  /** A reply that is being written. It is not a settled line yet. */
  draftReply?: string;
  hidden?: boolean;
  /** Whether game time is shown on the dividers: when the adventure has travel times. */
  showTime: boolean;
  hasEarlier: boolean;
  earlier: boolean;
  onToggleEarlier: () => void;
  canRemember: boolean;
  onSaveIdea?: ((turn: number) => void) | undefined;
  onRemember?: ((row: Extract<StoryRow, { kind: "person" }>) => void) | undefined;
  onRowMenu: (
    event: MouseEvent,
    row: Extract<StoryRow, { kind: "narrator" | "say" | "do" | "person" }>,
  ) => void;
}) {
  const t = useTranslate();
  const log = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const atBottom = useRef(true);
  const count = rows.length + (draftReply ? 1 : 0);
  // One tab stop for the whole story: the row that is current. The arrow keys move between rows,
  // and only the current row's buttons can be tabbed to. Before any move it is the newest row.
  const [picked, setPicked] = useState<string | null>(null);
  const current = rows.find((row) => row.key === picked)?.key ?? rows.at(-1)?.key;
  const nav = (key: string) => ({
    "data-row-key": key,
    tabIndex: key === current ? 0 : -1,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      // Focus on the row itself, not on one of its buttons.
      if (event.target === event.currentTarget) setPicked(key);
    },
  });
  const moveRow = (event: KeyboardEvent<HTMLElement>) => {
    const keys: Record<string, (at: number, last: number) => number> = {
      ArrowDown: (at, last) => Math.min(at + 1, last),
      ArrowUp: (at) => Math.max(at - 1, 0),
      Home: () => 0,
      End: (_, last) => last,
    };
    const go = keys[event.key];
    if (!go || rows.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const at = Math.max(
      0,
      rows.findIndex((row) => row.key === current),
    );
    const next = rows[go(at, rows.length - 1)]!;
    setPicked(next.key);
    const element = Array.from(
      log.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? [],
    ).find((el) => el.dataset.rowKey === next.key);
    element?.focus();
    element?.scrollIntoView?.({ block: "nearest" });
  };
  useEffect(() => {
    if (atBottom.current)
      log.current?.scrollTo?.({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [count]);
  const degree = {
    exceptional: t("pvDegreeExceptional"),
    success: t("pvDegreeSuccess"),
    failure: t("pvDegreeFailure"),
    severe: t("pvDegreeSevere"),
  };
  const actions = (row: Extract<StoryRow, { kind: "narrator" | "say" | "do" | "person" }>) => (
    <span className="play-row__actions">
      {onSaveIdea && (
        <button
          type="button"
          className="play-row__action"
          tabIndex={row.key === current ? 0 : -1}
          aria-label={t("pvSaveIdeaRow")}
          onClick={() => onSaveIdea(row.turn)}
        >
          {t("pvSaveIdea")}
        </button>
      )}
      {canRemember && row.kind === "person" && row.improvised && onRemember && (
        <button
          type="button"
          className="play-row__action"
          tabIndex={row.key === current ? 0 : -1}
          onClick={() => onRemember(row)}
        >
          {t("rememberThis")}
        </button>
      )}
    </span>
  );
  return (
    <Frame as="section" className="play-story" aria-label={t("pvStory")} hidden={hidden}>
      <header className="play-story__head">
        <NamePlate>{t("pvStory")}</NamePlate>
        {hasEarlier && (
          <button
            type="button"
            className="play-story__earlier"
            aria-pressed={earlier}
            onClick={onToggleEarlier}
          >
            {t("pvEarlier")}
          </button>
        )}
      </header>
      <div
        className="chat-log play-story__log"
        ref={log}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onKeyDown={moveRow}
        onScroll={(event) => {
          const el = event.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          atBottom.current = near;
          setAway(!near);
        }}
      >
        {rows.map((row) => {
          if (row.kind === "divider")
            return (
              <Divider key={row.key} {...nav(row.key)} className="play-row play-row--divider">
                <span>{row.place}</span>
                {showTime && <time>{formatGameTime(row.minutes)}</time>}
              </Divider>
            );
          if (row.kind === "goal")
            return (
              <div key={row.key} {...nav(row.key)} className="play-row play-row--goal">
                <span aria-hidden="true">✓</span>&nbsp;{t("pvGoalReached", { goal: row.title })}
              </div>
            );
          if (row.kind === "check")
            return (
              <CheckCard
                key={row.key}
                {...nav(row.key)}
                roll={row.roll}
                className="play-row play-row--check"
              >
                <span aria-hidden="true">◇</span>
                <span className="visually-hidden">{t("pvRollLabel")}: </span>
                {row.skill} · {row.roll} / {row.target} · {degree[row.degree]}
                {row.damage ? ` · ${row.damage}` : ""}
              </CheckCard>
            );
          const menu = (event: MouseEvent) => onRowMenu(event, row);
          if (row.kind === "narrator")
            return (
              <div
                key={row.key}
                {...nav(row.key)}
                className="play-row play-row--narrator"
                onContextMenu={menu}
              >
                <p>{row.text}</p>
                {actions(row)}
              </div>
            );
          if (row.kind === "say")
            return (
              <div
                key={row.key}
                {...nav(row.key)}
                className="play-row play-row--say"
                onContextMenu={menu}
              >
                <span className="play-row__label">{t("pvYouSay")}</span>
                <blockquote>{quoted(row.text)}</blockquote>
                {actions(row)}
              </div>
            );
          if (row.kind === "do")
            return (
              <div
                key={row.key}
                {...nav(row.key)}
                className="play-row play-row--do"
                onContextMenu={menu}
              >
                <span className="play-row__label">{t("pvYouDo")}</span>
                <p>{row.label}</p>
                {actions(row)}
              </div>
            );
          return (
            <div
              key={row.key}
              {...nav(row.key)}
              className="play-row play-row--person"
              onContextMenu={menu}
            >
              <span className="play-row__label play-row__label--person">
                {row.name}
                {row.improvised && <small className="play-row__mark">{t("pvImprovised")}</small>}
              </span>
              <blockquote>{quoted(row.text)}</blockquote>
              {actions(row)}
            </div>
          );
        })}
        {draftReply && (
          <div className="play-row play-row--narrator" aria-busy="true">
            <p>{draftReply}</p>
          </div>
        )}
      </div>
      {away && (
        <button
          type="button"
          className="play-story__latest"
          onClick={() => {
            atBottom.current = true;
            setAway(false);
            log.current?.scrollTo?.({ top: log.current.scrollHeight, behavior: "smooth" });
          }}
        >
          ↓ {t("pvToLatest")}
        </button>
      )}
    </Frame>
  );
}
