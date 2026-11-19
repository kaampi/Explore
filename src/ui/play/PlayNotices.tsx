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

export type Shown = Notice & { id: number };

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

const labelKey = {
  learned: "pvNoticeLearned",
  item: "pvNoticeItem",
  unlocked: "pvNoticeUnlocked",
  goal: "pvNoticeGoal",
} as const;

/** Where you came to: a short card over the top of the story. It makes no sound. */
export function PlayArrival({ arrival }: { arrival: (Arrival & { id: number }) | null }) {
  const t = useTranslate();
  return (
    <div className="play-arrival-layer" role="status" aria-live="polite">
      {arrival && (
        <div className="play-arrival" key={arrival.id}>
          {arrival.minutes > 0 && (
            <small>{t("pvLater", { time: formatTravelTime(arrival.minutes) })}</small>
          )}
          <strong>{arrival.place}</strong>
        </div>
      )}
    </div>
  );
}

/**
 * The short marks for finding something out, getting something or opening the way. They are a
 * strip of their own above "What do you do?", so they never cover a line of the story.
 */
export function PlayNoticeStrip({ notices }: { notices: Shown[] }) {
  const t = useTranslate();
  return (
    <div className="play-notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`play-notice play-notice--${notice.kind}`}>
          <span>{t(labelKey[notice.kind])}</span> {notice.text}
        </div>
      ))}
    </div>
  );
}
