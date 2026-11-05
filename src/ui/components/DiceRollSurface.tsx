import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './roll-result.css';

export const ROLL_EXIT_MS = 320;
/** Keep the resolved dice mounted until their exit animation finishes. Never reroll on dismissal. */
export function DiceRollSurface({ label, onClosed, children }: {
  label: string; onClosed: () => void; children: (close: () => void, closing: boolean) => ReactNode;
}) {
  const [closing, setClosing] = useState(false), started = useRef(false), timer = useRef<number>();
  const done = useRef(onClosed); done.current = onClosed;
  const close = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { done.current(); return; }
    setClosing(true);
    timer.current = window.setTimeout(() => done.current(), ROLL_EXIT_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <section className="chat-dice-roll" data-closing={closing} aria-label={label} style={{ '--roll-exit-duration': `${ROLL_EXIT_MS}ms` } as CSSProperties}>
    {children(close, closing)}
  </section>;
}
