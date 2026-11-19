import { useEffect, useRef, useState } from "react";
import type { Session } from "../../state/StateSchema";
import { formatTravelTime } from "../../state/gameClock";
import { useTranslate } from "../i18n/LanguageProvider";
import { arrivalBetween, notableEvents, type Arrival, type Notice } from "./notableEvents";
import "./play-view.css";

/** How long a mark stays, and how long the arrival stays. */
export const NOTICE_MS = 3000;
export const ARRIVAL_MS = 1200;
/** No more than this many marks at once. The oldest go first. */
const MAX_NOTICES = 3;

type Shown = Notice & { id: number };

/** What to show now: the marks and the arrival, kept for a few seconds each. */
export function useNotices(session: Session) {
  const previous = useRef(session);
  const counter = useRef(0);
  const timers = useRef(new Set<number>());
  const [notices, setNotices] = useState<Shown[]>([]);
  const [arrival, setArrival] = useState<(Arrival & { id: number }) | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = session;
    if (before === session) return;
    const found = notableEvents(before, session);
    const came = arrivalBetween(before, session);
    const later = (action: () => void, ms: number) => {
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        action();
      }, ms);
      timers.current.add(timer);
    };
    if (found.length) {
      const shown = found.map((notice) => ({ ...notice, id: ++counter.current }));
      setNotices((current) => [...current, ...shown].slice(-MAX_NOTICES));
      for (const notice of shown)
        later(() => setNotices((current) => current.filter((x) => x.id !== notice.id)), NOTICE_MS);
    }
    if (came) {
      const id = ++counter.current;
      setArrival({ ...came, id });
      later(() => setArrival((current) => (current?.id === id ? null : current)), ARRIVAL_MS);
    }
  }, [session]);
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );
  return { notices, arrival };
}

/**
 * The short marks over the story: where you came to, and when you find something out, get
 * something or open the way. They make no sound and keep out of the way of the clicks.
 */
export function PlayNotices({ session }: { session: Session }) {
  const t = useTranslate();
  const { notices, arrival } = useNotices(session);
  const label: Record<Notice["kind"], string> = {
    learned: t("pvNoticeLearned"),
    item: t("pvNoticeItem"),
    unlocked: t("pvNoticeUnlocked"),
    goal: t("pvNoticeGoal"),
  };
  return (
    <div className="play-notices" role="status" aria-live="polite">
      {arrival && (
        <div className="play-arrival" key={arrival.id}>
          {arrival.minutes > 0 && (
            <small>{t("pvLater", { time: formatTravelTime(arrival.minutes) })}</small>
          )}
          <strong>{arrival.place}</strong>
        </div>
      )}
      <div className="play-notices__stack">
        {notices.map((notice) => (
          <div key={notice.id} className={`play-notice play-notice--${notice.kind}`}>
            <span>{label[notice.kind]}</span> {notice.text}
          </div>
        ))}
      </div>
    </div>
  );
}
