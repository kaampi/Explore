import type { CompanionAppId } from "./localApps";

const windows = new Map<CompanionAppId, { window: Window; address: string }>();

export function openCompanionWindow(app: CompanionAppId, address: string): void {
  const existing = windows.get(app);
  if (existing && !existing.window.closed) {
    if (existing.address !== address) {
      existing.window.location.href = address;
      existing.address = address;
    }
    existing.window.focus();
    return;
  }
  const opened = window.open(address, `kaampi-${app}`);
  if (opened) {
    opened.opener = null;
    windows.set(app, { window: opened, address });
    opened.focus();
  }
}
