import { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { UPDATE_DOWNLOADS, UpdateProvider, useUpdates } from './UpdateProvider';

export function CheckUpdates() {
  const updates = useUpdates();
  return updates ? <UpdateButton/> : <UpdateProvider><UpdateButton/></UpdateProvider>;
}
function UpdateButton() {
  const updates = useUpdates()!, [openError, setOpenError] = useState('');
  async function openDownload() {
    setOpenError('');
    try { if (isTauri()) await openUrl(UPDATE_DOWNLOADS); else window.open(UPDATE_DOWNLOADS, '_blank', 'noopener,noreferrer'); }
    catch { setOpenError('Could not open the browser. Visit kaampi/Explore on GitHub for downloads.'); }
  }
  return <div className="sb-update-check">
    <button type="button" className="sb-button" data-update-available={updates.available} disabled={updates.checking} onClick={() => { setOpenError(''); if (updates.available) void openDownload(); else void updates.check(true); }}>{updates.checking ? 'Checking…' : updates.available ? 'Update available' : 'Check for updates'}</button>
    {(updates.message || openError) && <p role="status">{openError || updates.message}</p>}
    {updates.message && !updates.available && <a href={UPDATE_DOWNLOADS} target="_blank" rel="noreferrer" onClick={event => { if (isTauri()) { event.preventDefault(); void openDownload(); } }}>View available builds</a>}
  </div>;
}
