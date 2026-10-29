import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "../components/Modal";

export function CodexConnection() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ paired: false, reachable: false });
  const [attempt, setAttempt] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();
  async function refresh() { setStatus(await invoke("core_connection")); }
  useEffect(() => { if (open && desktop) void refresh().catch(reason => setError(String(reason))); }, [open, desktop]);
  useEffect(() => {
    if (!attempt) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= Date.parse(attempt.expiresAt)) { setAttempt(null); setError("The request expired. Connect again to retry."); return; }
      try {
        const response = await invoke<{ state: string }>("core_poll");
        if (cancelled) return;
        if (response.state === "connected") { setAttempt(null); await refresh(); return; }
        if (response.state === "denied") { setAttempt(null); setError("The connection was declined in Codex."); return; }
        timer = setTimeout(() => void poll(), 2000);
      } catch (reason) { if (!cancelled) { setAttempt(null); setError(String(reason)); } }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attempt]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }
  return <><button type="button" onClick={() => setOpen(true)}>⇄ <span>kaampi Codex</span></button>
    {open && <Modal title="Connect to kaampi Codex" onClose={() => setOpen(false)}>
      <p>Connect Explore to the Codex service on this computer. Each app keeps ownership of its own content.</p>
      {!desktop ? <p>This connection is available in the Windows desktop app. The browser version keeps its existing server connection.</p> : <>
        <p role="status">{status.paired ? status.reachable ? "Connected to Codex." : "Paired. Codex is currently unavailable." : "Explore is not connected to Codex."}</p>
        {attempt ? <div className="codex-pairing-request"><strong>Waiting for approval · {attempt.code}</strong><p>Open Codex, find kaampi Explore under Anslut appar, compare this code and choose Tillåt. The request expires after five minutes.</p>
          <button className="sb-button" onClick={() => void run(() => openUrl("http://127.0.0.1:43127/admin"))}>Open Codex</button>
        </div> : !status.paired && <button className="sb-button" disabled={busy} onClick={() => void run(async () => { setAttempt(await invoke("core_begin")); })}>Connect to kaampi Codex</button>}
        {status.paired && <div className="sb-dialog__actions"><button className="sb-button" disabled={busy} onClick={() => void run(refresh)}>Check connection</button><button className="sb-button" disabled={busy} onClick={() => void run(async () => { await invoke("core_disconnect"); setAttempt(null); await refresh(); })}>Disconnect this device</button></div>}
      </>}
      {error && <p role="alert">{error}</p>}
    </Modal>}
  </>;
}
