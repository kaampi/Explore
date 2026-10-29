import { invoke, isTauri } from "@tauri-apps/api/core";
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

/** Desktop opens an installed sibling; browsers retain their existing window behavior. */
export async function openCompanionApp(app: CompanionAppId, address: string): Promise<void> {
  if (isTauri()) { await invoke("open_companion_app", { appId: app }); return; }
  openCompanionWindow(app, address);
}
