// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DiceRollSurface, ROLL_EXIT_MS } from '../../src/ui/components/DiceRollSurface';
import { RollResult } from '../../src/ui/components/RollResult';

beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false })); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('keeps the same dice during dismissal, blocks duplicate confirmation and continues only after fading', async () => {
  const host = document.createElement('div'), root = createRoot(host), rolled = vi.fn(), closed = vi.fn(), disposed = vi.fn();
  function Dice() { useEffect(() => { rolled(); return disposed; }, []); return <div className="action-check__tray">37</div>; }
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? <DiceRollSurface label="Resolved dice roll" onClosed={() => { closed(); setOpen(false); }}>{(close, closing) => <><Dice/><RollResult roll={37} target={60} closing={closing} onConfirm={close}/></>}</DiceRollSurface> : null;
  }
  try {
    await act(async () => root.render(<Harness/>)); const button = host.querySelector('button')!;
    await act(async () => { button.click(); button.click(); });
    expect(host.querySelector('[data-closing=true]')).not.toBeNull(); expect(button.disabled).toBe(true); expect(closed).not.toHaveBeenCalled(); expect(rolled).toHaveBeenCalledTimes(1); expect(disposed).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(ROLL_EXIT_MS - 1)); expect(closed).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1)); expect(closed).toHaveBeenCalledTimes(1); expect(rolled).toHaveBeenCalledTimes(1); expect(disposed).toHaveBeenCalledTimes(1); expect(host.querySelector('section')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
it('dismisses immediately when reduced motion is enabled', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true })); const host = document.createElement('div'), root = createRoot(host), closed = vi.fn();
  try { await act(async () => root.render(<DiceRollSurface label="Result" onClosed={closed}>{close => <button onClick={close}>OK</button>}</DiceRollSurface>)); await act(async () => host.querySelector('button')!.click()); expect(closed).toHaveBeenCalledTimes(1); }
  finally { await act(async () => root.unmount()); }
});
it('cancels a pending continuation when the scene is unmounted', async () => {
  const host = document.createElement('div'), root = createRoot(host), closed = vi.fn();
  await act(async () => root.render(<DiceRollSurface label="Result" onClosed={closed}>{close => <button onClick={close}>OK</button>}</DiceRollSurface>));
  await act(async () => host.querySelector('button')!.click()); await act(async () => root.unmount()); await vi.advanceTimersByTimeAsync(ROLL_EXIT_MS); expect(closed).not.toHaveBeenCalled();
});
