// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MessageMenu } from '../../src/ui/components/MessageMenu';

it('supports keyboard selection and closes after choosing an action', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), copy = vi.fn(), close = vi.fn();
  try {
    await act(async () => root.render(<MessageMenu x={100} y={100} onClose={close} items={[{label:'Copy',action:copy},{label:'Edit',action:vi.fn()}]} />));
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true})));
    expect(document.activeElement).toBe(buttons[1]);
    await act(async () => buttons[0]!.click());
    expect(copy).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
